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
  areaApiResponses: []
};

page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
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
  if (!response.url().includes("/api/geography/areas")) return;
  let summary = {};
  const responseHeaders = response.headers();
  try {
    const body = await response.json();
    summary = {
      type: body?.type ?? null,
      featureCount: Array.isArray(body?.features) ? body.features.length : null,
      error: body?.error ?? body?.message ?? null,
      providerWarning: body?.providerWarning ?? null,
      unavailableProviders: body?.unavailableProviders ?? null,
      fallbackStatus: body?.fallbackStatus ?? responseHeaders["x-parcel-fallback-status"] ?? null,
      fallbackReason: body?.fallbackReason ?? responseHeaders["x-parcel-fallback-reason"] ?? null,
      fallbackSource: responseHeaders["x-parcel-fallback-source"] ?? null
    };
  } catch (error) {
    summary = {
      parseError: error instanceof Error ? error.message : String(error),
      fallbackStatus: responseHeaders["x-parcel-fallback-status"] ?? null,
      fallbackReason: responseHeaders["x-parcel-fallback-reason"] ?? null,
      fallbackSource: responseHeaders["x-parcel-fallback-source"] ?? null
    };
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
        testWindow.__RLI_E2E_MAP_ERRORS__.push(error?.message ?? String(error ?? "MapLibre style error"));
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

  // Cloudflare may need one bounded GIS request plus the Vercel fallback.
  // Wait for real parcel source features, not just an arbitrary short delay.
  // Keep the timeout bounded so a broken source still produces diagnostics.
  await page.waitForFunction(() => {
    const map = window.__RLI_E2E_MAP__;
    if (!map) return false;
    try {
      return map.querySourceFeatures("land-parcels").length > 0;
    } catch {
      return false;
    }
  }, undefined, { timeout: 40_000 }).catch(() => {});

  // Only issue a second direct API request if the map did not load parcels.
  // Avoid duplicating a slow GIS/fallback request when the visible map already
  // proves that the API supplied cadastral features.
  const parcelSourceCountBeforeProbe = await page.evaluate(() => {
    const map = window.__RLI_E2E_MAP__;
    if (!map) return 0;
    try {
      return map.querySourceFeatures("land-parcels").length;
    } catch {
      return 0;
    }
  });
  const directParcelApi = parcelSourceCountBeforeProbe > 0
    ? {
        skipped: true,
        reason: "Map already loaded cadastral features; avoiding a duplicate GIS request.",
        featureCount: parcelSourceCountBeforeProbe
      }
    : await page.evaluate(async () => {
        const url = "/api/geography/areas?level=parcel&source=bugesera&bbox=" +
          encodeURIComponent("30.12,-2.30,30.15,-2.26");
        try {
          const response = await fetch(url, {
            cache: "no-store",
            signal: AbortSignal.timeout(25_000)
          });
          const body = await response.json().catch(() => null);
          return {
            url,
            status: response.status,
            type: body?.type ?? null,
            featureCount: Array.isArray(body?.features) ? body.features.length : null,
            error: body?.error ?? body?.message ?? null,
            unavailableProviders: body?.unavailableProviders ?? null,
            fallbackStatus: body?.fallbackStatus ?? response.headers.get("x-parcel-fallback-status"),
            fallbackReason: body?.fallbackReason ?? response.headers.get("x-parcel-fallback-reason"),
            fallbackSource: response.headers.get("x-parcel-fallback-source")
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

  const removedPanelCount = await page.locator(".map-focus-panel").count();
  const exploreAreaTextCount = await page.getByText("EXPLORE AREA", { exact: true }).count();
  const parcelBoundariesTextCount = await page.getByText("PARCEL BOUNDARIES", { exact: true }).count();
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const summary = {
    status: result.renderedParcelOutlineFeatures > 0 ? "passed" : "failed",
    url: baseUrl,
    zoomLevel: "village",
    ...result,
    directParcelApi,
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
