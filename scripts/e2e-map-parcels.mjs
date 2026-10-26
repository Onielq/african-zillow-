import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = (process.env.APP_BASE_URL ?? "https://rwanda-land-intelligence.taiseel.workers.dev").replace(/\/$/, "");
const screenshotPath = "artifacts/village-parcel-boundaries.png";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1
});
const pageErrors = [];

page.on("pageerror", (error) => pageErrors.push(error.message));

try {
  await mkdir("artifacts", { recursive: true });
  const response = await page.goto(baseUrl + "/?rli_e2e=1", {
    waitUntil: "domcontentloaded",
    timeout: 90_000
  });
  if (!response?.ok()) {
    throw new Error("App homepage failed: HTTP " + (response?.status() ?? "no response"));
  }

  await page.waitForFunction(() => {
    const map = window.__RLI_E2E_MAP__;
    return Boolean(map && map.isStyleLoaded());
  }, undefined, { timeout: 90_000 });

  // Set the browser to a real Bugesera sample viewport that is inside the
  // parcel service's previously smoke-tested coverage.
  await page.evaluate(() => {
    const map = window.__RLI_E2E_MAP__;
    if (!map) throw new Error("Opt-in test map was not exposed.");
    map.jumpTo({ center: [30.133, -2.283], zoom: 16.6 });
  });

  await page.waitForFunction(() => {
    const map = window.__RLI_E2E_MAP__;
    if (!map || map.getZoom() < 16.2) return false;
    if (map.getLayoutProperty("village-outline", "visibility") !== "visible") return false;
    if (map.getLayoutProperty("parcel-outline", "visibility") !== "visible") return false;
    return map.queryRenderedFeatures({ layers: ["parcel-outline"] }).length > 0;
  }, undefined, { timeout: 60_000 });

  const result = await page.evaluate(() => {
    const map = window.__RLI_E2E_MAP__;
    if (!map) throw new Error("Map was not available during the final assertion.");
    return {
      zoom: Number(map.getZoom().toFixed(2)),
      center: map.getCenter().toArray(),
      villageOutlineVisibility: map.getLayoutProperty("village-outline", "visibility"),
      parcelOutlineVisibility: map.getLayoutProperty("parcel-outline", "visibility"),
      renderedParcelOutlineFeatures: map.queryRenderedFeatures({ layers: ["parcel-outline"] }).length,
      renderedParcelFillFeatures: map.queryRenderedFeatures({ layers: ["parcel-fill"] }).length
    };
  });

  const removedPanelCount = await page.locator(".map-focus-panel").count();
  const exploreAreaTextCount = await page.getByText("EXPLORE AREA", { exact: true }).count();
  const parcelBoundariesTextCount = await page.getByText("PARCEL BOUNDARIES", { exact: true }).count();
  if (removedPanelCount !== 0 || exploreAreaTextCount !== 0 || parcelBoundariesTextCount !== 0) {
    throw new Error("The redundant map focus panels are still present in the rendered page.");
  }

  await page.screenshot({ path: screenshotPath, fullPage: false });
  if (result.renderedParcelOutlineFeatures === 0) {
    throw new Error("No cadastral parcel outlines were rendered at village zoom.");
  }
  if (pageErrors.length > 0) {
    throw new Error("Browser runtime errors: " + pageErrors.join(" | "));
  }

  console.log(JSON.stringify({
    status: "passed",
    url: baseUrl,
    zoomLevel: "village",
    ...result,
    removedPanelCount,
    pageErrors,
    screenshot: screenshotPath
  }, null, 2));
} catch (error) {
  await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
  console.error(error instanceof Error ? error.stack : String(error));
  console.error(JSON.stringify({ pageErrors, screenshot: screenshotPath }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
