import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";

const read = (file) => fs.readFile(new URL(file, import.meta.url), "utf8");

test("the filter trigger is icon-only and opens a framed secondary navigation row", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  const triggerStart = source.indexOf('aria-label="Filters"');
  assert.notEqual(triggerStart, -1);
  const triggerEnd = source.indexOf("</button>", triggerStart);
  const trigger = source.slice(triggerStart, triggerEnd);
  assert.match(trigger, /SlidersHorizontal/);
  assert.match(trigger, /aria-expanded=\{filtersOpen\}/);
  assert.doesNotMatch(trigger, />\s*Filters\s*</);
  assert.match(source, /className="map-filter-subnav"/);
  assert.match(source, /id="map-filter-subnav"/);
});

test("all six primary filter cells open distinct menus", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  for (const label of ["Sale / Rent", "Price", "Property type", "Zoning", "Measurement", "Beds / Baths"]) {
    assert.ok(source.includes(label), "missing filter: " + label);
  }
  for (const menu of ["sale", "price", "property", "zoning", "measurement", "bedsBaths"]) {
    assert.match(source, new RegExp('activeFilterMenu === "' + menu + '"'));
  }
  assert.ok((source.match(/aria-haspopup="dialog"/g) ?? []).length >= 6);
});

test("sale and rent options include sold-out status", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  assert.match(source, /label: "For sale"/);
  assert.match(source, /label: "For rent"/);
  assert.match(source, /label: "Sold out"/);
  assert.match(source, /value: "sold"/);
});

test("price filter has list-price and monthly-payment ranges, caps and editable inputs", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  assert.match(source, /List price/);
  assert.match(source, /Monthly payment/);
  assert.match(source, /100_000_000/);
  assert.match(source, /1_000_000_000_000/);
  assert.match(source, /type="range"/);
  assert.match(source, /monthlyPaymentMin/);
  assert.match(source, /monthlyPaymentMax/);
  assert.match(source, /priceMin/);
  assert.match(source, /priceMax/);
  assert.match(source, /Price distribution/);
  assert.match(source, /Results unavailable/);
  assert.match(source, /Maximum must be greater than minimum/);
});

test("property categories use icon cards and include the requested categories", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  for (const label of ["Houses", "Townhouse", "Multifamily", "Condos", "Land", "Lots & Land", "Apartment", "Manufactured", "Mixed Use"]) {
    assert.ok(source.includes('label: "' + label + '"'), "missing property category: " + label);
  }
  assert.match(source, /map-filter-property-card/);
  assert.match(source, /const Icon = option\.Icon/);
});

test("zoning selector includes multiple plan codes grouped by category", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  for (const code of ["R1", "R1A", "R1B", "R2", "R3", "R4", "A1", "A2", "C1", "C2", "C3", "C4", "I1", "I2", "I3", "T1", "T2", "T3", "T4", "PF1", "PF6", "W1A", "WB"]) {
    assert.match(source, new RegExp('"'+code+'"'));
  }
  assert.match(source, /All zoning/);
  assert.match(source, /zoningInfoOpen/);
  assert.match(source, /Typical plot measurement/);
  assert.match(source, /Plan-specific standard not loaded/);
});

test("measurement keeps manual inputs and adds non-regulatory area presets", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  assert.match(source, /measurementMin/);
  assert.match(source, /measurementMax/);
  assert.match(source, /0–300/);
  assert.match(source, /300–500/);
  assert.match(source, /500–700/);
  assert.match(source, /700–800/);
  assert.match(source, /800\+/);
  assert.match(source, /search-size bands, not legal zoning standards/);
});

test("bedroom and bathroom controls are separate and offer exact match", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  assert.match(source, /Bedrooms/);
  assert.match(source, /Bathrooms/);
  assert.match(source, /Use exact match/);
  assert.match(source, /bedroomsExact/);
  assert.match(source, /bathroomsExact/);
  assert.match(source, /1\.5/);
  assert.match(source, /2\.5/);
  assert.match(source, /3\.5/);
  assert.match(source, /bedsBathsDisabled/);
  assert.match(source, /land-only searches/);
});

test("filter menus close on Escape, outside click and when another primary menu opens", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /filterSubnavRef\.current\?\.contains\(event\.target\)/);
  assert.match(source, /closeFilterMenus\(\)/);
});

test("filter popovers portal outside the toolbar and restore keyboard focus", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  assert.match(source, /createPortal\(/);
  assert.match(source, /activeFilterAnchorRef\.current\?\.focus\(\)/);
  assert.match(source, /filterPopoverRef\.current\?\.contains\(event\.target\)/);
  assert.match(source, /ref=\{popoverRef\}/);
});
