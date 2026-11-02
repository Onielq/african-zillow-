import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = (process.env.APP_BASE_URL ?? "https://rwanda-land-intelligence.taiseel.workers.dev").replace(/\/$/, "");
const screenshotPath = "artifacts/developer-directory-mobile-3g.png";
const browser = await chromium.launch({ headless: true });
const diagnostics = {
  pageErrors: [],
  imageRequests: [],
  failedImageRequests: [],
  loadingSkeletonObserved: false,
  firstImageFinalState: null,
  directoryRecords: 0,
  lazyImages: 0,
  mobileLayout: null
};

try {
  await mkdir("artifacts", { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/images/transform")) diagnostics.imageRequests.push(request.url());
  });
  page.on("requestfailed", (request) => {
    if (request.url().includes("/api/images/transform")) {
      diagnostics.failedImageRequests.push({
        url: request.url(),
        error: request.failure()?.errorText ?? "request failed"
      });
    }
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 500,
    downloadThroughput: (450 * 1024) / 8,
    uploadThroughput: (150 * 1024) / 8,
    connectionType: "cellular3g"
  });

  let delayedFirstImage = false;
  await page.route("**/api/images/transform*", async (route) => {
    if (!delayedFirstImage) {
      delayedFirstImage = true;
      await new Promise((resolve) => setTimeout(resolve, 1400));
    }
    await route.continue();
  });

  const response = await page.goto(baseUrl + "/developers?e2e=mobile-3g", {
    waitUntil: "domcontentloaded",
    timeout: 90_000
  });
  if (!response?.ok()) {
    throw new Error("Developer directory failed: HTTP " + (response?.status() ?? "no response"));
  }

  const rowSelector = '[data-testid="candidate-organization"]';
  const logoSelector = ".directory-candidate-logo";
  await page.waitForFunction(
    (selector) => document.querySelectorAll(selector).length >= 20,
    rowSelector,
    { timeout: 30_000 }
  );
  diagnostics.directoryRecords = await page.locator(rowSelector).count();

  const firstBrand = page.locator(logoSelector).first();
  await firstBrand.scrollIntoViewIfNeeded();
  await page.waitForFunction((selector) => {
    const image = document.querySelector(selector + " img");
    return Boolean(image && image.getAttribute("src")?.includes("/api/images/transform"));
  }, logoSelector, { timeout: 20_000 });

  const initialState = await firstBrand.evaluate((element) => ({
    loaded: element.getAttribute("data-loaded"),
    failed: element.getAttribute("data-failed"),
    skeletonVisible: getComputedStyle(element.querySelector(".brand-image-skeleton")).opacity !== "0"
  }));
  diagnostics.loadingSkeletonObserved =
    initialState.loaded === "false" &&
    initialState.failed === "false" &&
    initialState.skeletonVisible;
  if (!diagnostics.loadingSkeletonObserved) {
    throw new Error("The first developer logo did not show its loading skeleton on the throttled mobile connection: " + JSON.stringify(initialState));
  }

  await page.waitForFunction((selector) => {
    const element = document.querySelector(selector);
    return Boolean(element && (
      element.getAttribute("data-loaded") === "true" ||
      element.getAttribute("data-failed") === "true"
    ));
  }, logoSelector, { timeout: 30_000 });

  diagnostics.firstImageFinalState = await firstBrand.evaluate((element) => ({
    loaded: element.getAttribute("data-loaded") === "true",
    fallback: element.getAttribute("data-failed") === "true",
    initialsVisible: getComputedStyle(element.querySelector(".brand-image-initials")).opacity !== "0"
  }));
  if (!diagnostics.firstImageFinalState.loaded && !diagnostics.firstImageFinalState.fallback) {
    throw new Error("The first developer logo never reached a loaded or fallback state.");
  }

  const imageMetrics = await page.locator(logoSelector + " img").evaluateAll((images) => ({
    count: images.length,
    allLazy: images.every((image) => image.loading === "lazy"),
    allAsyncDecoded: images.every((image) => image.decoding === "async")
  }));
  diagnostics.lazyImages = imageMetrics.count;
  if (imageMetrics.count === 0 || !imageMetrics.allLazy || !imageMetrics.allAsyncDecoded) {
    throw new Error("Developer images must use lazy loading and async decoding: " + JSON.stringify(imageMetrics));
  }

  const lastImage = page.locator(logoSelector + " img").last();
  await lastImage.scrollIntoViewIfNeeded();
  await page.waitForFunction((selector) => {
    const images = document.querySelectorAll(selector + " img");
    const image = images[images.length - 1];
    const brand = image?.closest(selector);
    return Boolean(brand && (
      brand.getAttribute("data-loaded") === "true" ||
      brand.getAttribute("data-failed") === "true"
    ));
  }, logoSelector, { timeout: 30_000 });

  diagnostics.mobileLayout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    directoryFrameWidth: document.querySelector(".candidateTableFrame")?.clientWidth ?? null,
    directoryContentWidth: document.querySelector(".candidateTableFrame")?.scrollWidth ?? null
  }));
  if (diagnostics.mobileLayout.documentWidth > diagnostics.mobileLayout.viewportWidth + 1) {
    throw new Error("The directory caused page-level horizontal overflow on a 390px mobile viewport: " + JSON.stringify(diagnostics.mobileLayout));
  }

  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(JSON.stringify({
    status: diagnostics.pageErrors.length === 0 ? "passed" : "failed",
    url: baseUrl + "/developers",
    networkProfile: "3G throttling · 500ms latency · 450Kbps down · 150Kbps up",
    viewport: "390 × 844 · device scale factor 2",
    ...diagnostics,
    screenshot: screenshotPath
  }, null, 2));

  if (diagnostics.pageErrors.length > 0) {
    throw new Error("Browser runtime errors: " + diagnostics.pageErrors.join(" | "));
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  console.error(JSON.stringify({ ...diagnostics, screenshot: screenshotPath }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
