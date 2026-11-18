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
  assert.match(source, /Verified listings are required to draw price bands/);
  assert.match(source, /Live count unavailable/);
  assert.match(source, /Inventory not connected/);
  assert.match(source, /map-filter-price-columns/);
  assert.match(source, /map-filter-price-section/);
  assert.match(source, /key: "list"/);
  assert.match(source, /key: "monthly"/);
  assert.match(source, /map-filter-dual-slider/);
  assert.match(source, /updatePriceSlider\(range\.key, "min"/);
  assert.match(source, /updatePriceSlider\(range\.key, "max"/);
  assert.match(source, /rangeOutOfBounds/);
  assert.match(source, /RWF 0 and RWF 1 trillion/);
  assert.match(source, /Maximum must be greater than minimum/);
  assert.doesNotMatch(source, /priceRangeMode/);
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
  for (const code of ["R1", "R1A", "R1B", "R2", "R3", "R4", "RS", "A", "A1", "A2", "B", "B1", "B2", "B3", "B4", "C1", "C2", "C3", "C4", "ET", "F", "F1", "F2", "F3", "F4", "F5", "F6", "I", "I1", "I2", "I3", "OS", "P1", "P2", "P3B", "P3C", "PA", "PF", "PF1", "PF2", "PF3", "PF4", "PF5", "PF6", "T", "T1", "T2", "T3", "T4", "U", "UE", "W1A", "W1B", "W2", "W3", "W4", "W5", "WB"]) {
    assert.match(source, new RegExp('"'+code+'"'));
  }
  assert.match(source, /All zoning/);
  assert.match(source, /zoningInfoOpen/);
  assert.match(source, /Typical plot measurement/);
  assert.match(source, /District-plan and housing-type specific/);
  assert.match(source, /ZONING_FILTER_DESCRIPTIONS/);
  assert.match(source, /A3 and A4 were not present/);
  assert.match(source, /NLA zoning regulations/);
  assert.match(source, /geodata\\.rw\\/server\\/rest\\/services/);
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


test("filter values summarize in the toolbar and Reset all clears every filter state", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  assert.match(source, /priceSummary/);
  assert.match(source, /measurementSummary/);
  assert.match(source, /bedsBathsSummary/);
  assert.match(source, /selectedZoneCodes.length > 0/);
  assert.match(source, /activeFilterCount > 0/);
  assert.match(source, /className="map-filter-reset"/);
  assert.match(source, /Reset all/);
  assert.match(source, /const resetMapFilters = \(\) =>/);
  assert.match(source, /setZoningSearch\(""/);
});

test("plot and interior measurement ranges are kept separate when the area basis changes", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  assert.match(source, /type MeasurementBasis = "plot" \| "interior"/);
  assert.match(source, /Plot area/);
  assert.match(source, /Interior area/);
  assert.match(source, /measurementBasis: "plot", measurementMin: "", measurementMax: ""/);
  assert.match(source, /measurementBasis: "interior", measurementMin: "", measurementMax: ""/);
  assert.match(source, /measurementBasisChanged/);
  assert.match(source, /interior floor area/);
});

test("land-only selections switch to plot measurement and clear room filters", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  assert.match(source, /const landOnly = nextTypes\.length > 0/);
  assert.match(source, /measurementBasis: nextMeasurementBasis/);
  assert.match(source, /bedroomsMin: landOnly \? ""/);
  assert.match(source, /bathroomsMin: landOnly \? ""/);
  assert.match(source, /bedroomsExact: landOnly \? false/);
  assert.match(source, /bathroomsExact: landOnly \? false/);
});

test("exact-match toggles require a selected bedroom or bathroom value", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  assert.match(source, /disabled=\{bedsBathsDisabled \|\| !mapFilters\.bedroomsMin\}/);
  assert.match(source, /disabled=\{bedsBathsDisabled \|\| !mapFilters\.bathroomsMin\}/);
  assert.match(source, /bedroomsExact: value \? current\.bedroomsExact : false/);
  assert.match(source, /bathroomsExact: value \? current\.bathroomsExact : false/);
});

test("the price track cannot render a negative width when manual bounds are temporarily invalid", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  assert.match(source, /width: \(Math\.max\(0, Math\.max\(0,/);
  assert.match(source, /Maximum must be greater than minimum/);
});

test("zoning information points to official plan sources and avoids universal plot-size claims", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  assert.match(source, /https:\/\/www\.lands\.rw\/publications\/master-plans/);
  assert.match(source, /https:\/\/geodata\.rw\/server\/rest\/services\/Hosted\/Gakenke_DLUP_20042026\/MapServer\/legend/);
  assert.match(source, /A3 and A4 were not present in the official plan legends checked/);
  assert.match(source, /Those figures must not be copied to other districts/);
});

test("list price and monthly payment are visible as two independent side-by-side sections", async () => {
  const source = await read("../src/components/map/MapExperience.tsx");
  assert.match(source, /className="map-filter-price-columns"/);
  assert.match(source, /title: "List price"/);
  assert.match(source, /title: "Monthly payment"/);
  assert.match(source, /minKey: "priceMin"/);
  assert.match(source, /maxKey: "priceMax"/);
  assert.match(source, /minKey: "monthlyPaymentMin"/);
  assert.match(source, /maxKey: "monthlyPaymentMax"/);
  assert.match(source, /aria-label=\{range\.title \+ " minimum slider"\}/);
  assert.match(source, /aria-label=\{range\.title \+ " maximum slider"\}/);
});
