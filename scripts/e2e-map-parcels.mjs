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
  placeApiResponses: [],
  basemapTileResponses: [],
  failedBasemapTileRequests: []
};

page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
});
page.on("requestfailed", (request) => {
  const url = request.url();
  if (url.includes("/api/geography/areas") || url.includes("/api/geography/places")) {
    diagnostics.failedRequests.push({
      url,
      error: request.failure()?.errorText ?? "request failed"
    });
  }
  if (/ArcGIS\/rest\/services\/(World_Imagery|Reference\/World_Transportation)\/MapServer\/tile\//i.test(url)) {
    const error = request.failure()?.errorText ?? "request failed";
    // MapLibre cancels tile requests that leave the viewport during zoom/pan.
    // Those are expected cancellations, not failed image responses.
    if (error !== "net::ERR_ABORTED") {
      diagnostics.failedBasemapTileRequests.push({ url, error });
    }
  }
});
page.on("response", async (response) => {
  const responseUrl = response.url();
  if (/ArcGIS\/rest\/services\/(World_Imagery|Reference\/World_Transportation)\/MapServer\/tile\//i.test(responseUrl)) {
    diagnostics.basemapTileResponses.push({
      url: responseUrl,
      status: response.status()
    });
  }
  if (responseUrl.includes("/api/geography/places")) {
    const headers = response.headers();
    const entry = {
      url: responseUrl,
      status: response.status(),
      contentType: headers["content-type"] ?? null,
      stage: headers["x-overlay-stage"] ?? null,
      cfRay: headers["cf-ray"] ?? null,
      server: headers.server ?? null,
      featureCount: null,
      partial: false,
      warning: null,
      failedCategories: [],
      error: null
    };
    diagnostics.placeApiResponses.push(entry);
    try {
      const rawBody = await response.text();
      let body = {};
      try {
        body = JSON.parse(rawBody);
      } catch {
        Object.assign(entry, { bodySnippet: rawBody.slice(0, 500) });
      }
      Object.assign(entry, {
        featureCount: Array.isArray(body.features) ? body.features.length : null,
        partial: body.partial ?? false,
        warning: body.warning ?? null,
        failedCategories: body.failedCategories ?? [],
        error: body.error ?? null,
        detail: body.detail ?? null
      });
    } catch (error) {
      Object.assign(entry, {
        readError: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }
  if (!responseUrl.includes("/api/geography/areas")) return;
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

  // Context layers must be visible from the first map view without relying
  // on a click, layer toggle, pan or a separate Overpass request.
  await page.getByRole("button", { name: "Show map overlays" }).click();
  const showDefaults = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".show-toggle")).map((label) => {
      const input = label.querySelector('input[type="checkbox"]');
      return {
        name: label.querySelector("span")?.textContent?.trim() ?? "",
        checked: Boolean(input?.checked)
      };
    })
  );
  const enabledByDefault = showDefaults.filter((layer) => layer.checked).map((layer) => layer.name);
  if (enabledByDefault.length !== 1 || enabledByDefault[0] !== "Landmarks") {
    throw new Error("Only Landmarks should be enabled by default in the Show menu: " + JSON.stringify(showDefaults));
  }
  await page.getByRole("button", { name: "Close map layers" }).click();

  const initialOverlayCheck = await page.evaluate(() => {
    const map = window.__RLI_E2E_MAP__;
    return {
      event: "initial-show-defaults",
      enabledByDefault: ["Landmarks"],
      styleLoaded: Boolean(map?.isStyleLoaded()),
      showOverlaySourcePresent: Boolean(map?.getSource("show-overlays")),
      poiLayerPresent: Boolean(map?.getLayer("show-poi-circles"))
    };
  });
  if (!initialOverlayCheck.styleLoaded || !initialOverlayCheck.showOverlaySourcePresent || !initialOverlayCheck.poiLayerPresent) {
    throw new Error("The map style and Show overlay layers must initialize before interaction tests.");
  }

  await page.evaluate(() => {
    const map = window.__RLI_E2E_MAP__;
    if (!map) throw new Error("Opt-in test map was not exposed.");
    map.jumpTo({ center: [30.087, -1.953], zoom: 16.6 });
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
  }, undefined, { timeout: 50_000 }).catch(() => {});

  // Check hover highlighting at every administrative level. The pointer
  // stays in the same screen position while zooming; the map must retarget the
  // highlight to the newly active district/sector/cell/village polygon.
  const hierarchyHoverChecks = [];
  const hoverLevels = [
    { level: "district", startZoom: 8.35, layer: "district-fill", source: "admin-districts" },
    { level: "sector", startZoom: 12.4, layer: "sector-fill", source: "admin-sectors" },
    // Start at the cell layer's actual minzoom. Small Kigali cells may
    // already fill the viewport by 15.5 and transition directly to village,
    // which makes a test starting at 15.5 skip the visible cell interval.
    { level: "cell", startZoom: 15.1, maxZoom: 16.0, waitTimeoutMs: 8_000, layer: "cell-fill", source: "admin-cells" },
    { level: "village", startZoom: 16.6, maxZoom: 16.8, waitTimeoutMs: 10_000, layer: "village-fill", source: "admin-villages" }
  ];

  // These transitions follow the dominant ground dimension of the polygon
  // containing the map centre. Therefore, one fixed zoom per admin level is
  // not a valid assertion for districts/sectors/cells/villages of different shapes.
  async function findVisibleLevelZoom(config) {
    const step = 0.2;
    const maxZoom = config.maxZoom ?? 20.5;
    const waitTimeoutMs = config.waitTimeoutMs ?? 2_500;
    let lastState = null;
    for (
      let zoom = config.startZoom;
      zoom <= maxZoom;
      zoom = Number((zoom + step).toFixed(2))
    ) {
      await page.evaluate(({ zoom }) => {
        const map = window.__RLI_E2E_MAP__;
        if (!map) throw new Error("Opt-in test map was not exposed.");
        map.jumpTo({ center: [30.087, -1.953], zoom });
      }, { zoom });

      const visible = await page.waitForFunction(({ layer, source }) => {
        const map = window.__RLI_E2E_MAP__;
        return Boolean(
          map &&
          map.isStyleLoaded() &&
          map.getLayer(layer) &&
          map.getLayoutProperty(layer, "visibility") === "visible" &&
          map.querySourceFeatures(source).length > 0 &&
          map.queryRenderedFeatures(undefined, { layers: [layer] }).length > 0
        );
      }, config, { timeout: waitTimeoutMs }).then(() => true).catch((error) => {
        if (!String(error?.message ?? error).includes("Timeout")) throw error;
        return false;
      });

      if (visible) return zoom;
      lastState = await page.evaluate(({ layer, source, zoom }) => {
        const map = window.__RLI_E2E_MAP__;
        if (!map) return null;
        return {
          zoom,
          mapZoom: Number(map.getZoom().toFixed(2)),
          visibility: map.getLayer(layer)
            ? map.getLayoutProperty(layer, "visibility") ?? "visible"
            : "missing-layer",
          sourceFeatures: map.querySourceFeatures(source).length,
          renderedFeatures: map.getLayer(layer)
            ? map.queryRenderedFeatures(undefined, { layers: [layer] }).length
            : 0,
          activeLevelTrace: (window.__RLI_E2E_TRACE__ ?? [])
            .filter((event) => ["area-refresh-plan", "area-api-request", "area-api-failure", "area-api-retry"].includes(event.event))
            .slice(-20)
        };
      }, { ...config, zoom });
    }

    throw new Error(
      "No rendered " + config.level + " boundaries became visible by zoom " + maxZoom +
      " while testing dominant-dimension transitions. Last state: " + JSON.stringify(lastState)
    );
  }

  for (const config of hoverLevels) {
    config.transitionZoom = await findVisibleLevelZoom(config);
    const target = await page.evaluate(({ layer }) => {
      const map = window.__RLI_E2E_MAP__;
      if (!map) return null;
      const rect = map.getCanvas().getBoundingClientRect();
      for (let y = 150; y < rect.height - 170; y += 18) {
        for (let x = 390; x < rect.width - 18; x += 18) {
          const feature = map.queryRenderedFeatures([x, y], { layers: [layer] })
            .find((item) => typeof item.id === "string" || typeof item.id === "number");
          if (feature) {
            return { x: rect.left + x, y: rect.top + y, source: feature.source, id: feature.id };
          }
        }
      }
      return null;
    }, config);

    if (!target) throw new Error("No rendered " + config.level + " polygon was available for hover testing.");

    await page.mouse.move(target.x, target.y);
    await page.waitForFunction(({ source, id }) => {
      const map = window.__RLI_E2E_MAP__;
      return Boolean(map && map.getFeatureState({ source, id }).hover === true);
    }, target, { timeout: 8_000 });

    const blankPoint = await page.evaluate(({ layer }) => {
      const map = window.__RLI_E2E_MAP__;
      if (!map) return null;
      const rect = map.getCanvas().getBoundingClientRect();
      for (let x = rect.width - 420; x > 410; x -= 18) {
        for (let y = rect.height - 170; y > 150; y -= 18) {
          if (map.queryRenderedFeatures([x, y], { layers: [layer] }).length === 0) {
            return { x: rect.left + x, y: rect.top + y };
          }
        }
      }
      return null;
    }, config);

    if (blankPoint) await page.mouse.move(blankPoint.x, blankPoint.y);
    else await page.mouse.move(12, 12);

    await page.waitForFunction(({ source, id }) => {
      const map = window.__RLI_E2E_MAP__;
      return Boolean(map && map.getFeatureState({ source, id }).hover !== true);
    }, target, { timeout: 8_000 });

    hierarchyHoverChecks.push({
      level: config.level,
      transitionZoom: config.transitionZoom,
      source: target.source,
      featureId: target.id,
      highlightActivated: true,
      highlightClearedOnLeave: true,
      pointerStayedOnMapForLeave: Boolean(blankPoint)
    });
  }

  // A parcel is different: hover does not fill it. Clicking selects
  // the outline and price marker together; pointer exit must not clear either.
  await page.evaluate(() => {
    const map = window.__RLI_E2E_MAP__;
    if (!map) throw new Error("Opt-in test map was not exposed.");
    map.jumpTo({ center: [30.087, -1.953], zoom: 17.4 });
  });

  await page.waitForFunction(() => {
    const map = window.__RLI_E2E_MAP__;
    if (!map || !map.getLayer("parcel-fill")) return false;
    try {
      return map.querySourceFeatures("land-parcels").length > 0 &&
        map.getLayoutProperty("parcel-fill", "visibility") === "visible";
    } catch {
      return false;
    }
  }, undefined, { timeout: 50_000 });

  // Find a visible cadastral parcel that actually has a price pill. The
  // selection rule applies to existing price markers; we do not invent one
  // for a parcel that has no supported price value.
  await page.waitForFunction(() => {
    const map = window.__RLI_E2E_MAP__;
    if (!map) return false;
    return map.querySourceFeatures("metric-bubbles").some((feature) =>
      feature.properties?.level === "parcel" &&
      feature.properties?.has_value === true
    );
  }, undefined, { timeout: 20_000 });

  const parcelHoverTarget = await page.evaluate(() => {
    const map = window.__RLI_E2E_MAP__;
    if (!map) return null;
    const rect = map.getCanvas().getBoundingClientRect();
    const pricedIds = new Set(
      map.querySourceFeatures("metric-bubbles")
        .filter((feature) =>
          feature.properties?.level === "parcel" &&
          feature.properties?.has_value === true
        )
        .map((feature) => String(feature.properties?.upi ?? ""))
    );
    for (let y = 150; y < rect.height - 170; y += 10) {
      for (let x = 390; x < rect.width - 18; x += 10) {
        const feature = map.queryRenderedFeatures([x, y], { layers: ["parcel-fill"] })
          .find((item) =>
            (typeof item.id === "string" || typeof item.id === "number") &&
            pricedIds.has(String(item.properties?.upi ?? ""))
          );
        if (feature) {
          return {
            x: rect.left + x,
            y: rect.top + y,
            source: feature.source,
            id: feature.id,
            upi: String(feature.properties?.upi ?? "")
          };
        }
      }
    }
    return null;
  });
  if (!parcelHoverTarget) throw new Error("No visible parcel with a price marker was available for the selection colour check.");

  await page.mouse.click(parcelHoverTarget.x, parcelHoverTarget.y);
  await page.waitForFunction(({ source, id, upi }) => {
    const map = window.__RLI_E2E_MAP__;
    if (!map || map.getFeatureState({ source, id }).selected !== true) return false;
    const bubble = map.querySourceFeatures("metric-bubbles").find((feature) =>
      String(feature.properties?.upi ?? "") === String(upi) &&
      feature.properties?.level === "parcel" &&
      feature.properties?.has_value === true
    );
    return Boolean(bubble && bubble.properties?.is_selected === true);
  }, parcelHoverTarget, { timeout: 8_000 });

  const parcelBlankPoint = await page.evaluate(() => {
    const map = window.__RLI_E2E_MAP__;
    if (!map) return null;
    const rect = map.getCanvas().getBoundingClientRect();
    for (let x = rect.width - 420; x > 410; x -= 12) {
      for (let y = rect.height - 170; y > 150; y -= 12) {
        if (map.queryRenderedFeatures([x, y], { layers: ["parcel-fill"] }).length === 0) {
          return { x: rect.left + x, y: rect.top + y };
        }
      }
    }
    return null;
  });

  if (parcelBlankPoint) await page.mouse.move(parcelBlankPoint.x, parcelBlankPoint.y);
  else await page.mouse.move(12, 12);

  if (!parcelBlankPoint) {
    throw new Error("Could not find a blank map location to test persistent parcel selection.");
  }
  await page.mouse.move(parcelBlankPoint.x, parcelBlankPoint.y);

  await page.waitForFunction(({ source, id, upi }) => {
    const map = window.__RLI_E2E_MAP__;
    if (!map || map.getFeatureState({ source, id }).selected !== true) return false;
    const bubble = map.querySourceFeatures("metric-bubbles").find((feature) =>
      String(feature.properties?.upi ?? "") === String(upi) &&
      feature.properties?.level === "parcel"
    );
    return Boolean(bubble && bubble.properties?.is_selected === true);
  }, parcelHoverTarget, { timeout: 8_000 });

  // Capture the selected parcel fact panel at desktop, tablet and mobile sizes.
  // A real map selection above drives this panel; no fixture or mock is used.
  const parcelPanel = page.locator(".selected-area-panel");
  await parcelPanel.waitFor({ state: "visible", timeout: 15_000 });
  const responsiveParcelPanelChecks = [];
  const responsiveViewports = [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 375, height: 812 }
  ];
  for (const viewport of responsiveViewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForFunction(() => {
      const panel = document.querySelector(".selected-area-panel");
      const details = panel?.querySelector(".parcel-details");
      return Boolean(
        panel &&
        details &&
        panel.getBoundingClientRect().width > 0 &&
        details.querySelectorAll(".parcel-fact").length === 6
      );
    }, undefined, { timeout: 15_000 });
    await page.waitForTimeout(350);

    const layout = await parcelPanel.evaluate((panel) => {
      const details = panel.querySelector(".parcel-details");
      return {
        viewportWidth: window.innerWidth,
        panelWidth: panel.clientWidth,
        panelScrollWidth: panel.scrollWidth,
        factsWidth: details?.clientWidth ?? 0,
        factsScrollWidth: details?.scrollWidth ?? 0,
        factCount: details?.querySelectorAll(".parcel-fact").length ?? 0,
        horizontalOverflow: Boolean(details && details.scrollWidth > details.clientWidth + 2)
      };
    });
    if (layout.horizontalOverflow || layout.factCount !== 6) {
      throw new Error("Selected parcel facts do not fit the " + viewport.name + " layout: " + JSON.stringify(layout));
    }
    responsiveParcelPanelChecks.push({ ...layout, viewport: viewport.name });
    await parcelPanel.screenshot({ path: "artifacts/selected-parcel-panel-" + viewport.name + ".png" });
    await page.screenshot({ path: "artifacts/selected-parcel-map-" + viewport.name + ".png" });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(350);

  // Now click an unrelated empty map location. Both the boundary state and
  // the matching price marker must return to their normal state together.
  await page.mouse.click(parcelBlankPoint.x, parcelBlankPoint.y);
  await page.waitForFunction(({ source, id, upi }) => {
    const map = window.__RLI_E2E_MAP__;
    if (!map || map.getFeatureState({ source, id }).selected === true) return false;
    const bubble = map.querySourceFeatures("metric-bubbles").find((feature) =>
      String(feature.properties?.upi ?? "") === String(upi) &&
      feature.properties?.level === "parcel"
    );
    return !bubble || bubble.properties?.is_selected !== true;
  }, parcelHoverTarget, { timeout: 8_000 });

  // Restore village zoom so the cadastral-boundary screenshot is a village
  // diagnostic rather than a parcel-level screenshot.
  await page.evaluate(() => {
    const map = window.__RLI_E2E_MAP__;
    if (!map) throw new Error("Opt-in test map was not exposed.");
    map.jumpTo({ center: [30.133, -2.283], zoom: 16.6 });
  });
  await page.waitForFunction(() => {
    const map = window.__RLI_E2E_MAP__;
    return Boolean(
      map &&
      map.getLayoutProperty("village-outline", "visibility") === "visible" &&
      map.getLayoutProperty("parcel-outline", "visibility") === "visible" &&
      map.querySourceFeatures("admin-villages").length > 0 &&
      map.queryRenderedFeatures(undefined, { layers: ["village-outline"] }).length > 0
    );
  }, undefined, { timeout: 20_000 });

  const parcelFillOpacity = await page.evaluate(() => {
    const map = window.__RLI_E2E_MAP__;
    return map?.getPaintProperty("parcel-fill", "fill-opacity") ?? null;
  });
  if (parcelFillOpacity !== 0.006) {
    throw new Error("Selected parcel fills must remain transparent; the thin cyan outline indicates selection.");
  }
  const parcelOutlineWidth = await page.evaluate(() => {
    const map = window.__RLI_E2E_MAP__;
    return map?.getPaintProperty("parcel-outline", "line-width") ?? null;
  });
  const hasParcelGlowLayer = await page.evaluate(() => {
    const map = window.__RLI_E2E_MAP__;
    return Boolean(map?.getLayer("parcel-outline-glow"));
  });
  const parcelOutlineWidthValues = Array.isArray(parcelOutlineWidth) ? parcelOutlineWidth : [];
  if (
    parcelOutlineWidthValues[0] !== "case" ||
    !parcelOutlineWidthValues.includes(3.0) ||
    !parcelOutlineWidthValues.includes(4.0) ||
    !parcelOutlineWidthValues.includes(1.2)
  ) {
    throw new Error("Parcel outlines must use the live map style: selected (3px), hover (4px), and resting (1.2px).");
  }
  if (hasParcelGlowLayer) {
    throw new Error("Parcel glow layer must be removed.");
  }
  const parcelHighlightCheck = {
    source: parcelHoverTarget.source,
    featureId: parcelHoverTarget.id,
    selectionPersistsAfterPointerLeave: true,
    outlineWidth: parcelOutlineWidth,
    glowLayerPresent: hasParcelGlowLayer,
    priceMarkerTurnedBlueWithParcel: true,
    bothResetAfterUnrelatedClick: true,
    parcelFillOpacity,
    pointerStayedOnMapForLeave: Boolean(parcelBlankPoint)
  };
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

  // Test both raster modes at the map's maximum zoom, in Bugesera.
  // The service has global tile levels above the close-zoom coverage available
  // in this rural area. Sources are capped at z18 so MapLibre must overzoom those
  // tiles rather than request blank higher-resolution tiles.
  const closeZoomBasemapChecks = [];
  const testCloseZoomBasemap = async (mode, buttonName, screenshot) => {
    // Village zoom may already have switched the app to Satellite and loaded
    // Bugesera z18 tiles before this helper starts. Switch to the vector Map
    // style first so each mode test proves a fresh raster load, not a cache hit.
    await page.getByRole("button", { name: "Map", exact: true }).click();
    await page.waitForFunction(() => {
      const map = window.__RLI_E2E_MAP__;
      return Boolean(map && map.isStyleLoaded() && !map.getSource("world-imagery"));
    }, undefined, { timeout: 45_000 });

    const responseStart = diagnostics.basemapTileResponses.length;
    const failureStart = diagnostics.failedBasemapTileRequests.length;
    await page.getByRole("button", { name: buttonName }).click();
    await page.waitForFunction(() => {
      const map = window.__RLI_E2E_MAP__;
      return Boolean(map && map.isStyleLoaded() && map.getSource("world-imagery"));
    }, undefined, { timeout: 45_000 });
    await page.evaluate(() => {
      const map = window.__RLI_E2E_MAP__;
      if (!map) throw new Error("Map is not available for close-zoom basemap check.");
      map.jumpTo({ center: [30.133, -2.283], zoom: 20 });
    });
    await page.waitForFunction(() => {
      const map = window.__RLI_E2E_MAP__;
      return Boolean(
        map &&
        map.getZoom() >= 19.99 &&
        map.isStyleLoaded() &&
        map.isSourceLoaded("world-imagery")
      );
    }, undefined, { timeout: 45_000 });
    await page.waitForTimeout(500);

    const sourceState = await page.evaluate(() => {
      const map = window.__RLI_E2E_MAP__;
      if (!map) throw new Error("Map is not available for close-zoom source check.");
      const sources = map.getStyle().sources;
      return {
        zoom: Number(map.getZoom().toFixed(2)),
        imageryMaxZoom: sources["world-imagery"]?.maxzoom ?? null,
        transportationMaxZoom: sources["world-transportation"]?.maxzoom ?? null,
        imageryLayerExists: Boolean(map.getLayer("world-imagery")),
        imageryLayerVisibility: map.getLayoutProperty("world-imagery", "visibility") ?? "visible",
        imagerySourceLoaded: map.isSourceLoaded("world-imagery"),
        transportationSourceLoaded: Boolean(
          map.getSource("world-transportation") && map.isSourceLoaded("world-transportation")
        )
      };
    });
    const responses = diagnostics.basemapTileResponses.slice(responseStart);
    const failures = diagnostics.failedBasemapTileRequests.slice(failureStart);
    const imageryResponses = responses.filter((item) => item.url.includes("World_Imagery"));
    const imageryLevels = imageryResponses
      .map((item) => Number(item.url.match(/MapServer\/tile\/(\d+)\//i)?.[1]))
      .filter(Number.isFinite);
    const transportResponses = responses.filter((item) => item.url.includes("World_Transportation"));
    const transportLevels = transportResponses
      .map((item) => Number(item.url.match(/MapServer\/tile\/(\d+)\//i)?.[1]))
      .filter(Number.isFinite);
    const check = {
      mode,
      ...sourceState,
      imageryTileResponses: imageryResponses.length,
      imageryTileLevels: [...new Set(imageryLevels)].sort((a, b) => a - b),
      imageryTile200: imageryResponses.filter((item) => item.status === 200).length,
      transportationTileResponses: transportResponses.length,
      transportationTileLevels: [...new Set(transportLevels)].sort((a, b) => a - b),
      failedTileRequests: failures
    };
    await page.screenshot({ path: screenshot, fullPage: false });

    if (
      sourceState.imageryMaxZoom !== 18 ||
      !sourceState.imagerySourceLoaded ||
      !sourceState.imageryLayerExists ||
      sourceState.imageryLayerVisibility === "none" ||
      !imageryResponses.some((item) => item.status === 200) ||
      !imageryResponses.some((item) =>
        item.status === 200 && item.url.includes("/tile/18/132734/153014")
      )
    ) {
      throw new Error(mode + " imagery did not stay loaded at Bugesera close zoom: " + JSON.stringify(check));
    }
    if (imageryLevels.some((level) => level > 18)) {
      throw new Error(mode + " requested World Imagery tiles above the Bugesera source cap: " + JSON.stringify(check));
    }
    if (mode === "hybrid") {
      if (
        sourceState.transportationMaxZoom !== 18 ||
        !sourceState.transportationSourceLoaded ||
        !transportResponses.some((item) => item.status === 200) ||
        transportLevels.some((level) => level > 18) ||
        failures.some((item) => item.url.includes("World_Transportation"))
      ) {
        throw new Error("Hybrid road-reference tiles failed or requested unavailable close-zoom levels: " + JSON.stringify(check));
      }
    }
    closeZoomBasemapChecks.push(check);
    return check;
  };

  await testCloseZoomBasemap("satellite", "Satellite", "artifacts/bugesera-satellite-close-zoom.png");
  await testCloseZoomBasemap("hybrid", "Hybrid", "artifacts/bugesera-hybrid-close-zoom.png");

  // Keep the main diagnostic screenshot at village scale after the close-zoom
  // checks, so it remains useful for reviewing village and parcel outlines.
  await page.getByRole("button", { name: "Satellite" }).click();
  await page.waitForFunction(() => {
    const map = window.__RLI_E2E_MAP__;
    return Boolean(map && map.isStyleLoaded() && map.getSource("world-imagery"));
  }, undefined, { timeout: 45_000 });
  await page.evaluate(() => {
    const map = window.__RLI_E2E_MAP__;
    if (!map) throw new Error("Map was not available to restore village zoom.");
    map.jumpTo({ center: [30.133, -2.283], zoom: 16.6 });
  });
  await page.waitForFunction(() => {
    const map = window.__RLI_E2E_MAP__;
    return Boolean(
      map &&
      map.querySourceFeatures("admin-villages").length > 0 &&
      map.queryRenderedFeatures(undefined, { layers: ["village-outline"] }).length > 0
    );
  }, undefined, { timeout: 20_000 });

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
      .filter((layer) => /^(district|sector|cell|village|parcel)-(fill|outline|label)$/.test(layer.id))
      .map((layer) => ({
        id: layer.id,
        type: layer.type,
        visibility: map.getLayoutProperty(layer.id, "visibility") ?? "visible"
      }));
    return {
      zoom: Number(map.getZoom().toFixed(2)),
      center: map.getCenter().toArray(),
      styleLoaded: map.isStyleLoaded(),
      basemap: {
        mode: map.getSource("world-imagery") ? "satellite" : "map",
        imagerySourceExists: Boolean(map.getSource("world-imagery")),
        imagerySourceLoaded: Boolean(map.getSource("world-imagery") && map.isSourceLoaded("world-imagery")),
        allTilesLoaded: map.areTilesLoaded(),
        statusDotClass: document.querySelector(".map-status-card .status-dot")?.className ?? null,
        statusText: document.querySelector(".map-status-card")?.textContent?.trim() ?? null
      },
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
    initialOverlayCheck,
    hierarchyHoverChecks,
    responsiveParcelPanelChecks,
    parcelHighlightCheck,
    directParcelApi,
    closeZoomBasemapChecks,
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
  if (!result.basemap.imagerySourceExists || !result.basemap.imagerySourceLoaded || !result.basemap.statusDotClass?.includes("status-dot-ready")) {
    throw new Error("Satellite imagery did not reach a healthy ready state. See basemap tile request diagnostics above.");
  }
  if (!diagnostics.basemapTileResponses.some((item) => item.url.includes("World_Imagery") && item.status === 200)) {
    throw new Error("No successful Esri World Imagery tiles were received.");
  }
  if (diagnostics.failedBasemapTileRequests.length > 0 || diagnostics.basemapTileResponses.some((item) => item.url.includes("World_Imagery") && item.status >= 400)) {
    throw new Error("Satellite imagery tile requests failed. See basemap diagnostics above.");
  }
  if (diagnostics.pageErrors.length > 0) {
    throw new Error("Browser runtime errors: " + diagnostics.pageErrors.join(" | "));
  }
} catch (error) {
  await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
  const mapDiagnostics = await page.evaluate(() => {
    const map = window.__RLI_E2E_MAP__;
    if (!map) return null;
    const layerState = (layer) => ({
      exists: Boolean(map.getLayer(layer)),
      visibility: map.getLayer(layer)
        ? map.getLayoutProperty(layer, "visibility") ?? "visible"
        : null
    });
    const sourceFeatureCount = (source) => {
      try {
        return map.querySourceFeatures(source).length;
      } catch {
        return 0;
      }
    };
    return {
      zoom: Number(map.getZoom().toFixed(2)),
      center: map.getCenter().toArray(),
      villageOutline: layerState("village-outline"),
      parcelOutline: layerState("parcel-outline"),
      villageSourceFeatures: sourceFeatureCount("admin-villages"),
      parcelSourceFeatures: sourceFeatureCount("land-parcels"),
      renderedVillageFeatures: map.queryRenderedFeatures(undefined, { layers: ["village-outline"] }).length,
      refreshTrace: (window.__RLI_E2E_TRACE__ ?? [])
        .filter((event) => [
          "area-refresh-attempt",
          "area-refresh-plan",
          "area-api-request",
          "area-api-response",
          "area-api-failure",
          "area-api-retry"
        ].includes(event.event))
        .slice(-50)
    };
  }).catch((diagnosticError) => ({
    readError: diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError)
  }));
  console.error(error instanceof Error ? error.stack : String(error));
  console.error(JSON.stringify({ ...diagnostics, mapDiagnostics, screenshot: screenshotPath }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
