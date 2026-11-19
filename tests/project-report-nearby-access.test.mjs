import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchProjectNearbyAccess,
  formatProjectNearbyAccessItem,
  isPreciseProjectLocation
} from "../public/valia-deck/project-access.js";

const exactAddress = {
  latitude: -1.9441,
  longitude: 30.0619,
  precision: "address-coordinate",
  district: "Gasabo"
};

test("nearby access accepts only precise Rwanda project coordinates", () => {
  assert.equal(isPreciseProjectLocation(exactAddress), true);
  assert.equal(isPreciseProjectLocation({ ...exactAddress, precision: "parcel-upi" }), true);
  assert.equal(isPreciseProjectLocation({ ...exactAddress, precision: "administrative-area" }), false);
  assert.equal(isPreciseProjectLocation({ ...exactAddress, precision: "district" }), false);
  assert.equal(isPreciseProjectLocation({ ...exactAddress, latitude: 0 }), false);
  assert.equal(isPreciseProjectLocation({ ...exactAddress, longitude: 32 }), false);
  assert.equal(isPreciseProjectLocation({ ...exactAddress, latitude: "" }), false);
});

test("administrative-area records do not call the nearby-access API", async () => {
  let fetchCalls = 0;
  const result = await fetchProjectNearbyAccess(
    { ...exactAddress, precision: "administrative-area" },
    async () => {
      fetchCalls += 1;
      throw new Error("This fetch must not run.");
    }
  );

  assert.equal(fetchCalls, 0);
  assert.equal(result.status, "not-eligible");
  assert.deepEqual(result.items, []);
});

test("precise project coordinates call the existing nearby-access route with bounded parameters", async () => {
  let requestUrl = "";
  let requestOptions;
  const payload = {
    status: "ready",
    items: [{ id: "osm-node-1", category: "School", name: "Example School", distanceKm: 1.2, timeMinutes: 4, routeStatus: "routed" }],
    source: "Valhalla · OpenStreetMap road graph",
    note: "Estimated route."
  };

  const result = await fetchProjectNearbyAccess(exactAddress, async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return { ok: true, json: async () => payload };
  });

  assert.match(requestUrl, /^\/api\/geography\/nearby-access\?/);
  const params = new URLSearchParams(requestUrl.split("?")[1]);
  assert.equal(params.get("lat"), String(exactAddress.latitude));
  assert.equal(params.get("lon"), String(exactAddress.longitude));
  assert.equal(params.get("district"), "Gasabo");
  assert.equal(requestOptions.cache, "no-store");
  assert.equal(result.status, "ready");
  assert.equal(result.items.length, 1);
  assert.equal(result.source, payload.source);
});

test("routed distances may show an ETA, while straight-line distances never do", () => {
  const routed = formatProjectNearbyAccessItem({
    category: "School",
    name: "Example School",
    distanceKm: 1.25,
    timeMinutes: 6.4,
    routeStatus: "routed"
  });
  assert.equal(routed.distanceLabel, "1.25 km by road · about 6 min");

  const straightLine = formatProjectNearbyAccessItem({
    category: "School",
    name: "Example School",
    distanceKm: 0.5,
    timeMinutes: 2,
    routeStatus: "straight-line"
  });
  assert.equal(straightLine.distanceLabel, "0.5 km straight-line · road route unavailable");
  assert.doesNotMatch(straightLine.distanceLabel, /min|by road/i);
});

test("nearest-road proximity is never described as legal or driveway access", () => {
  const road = formatProjectNearbyAccessItem({
    category: "Main road",
    name: "Main road",
    distanceKm: 0.08,
    timeMinutes: null,
    routeStatus: "straight-line"
  });
  assert.equal(road.distanceLabel, "0.08 km straight-line proximity · not a driveway/access confirmation");
});

test("unsupported categories and invalid distances are not displayed as facts", () => {
  assert.equal(formatProjectNearbyAccessItem({ category: "Hospital", name: "Clinic" }), null);
  const invalid = formatProjectNearbyAccessItem({
    category: "School",
    name: "Example School",
    distanceKm: -3,
    routeStatus: "routed",
    timeMinutes: 0
  });
  assert.equal(invalid.distanceLabel, "Distance unavailable");
});

test("HTTP and malformed API responses fail explicitly", async () => {
  await assert.rejects(
    fetchProjectNearbyAccess(exactAddress, async () => ({ ok: false, status: 502 })),
    /HTTP 502/
  );
  await assert.rejects(
    fetchProjectNearbyAccess(exactAddress, async () => ({ ok: true, json: async () => ({ status: "error", items: [] }) })),
    /invalid response/
  );
});

test("generic project report gates nearby access behind exact source-backed precision", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(new URL("../public/valia-deck/projects/project-profile.html", import.meta.url), "utf8");
  const access = await readFile(new URL("../public/valia-deck/project-access.js", import.meta.url), "utf8");
  assert.match(html, /type="module"/);
  assert.match(html, /isPreciseProjectLocation/);
  assert.match(html, /mountProjectNearbyAccess/);
  assert.match(html, /reportAccessGrid/);
  assert.match(html, /reportAccessNote/);
  assert.match(access, /administrative-area context only/i);
});


test("both existing precise-coordinate project studies use the shared live access panel", async () => {
  const { readFile } = await import("node:fs/promises");
  const brilliant = await readFile(new URL("../public/valia-deck/projects/brilliant-tower.html", import.meta.url), "utf8");
  const inzovu = await readFile(new URL("../public/valia-deck/projects/inzovu-mall.html", import.meta.url), "utf8");

  for (const report of [brilliant, inzovu]) {
    assert.match(report, /mountProjectNearbyAccess/);
    assert.match(report, /liveNearbyAccessGrid/);
    assert.match(report, /liveNearbyAccessNote/);
    assert.match(report, /OpenStreetMap facilities and Valhalla road estimates/);
  }

  assert.match(brilliant, /"latitude":-1[.]949491/);
  assert.match(brilliant, /"longitude":30[.]092781/);
  assert.match(brilliant, /"precision":"address-coordinate"/);
  assert.match(inzovu, /"latitude":-1[.]95447/);
  assert.match(inzovu, /"longitude":30[.]09691/);
  assert.match(inzovu, /"precision":"parcel-upi"/);
});


test("dedicated report coordinates stay aligned with the canonical project register", async () => {
  const { readFile } = await import("node:fs/promises");
  const directory = await readFile(new URL("../src/data/project-directory.ts", import.meta.url), "utf8");
  const getRecord = (id) => {
    const start = directory.indexOf('"id": "' + id + '"');
    assert.notEqual(start, -1, "project register must contain " + id);
    const end = directory.indexOf(String.fromCharCode(10) + "  },", start);
    assert.notEqual(end, -1, "project register record must close for " + id);
    return directory.slice(start, end);
  };

  const brilliant = getRecord("brilliant-tower");
  assert.match(brilliant, /"latitude": -1\.949491/);
  assert.match(brilliant, /"longitude": 30\.092781/);
  assert.match(brilliant, /"locationPrecision": "address-coordinate"/);

  const inzovu = getRecord("inzovu-mall");
  assert.match(inzovu, /"latitude": -1\.95447/);
  assert.match(inzovu, /"longitude": 30\.09691/);
  assert.match(inzovu, /"locationPrecision": "parcel-upi"/);
});
