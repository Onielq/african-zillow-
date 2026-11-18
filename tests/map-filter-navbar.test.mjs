import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";

const read = (file) => fs.readFile(new URL(file, import.meta.url), "utf8");

test("the map filter trigger is icon-only and opens a second row under the main toolbar", async () => {
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

test("each requested filter has its own trigger and separate dropdown", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  for (const label of [
    "Sale / Rent",
    "Price",
    "Property type",
    "Zoning",
    "Measurement",
    "Beds / Baths"
  ]) {
    assert.ok(source.includes(label), "missing filter: " + label);
  }
  assert.equal((source.match(/aria-haspopup="dialog"/g) ?? []).length >= 6, true);
  assert.match(source, /activeFilterMenu === "sale"/);
  assert.match(source, /activeFilterMenu === "price"/);
  assert.match(source, /activeFilterMenu === "property"/);
  assert.match(source, /activeFilterMenu === "zoning"/);
  assert.match(source, /activeFilterMenu === "measurement"/);
  assert.match(source, /activeFilterMenu === "bedsBaths"/);
});

test("price and measurement controls expose independent minimum and maximum inputs", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  assert.match(source, /priceMin/);
  assert.match(source, /priceMax/);
  assert.match(source, /measurementMin/);
  assert.match(source, /measurementMax/);
  assert.match(source, /Maximum must be greater than minimum/);
  assert.match(source, /Area \(m²\)/);
});

test("property, zoning, bedroom and bathroom choices are present", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  for (const label of [
    "Land",
    "Apartment",
    "House / Villa",
    "Commercial",
    "Industrial",
    "Mixed-use",
    "R1",
    "C",
    "A",
    "bedroomsMin",
    "bathroomsMin"
  ]) {
    assert.ok(source.includes(label), "missing filter option or value: " + label);
  }
});

test("filter menus close on Escape, outside click and when another primary menu opens", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /filterSubnavRef\.current\?\.contains\(event\.target\)/);
  assert.match(source, /closeFilterMenus\(\)/);
});
