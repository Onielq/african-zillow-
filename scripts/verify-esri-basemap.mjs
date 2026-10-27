const apiKey =
  process.env.NEXT_PUBLIC_ESRI_API_KEY?.trim() ||
  process.env.ESRI_API_KEY?.trim() ||
  "";

const isCombTestVercelBuild =
  process.env.VERCEL === "1" &&
  process.env.VERCEL_GIT_COMMIT_REF === "comb-test";

if (!apiKey) {
  const message = "[Esri check] No ESRI_API_KEY is configured; skipping remote key validation.";
  if (isCombTestVercelBuild) {
    throw new Error(message + " The comb-test preview requires the key so satellite imagery can be verified.");
  }
  console.warn(message);
  process.exit(0);
}

const styleUrl = new URL(
  "https://basemapstyles-api.arcgis.com/arcgis/rest/services/styles/v2/styles/arcgis/imagery/standard"
);
styleUrl.searchParams.set("token", apiKey);

const referer = process.env.ESRI_CHECK_REFERER ||
  (process.env.VERCEL_GIT_COMMIT_REF === "comb-test"
    ? "https://rwanda-land-intelligence-git-comb-test-onielqs-projects.vercel.app/"
    : "https://rwanda-land-intelligence.taiseel.workers.dev/");

let response;
try {
  response = await fetch(styleUrl, {
    headers: { Referer: referer },
    signal: AbortSignal.timeout(20_000)
  });
} catch (error) {
  throw new Error(
    "[Esri check] Could not reach the Imagery Standard style endpoint: " +
    (error instanceof Error ? error.name + ": " + error.message : "network error")
  );
}

const body = await response.json().catch(() => null);
const validStyle =
  response.ok &&
  !body?.error &&
  body?.version === 8 &&
  Array.isArray(body?.layers) &&
  body.layers.length > 0 &&
  body?.sources &&
  Object.keys(body.sources).length > 0;

if (!validStyle) {
  const errorCode = body?.error?.code;
  const rawMessage = String(body?.error?.message || body?.message || "Invalid style response");
  const safeMessage = rawMessage.replace(/([?&](?:token|access_token)=)[^&"'<> ]+/gi, "$1[redacted]").slice(0, 220);
  throw new Error(
    "[Esri check] Imagery Standard authorization/response validation failed: HTTP " +
    response.status +
    (errorCode ? ", ArcGIS error " + errorCode : "") +
    ". " + safeMessage +
    ". Confirm the key has the Basemap Styles privilege (premium:user:basemaps) and permits the preview referrer."
  );
}

console.log(
  "[Esri check] Imagery Standard authorized: HTTP " +
  response.status +
  "; " + body.layers.length + " style layers returned. Key value not logged."
);
