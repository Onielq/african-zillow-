import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readProjectFile = (path) => readFile(join(root, path), "utf8");

const requiredPageKeys = ["profile", "scope", "delivery", "market", "location"];
const sectionLabels = [
  "02 · Project Scope & Products",
  "03 · Development & Delivery",
  "04 · Price & Market Intelligence",
  "05 · Location & Verification",
];

const dedicatedReports = [
  { path: "public/valia-deck/projects/bwiza-riverside-homes.html", assetType: "residential" },
  { path: "public/valia-deck/projects/heza-estate-batsinda-project.html", assetType: "residential" },
  { path: "public/valia-deck/projects/masaka-views-eco-estate.html", assetType: "residential" },
  { path: "public/valia-deck/projects/rugarama-park-estate.html", assetType: "mixed-use" },
  { path: "public/valia-deck/projects/brilliant-tower.html", assetType: "commercial" },
  { path: "public/valia-deck/projects/inzovu-mall.html", assetType: "commercial" },
];

function reportPageTags(html) {
  return [...html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bdata-report-page=["']([^"']+)["'][^>]*)>/gi)]
    .map((match) => ({
      tagName: match[1].toLowerCase(),
      attributes: match[2],
      key: match[3],
      assetType: (match[2].match(/\bdata-report-type=["']([^"']+)["']/i) || [])[1] ?? null,
    }));
}

test("all dedicated reports share the same five-page contract and an explicit asset type", async () => {
  for (const report of dedicatedReports) {
    const html = await readProjectFile(report.path);
    const pages = reportPageTags(html);

    assert.deepEqual(
      pages.map((page) => page.key),
      requiredPageKeys,
      report.path + " must keep the canonical page order",
    );
    assert.ok(
      pages.every((page) => page.assetType === report.assetType),
      report.path + " must label all pages as " + report.assetType,
    );
    assert.match(html, /href=["']\.\.\/report-system\.css["']/i);
  }
});

test("non-reference reports use the same section markers and page numbers", async () => {
  for (const report of dedicatedReports.slice(1)) {
    const html = await readProjectFile(report.path);
    for (const label of sectionLabels) {
      assert.ok(html.includes(label), report.path + " is missing section marker: " + label);
    }
    for (let page = 1; page <= 5; page += 1) {
      const pageNumber = String(page).padStart(2, "0");
      assert.ok(html.includes(pageNumber + " /"), report.path + " is missing page footer " + pageNumber);
    }
  }
});

test("project report imagery and embedded maps have accessible text alternatives", async () => {
  for (const report of dedicatedReports) {
    const html = await readProjectFile(report.path);
    const images = [...html.matchAll(/<img\b([^>]*)>/gi)];
    const frames = [...html.matchAll(/<iframe\b([^>]*)>/gi)];

    assert.ok(images.length > 0, report.path + " should include a project image or visual placeholder");
    assert.ok(
      images.every((image) => /\balt\s*=/.test(image[1])),
      report.path + " contains an image without an alt attribute",
    );
    assert.equal(frames.length, 2, report.path + " should include project and local-area maps");
    assert.ok(
      frames.every((frame) => /\btitle=["'][^"']+["']/.test(frame[1]) && /\bloading=["']lazy["']/.test(frame[1])),
      report.path + " maps need descriptive titles and lazy loading",
    );
  }
});

test("commercial scope pages describe commercial space, not bedroom schedules", async () => {
  const commercialReports = dedicatedReports.filter((report) => report.assetType === "commercial");

  for (const report of commercialReports) {
    const html = await readProjectFile(report.path);
    const scopePage = html.match(
      /<(?:section|div)\b[^>]*\bdata-report-page=["']scope["'][^>]*>([\s\S]*?)(?=<(?:section|div)\b[^>]*\bdata-report-page=)/i,
    );
    assert.ok(scopePage, report.path + " has no scope page");
    assert.doesNotMatch(scopePage[1], /bedrooms?/i);
    assert.match(scopePage[1], /space|office|retail|commercial|hotel|room/i);
  }
});

test("the shared report stylesheet controls commercial covers and section progress consistently", async () => {
  const css = await readProjectFile("public/valia-deck/report-system.css");

  assert.ok(css.includes(".page.cover:not(.bwiza-cover) > .cover-copy"));
  assert.ok(css.includes(".page.cover:not(.bwiza-cover) > .cover-image"));
  assert.ok(css.includes('.page[data-report-page="scope"] { --report-progress: 40%; }'));
  assert.ok(css.includes('.page[data-report-page="delivery"] { --report-progress: 60%; }'));
  assert.ok(css.includes('.page[data-report-page="market"] { --report-progress: 80%; }'));
  assert.ok(css.includes('.page[data-report-page="location"] { --report-progress: 100%; }'));
});

test("the generic fallback initializes location values before using them and classifies mixed-use assets", async () => {
  const html = await readProjectFile("public/valia-deck/projects/project-profile.html");
  const areaCityIndex = html.indexOf("const areaCity");
  const locationPartsIndex = html.indexOf("const locationParts");
  const firstAddressUse = html.indexOf('set("address"');
  const firstLocationNoteUse = html.indexOf('set("locationNote"');

  assert.ok(areaCityIndex >= 0 && areaCityIndex < firstAddressUse);
  assert.ok(locationPartsIndex >= 0 && locationPartsIndex < firstAddressUse);
  assert.ok(areaCityIndex < firstLocationNoteUse);
  assert.ok(html.includes("const categoryIsMixedUse = /mixed[\\s-]?use/i.test(category);"));
  assert.ok(html.includes("const assetType = categoryIsMixedUse"));
  assert.ok(html.includes("page.dataset.reportType = assetType;"));
});

test("the report-standard manifest defines canonical asset types and evidence language", async () => {
  const standard = JSON.parse(await readProjectFile("public/valia-deck/report-standard.json"));

  assert.equal(standard.standardVersion, 4);
  assert.deepEqual(
    standard.reportContract.pageSequence.map((page) => page.key),
    requiredPageKeys,
  );
  assert.deepEqual(
    standard.reportContract.assetTypes,
    ["residential", "commercial", "mixed-use", "unknown"],
  );
  assert.ok(standard.languageStandard.evidenceLabels.includes("Availability unverified"));
  assert.ok(standard.languageStandard.rules.some((rule) => /bedrooms/i.test(rule) && /commercial/i.test(rule)));
});


test("the living report style guide documents shared design and asset-specific language", async () => {
  const guide = await readProjectFile("public/valia-deck/report-styleguide.html");

  for (const section of ["tokens", "type", "evidence", "products", "markets", "location", "language"]) {
    assert.ok(guide.includes('id="' + section + '"'), "style guide is missing section: " + section);
  }
  assert.ok(guide.includes("Commercial"));
  assert.ok(guide.includes("bedroom counts for office towers"));
  assert.ok(guide.includes("City Jewels"));
  assert.ok(guide.toLowerCase().includes("monthly rent"));
});


test("new project report templates start as unclassified instead of guessing an asset type", async () => {
  const template = await readProjectFile("public/valia-deck/projects/project-report-template.html");
  const pages = reportPageTags(template);

  assert.deepEqual(pages.map((page) => page.key), requiredPageKeys);
  assert.ok(pages.every((page) => page.assetType === "unknown"));
});
