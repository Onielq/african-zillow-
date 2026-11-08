import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("read-model queries are server-only and use the existing private Neon runtime connection", async () => {
  const helper = await read("../src/lib/reja-read-model.ts");
  assert.match(helper, /import "server-only"/);
  assert.match(helper, /process\.env\.DATABASE_URL/);
  assert.doesNotMatch(helper, /NEXT_PUBLIC_DATABASE_URL/);
  assert.match(helper, /Math\.min\(100/);
  assert.match(helper, /Math\.min\(10000/);
});

test("developer and project APIs publish only verified organizations and projects", async () => {
  const developers = await read("../src/app/api/platform/developers/route.ts");
  const projects = await read("../src/app/api/platform/projects/route.ts");
  assert.match(developers, /reja\.verified_developer_directory/);
  assert.match(projects, /p\.verification_state = 'verified'/);
  assert.match(projects, /o\.verification_state = 'verified'/);
  assert.match(projects, /o\.is_active = true/);
  assert.doesNotMatch(developers + projects, /SELECT \*/i);
});

test("exchange and market APIs read their verified public views", async () => {
  const listings = await read("../src/app/api/platform/listings/route.ts");
  const market = await read("../src/app/api/platform/market/route.ts");
  const summary = await read("../src/app/api/platform/summary/route.ts");
  assert.match(listings, /reja\.public_market_listings/);
  assert.match(market, /reja\.market_area_monthly_metrics/);
  assert.match(summary, /reja\.platform_data_counts/);
  assert.doesNotMatch(listings + market + summary, /SELECT \*/i);
  assert.match(listings, /limit \+ 1/);
  assert.match(market, /limit \+ 1/);
});

test("all read endpoints avoid browser caching and return generic database errors", async () => {
  const paths = [
    "../src/app/api/platform/summary/route.ts",
    "../src/app/api/platform/developers/route.ts",
    "../src/app/api/platform/projects/route.ts",
    "../src/app/api/platform/listings/route.ts",
    "../src/app/api/platform/market/route.ts"
  ];
  for (const path of paths) {
    const route = await read(path);
    assert.match(route, /runtime = "nodejs"/);
    assert.match(route, /dynamic = "force-dynamic"/);
    assert.match(route, /platformErrorResponse/);
    assert.match(route, /Cache-Control/);
  }
});
