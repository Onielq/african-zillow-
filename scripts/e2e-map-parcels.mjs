import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = (process.env.APP_BASE_URL ?? "https://rwanda-land-intelligence.taiseel.workers.dev").replace(/\/$/, "");
const screenshotPath = "artifacts/village-parcel-boundaries.png";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1
});
const diagnostics = {
  pageErrors: [],
  consoleErrors: [],
  failedRequests: [],
  areaApiResponses: [],
  esriStyleResponses: [],
  arcgisImageResponses: []
};

const redactCredentials = (value) => String(value).replace(
  /([?&](?:token|access_token)=)[^&"'<> ]+/gi,
  "$1[redacted]"
);

page.on("pageerror", (error) => diagnostics.pageErrors.push(redactCredentials(error.message)));
page.on("console", (message) => {
  if (message.type() === "error") diagnostics.consoleErrors.push(redactCredentials(message.text()));
});
page.on("requestfailed", (request) => {
  if (request.url().includes("/api/geography/areas")) {
    diagnostics.failedRequests.push({
      url: request.url(),
      error: request.failure()?.errorText ?? "request failed"
    });
  }
});
page.on("response", async (response) => {
  let requestUrl;
  try {
    requestUrl = new URL(response.url());
  } catch {
    requestUrl = null;
  }

  // Record only sanitized host/path/status metadata; never store token query strings.
  if (
    requestUrl?.hostname === "basemapstyles-api.arcgis.com" &&
    requestUrl.pathname.endsWith("/styles/arcgis/imagery/standard")
  ) {
    diagnostics.esriStyleResponses.push({
      status: response.status(),
      path: requestUrl.pathname
    });
  }
  const isArcgisHost = Boolean(requestUrl && (
    requestUrl.hostname.endsWith(".arcgis.com") ||
    requestUrl.hostname.endsWith(".arcgisonline.com")
  ));
  if (
    isArcgisHost &&
    requestUrl.hostname !== "basemapstyles-api.arcgis.com" &&
    response.request().resourceType() === "image"
  ) {
    diagnostics.arcgisImageResponses.push({
      host: requestUrl.hostname,
      path: requestUrl.pathname.slice(0, 120),
      status: response.status()
    });
  }

  if (!response.url().includes("/api/geography/areas")) return;
  let summary = {};
  try {
    const body = await response.json();
    summary = {
      type: body?.type ?? null,
      featureCount: Array.isArray(body?.features) ? body.features.length : null,
      error: body?.error ?? body?.message ?? null,
      providerWarning: body?.providerWarning ?? null
    };
  } catch (error) {
    summary = { parseError: error instanceof Error ? error.message : String(error) };
  }
  diagnostics.areaApiResponses.push({
    url: response.url(),
    status: response.status(),
    ...summary
  });
});

try {
  await mkdir("artifacts", { recursive: true });
  const response = await page.goto(baseUrl + "/?rli_e2e=1", {
    waitUntil: "domcontentloaded",
    timeout: 90_000
  });
  if (!response?.ok()) {
    throw new Error("App homepage failed: HTTP " + (response?.status() ?? "no response"));
  }

  await page.waitForFunction(() => Boolean(window.__RLI_E2E_MAP__), undefined, { timeout: 30_000 });
  await page.evaluate(() => {
    const testWindow = window;
    const map = window.__RLI_E2E_MAP__;
    if (map) {
      testWindow.__RLI_E2E_MAP_ERRORS__ = [];
      map.on("error", (event) => {
        const error = event?.error;
        const message = error?.message ?? String(error ?? "MapLibre style error");
        testWindow.__RLI_E2E_MAP_ERRORS__.push(
          message.replace(/([?&](?:token|access_token)=)[^&"'<> ]+/gi, "$1[redacted]")
        );
      });
    }
  });
  await page.waitForFunction(() => {
    const map = window.__RLI_E2E_MAP__;
    return Boolean(map && map.isStyleLoaded());
  }, undefined, { timeout: 90_000 });

  await page.evaluate(() => {
    const map = window.__RLI_E2E_MAP__;
    if (!map) throw new Error("Opt-in test map was not exposed.");
    map.jumpTo({ center: [30.133, -2.283], zoom: 16.6 });
  });

  // Allow moveend to fire, then record real layer/source/network state even
  // when the visible-layer assertion fails. This avoids hiding the root cause
  // behind a single 60-second timeout.
  await page.waitForTimeout(15_000);

  // Probe the same public endpoint directly from the live site. This separates
  // data/API failures from the map component not requesting or consuming data.
  const directParcelApi = await page.evaluate(async () => {
    const url = "/api/geography/areas?level=parcel&source=bugesera&bbox=" +
      encodeURIComponent("30.12,-2.30,30.15,-2.26");
    try {
      const response = await fetch(url, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      return {
        url,
        status: response.status,
        type: body?.type ?? null,
        featureCount: Array.isArray(body?.features) ? body.features.length : null,
        error: body?.error ?? body?.message ?? null
      };
    } catch (error) {
      return { url, fetchError: error instanceof Error ? error.message : String(error) };
    }
  });

  const result = await page.evaluate(() => {
    const map = window.__RLI_E2E_MAP__;
    if (!map) throw new Error("Map was not available during diagnostics.");
    const featureCount = (sourceId) => {
      try {
        return map.querySourceFeatures(sourceId).length;
      } catch {
        return -1;
      }
    };
    const renderedCount = (layerId) => {
      try {
        if (!map.getLayer(layerId)) return -1;
        return map.queryRenderedFeatures(undefined, { layers: [layerId] }).length;
      } catch {
        return -1;
      }
    };
    const layerState = (layerId) => {
      if (!map.getLayer(layerId)) return { exists: false };
      return {
        exists: true,
        visibility: map.getLayoutProperty(layerId, "visibility") ?? "visible",
        minzoom: map.getLayer(layerId)?.minzoom ?? null,
        maxzoom: map.getLayer(layerId)?.maxzoom ?? null
      };
    };
    const boundaryLayers = map.getStyle().layers
      .filter((layer) => /^(district|sector|cell|village|parcel)-(fill|outline|label)$/.test(layer.id) || layer.id === "parcel-outline-casing")
      .map((layer) => ({
        id: layer.id,
        type: layer.type,
        visibility: map.getLayoutProperty(layer.id, "visibility") ?? "visible"
      }));
    return {
      zoom: Number(map.getZoom().toFixed(2)),
      center: map.getCenter().toArray(),
      styleLoaded: map.isStyleLoaded(),
      villageOutline: layerState("village-outline"),
      parcelOutline: layerState("parcel-outline"),
      parcelFill: layerState("parcel-fill"),
      villageSourceFeatures: featureCount("admin-villages"),
      parcelSourceFeatures: featureCount("land-parcels"),
      renderedVillageOutlineFeatures: renderedCount("village-outline"),
      renderedParcelOutlineFeatures: renderedCount("parcel-outline"),
      renderedParcelFillFeatures: renderedCount("parcel-fill"),
      renderedMapFeatureTotal: map.queryRenderedFeatures().length,
      refreshTrace: window.__RLI_E2E_TRACE__ ?? [],
      boundaryLayers,
      mapLibreErrors: window.__RLI_E2E_MAP_ERRORS__ ?? []
    };
  });

  // Exercise the actual parcel click interaction, not just the visual line layer.
  const parcelClickPoint = await page.evaluate(() => {
    const map = window.__RLI_E2E_MAP__;
    if (!map) return null;
    const rect = map.getContainer().getBoundingClientRect();
    const width = map.getContainer().clientWidth;
    const height = map.getContainer().clientHeight;
    for (let y = Math.max(150, Math.floor(height * 0.24)); y < height - 100; y += 24) {
      for (let x = Math.max(360, Math.floor(width * 0.28)); x < width - 30; x += 24) {
        const hits = map.queryRenderedFeatures([x, y], { layers: ["parcel-fill"] });
        if (hits.length === 0) continue;
        const element = document.elementFromPoint(rect.left + x, rect.top + y);
        if (
          !element ||
          !(element.classList?.contains("maplibregl-canvas") ||
            element.closest?.(".maplibregl-canvas-container"))
        ) continue;
        return { x: rect.left + x, y: rect.top + y };
      }
    }
    return null;
  });

  let parcelInfoPopup = { visible: false, attempted: false, panelText: null };
  if (parcelClickPoint) {
    parcelInfoPopup.attempted = true;
    await page.mouse.click(parcelClickPoint.x, parcelClickPoint.y);
    try {
      await page.waitForFunction(() => {
        const panel = document.querySelector(".selected-area-panel");
        const level = panel?.querySelector(".panel-eyebrow")?.textContent?.trim().toUpperCase();
        return level === "PARCEL" && Boolean(panel?.querySelector(".parcel-details"));
      }, undefined, { timeout: 8_000 });
      parcelInfoPopup = await page.evaluate(() => {
        const panel = document.querySelector(".selected-area-panel");
        const level = panel?.querySelector(".panel-eyebrow")?.textContent?.trim().toUpperCase();
        const details = panel?.querySelector(".parcel-details");
        return {
          visible: level === "PARCEL" && Boolean(details),
          attempted: true,
          panelText: panel?.innerText?.slice(0, 1_200) ?? null
        };
      });
    } catch {
      parcelInfoPopup.visible = false;
    }
  }

  const removedPanelCount = await page.locator(".map-focus-panel").count();
  const exploreAreaTextCount = await page.getByText("EXPLORE AREA", { exact: true }).count();
  const parcelBoundariesTextCount = await page.getByText("PARCEL BOUNDARIES", { exact: true }).count();
  // Preserve the parcel-line screenshot before changing to satellite mode.
  await page.screenshot({ path: screenshotPath, fullPage: false });

  // Validate the real Esri style endpoint and at least one successful imagery
  // tile request in a browser; a successful application build is not sufficient.
  await page.getByRole("button", { name: /^Satellite$/i }).click();
  await page.waitForFunction(() => {
    const map = window.__RLI_E2E_MAP__;
    return Boolean(map && map.isStyleLoaded());
  }, undefined, { timeout: 45_000 }).catch(() => null);
  await page.waitForTimeout(3_000);

  const satelliteState = await page.evaluate(() => {
    const map = window.__RLI_E2E_MAP__;
    const style = map?.getStyle();
    const sources = Object.values(style?.sources ?? {});
    const sourceUrls = sources.flatMap((source) => [
      typeof source.url === "string" ? source.url : null,
      ...(Array.isArray(source.tiles) ? source.tiles : [])
    ]).filter((url) => typeof url === "string");
    const sourceHosts = [...new Set(sourceUrls.map((url) => {
      try { return new URL(url).hostname; } catch { return ""; }
    }).filter(Boolean))];
    return {
      styleLoaded: Boolean(map?.isStyleLoaded()),
      sourceCount: sources.length,
      sourceHosts,
      zoom: map ? Number(map.getZoom().toFixed(2)) : null
    };
  });

  const esriStyleOk = diagnostics.esriStyleResponses.some((entry) => entry.status >= 200 && entry.status < 300);
  const esriTileHosts = satelliteState.sourceHosts.filter((host) =>
    host.endsWith(".arcgis.com") && host !== "basemapstyles-api.arcgis.com"
  );
  const successfulEsriImageryTile = diagnostics.arcgisImageResponses.some((entry) =>
    esriTileHosts.includes(entry.host) && entry.status >= 200 && entry.status < 300
  );
  const satellite = {
    status: satelliteState.styleLoaded && esriStyleOk && successfulEsriImageryTile ? "passed" : "failed",
    styleLoaded: satelliteState.styleLoaded,
    esriStyleResponses: diagnostics.esriStyleResponses,
    esriTileHosts,
    successfulEsriImageryTile,
    matchingImageryResponses: diagnostics.arcgisImageResponses.filter((entry) => esriTileHosts.includes(entry.host)).slice(0, 12)
  };

  const summary = {
    status: result.renderedParcelOutlineFeatures > 0 ? "passed" : "failed",
    url: baseUrl,
    zoomLevel: "village",
    ...result,
    directParcelApi,
    parcelInfoPopup,
    satellite,
    removedPanelCount,
    exploreAreaTextCount,
    parcelBoundariesTextCount,
    ...diagnostics,
    screenshot: screenshotPath
  };
  console.log(JSON.stringify(summary, null, 2));

  if (removedPanelCount !== 0 || exploreAreaTextCount !== 0 || parcelBoundariesTextCount !== 0) {
    throw new Error("The redundant map focus panels are still present in the rendered page.");
  }
  if (result.renderedParcelOutlineFeatures <= 0) {
    throw new Error("No cadastral parcel outlines rendered at village zoom. See map/source/network diagnostics above.");
  }
  if (!parcelInfoPopup.visible) {
    throw new Error("A visible parcel polygon could not open its parcel information panel. See map/source/network diagnostics above.");
  }
  if (!satellite.styleLoaded || !satellite.esriStyleResponses.some((entry) => entry.status >= 200 && entry.status < 300)) {
    throw new Error("Esri Imagery Standard style did not return a successful HTTP response. Check ESRI_API_KEY, its Basemap Styles privilege, and allowed referrers.");
  }
  if (!satellite.successfulEsriImageryTile) {
    throw new Error("Esri returned the style, but no successful imagery tile was received from an ArcGIS basemap source.");
  }
  if (diagnostics.pageErrors.length > 0) {
    throw new Error("Browser runtime errors: " + diagnostics.pageErrors.join(" | "));
  }
} catch (error) {
  await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
  console.error(error instanceof Error ? error.stack : String(error));
  console.error(JSON.stringify({ ...diagnostics, screenshot: screenshotPath }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
