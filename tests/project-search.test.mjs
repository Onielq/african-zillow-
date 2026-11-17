import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { searchRwandaProjects } from "../src/lib/project-search.js";

const root = process.cwd();
const fixtures = [
  {
    id: "brilliant-tower",
    name: "Brilliant Tower",
    developer: "Brilliant Development Co Ltd",
    category: "Commercial",
    district: "Gasabo",
    sector: "Kimihurura",
    city: "Kigali",
    status: "Delivered"
  },
  {
    id: "inzovu-mall",
    name: "Inzovu Mall",
    developer: "DP World",
    category: "Mixed-use commercial",
    district: "Gasabo",
    sector: "Kimihurura",
    city: "Kigali"
  },
  {
    id: "masaka-views",
    name: "Masaka Views",
    developer: "Fortis Green Housing",
    category: "Residential",
    district: "Kicukiro",
    sector: "Masaka",
    city: "Kigali"
  },
  {
    id: "etoile-residences",
    name: "Résidence Étoile",
    developer: "Étoile Developments",
    category: "Residential",
    district: "Gasabo",
    sector: "Kibagabaga",
    city: "Kigali"
  }
];

test("project search ranks project-name matches above incidental field matches", () => {
  const results = searchRwandaProjects(fixtures, "Brilliant");
  assert.equal(results[0].id, "brilliant-tower");
});

test("project search tolerates a small spelling error without a dependency", () => {
  const results = searchRwandaProjects(fixtures, "briliant tower");
  assert.equal(results[0].id, "brilliant-tower");
});

test("project search can combine a name token with a location token", () => {
  const results = searchRwandaProjects(fixtures, "tower gasabo");
  assert.deepEqual(results.map((project) => project.id), ["brilliant-tower"]);
});

test("project IDs are searchable", () => {
  const results = searchRwandaProjects(fixtures, "brilliant-tower");
  assert.ok(results.some((project) => project.id === "brilliant-tower"));
});

test("all query tokens must match, preventing unrelated area matches", () => {
  assert.deepEqual(searchRwandaProjects(fixtures, "Brilliant Bugesera"), []);
});

test("search ignores case and accents", () => {
  const results = searchRwandaProjects(fixtures, "RESIDENCE ETOILE");
  assert.equal(results[0].id, "etoile-residences");
});

test("an empty query preserves the original register order and record references", () => {
  const results = searchRwandaProjects(fixtures, "   ");
  assert.deepEqual(results, fixtures);
  assert.equal(results[0], fixtures[0]);
});

test("all reports use the shared stylesheet after inline styles and the same page slots", async () => {
  const paths = [
    "public/valia-deck/projects/bwiza-riverside-homes.html",
    "public/valia-deck/projects/brilliant-tower.html",
    "public/valia-deck/projects/inzovu-mall.html",
    "public/valia-deck/projects/heza-estate-batsinda-project.html",
    "public/valia-deck/projects/masaka-views-eco-estate.html",
    "public/valia-deck/projects/rugarama-park-estate.html",
    "public/valia-deck/projects/project-profile.html",
    "public/valia-deck/projects/project-report-template.html"
  ];
  const expectedPages = ["profile", "scope", "delivery", "market", "location"];

  for (const path of paths) {
    const html = await readFile(join(root, path), "utf8");
    const stylePosition = html.lastIndexOf("</style>");
    const sharedStylePosition = html.indexOf('<link rel="stylesheet" href="../report-system.css">');
    assert.ok(stylePosition >= 0, path + " must have inline styles");
    assert.ok(sharedStylePosition > stylePosition, path + " must load shared styles after inline styles");
    const pages = [...html.matchAll(/data-report-page="(profile|scope|delivery|market|location)"/g)]
      .map((match) => match[1]);
    assert.deepEqual(pages, expectedPages, path + " must use the canonical page sequence");
  }

  const bwiza = await readFile(join(root, paths[0]), "utf8");
  assert.match(bwiza, /<html lang="en">/);
  assert.match(bwiza, /<meta name="viewport" content="width=device-width, initial-scale=1">/);

  const css = await readFile(join(root, "public/valia-deck/report-system.css"), "utf8");
  assert.match(css, /\.page\.cover\s*\{/);
  assert.match(css, /\.page\.cover\s*>\s*\.sidebar/);
  assert.match(css, /\.page\.cover\s*>\s*\.side/);
  assert.match(css, /\.page\.cover\s*>\s*\.cover-copy/);
  assert.match(css, /--report-page-width:\s*1280px/);
  assert.match(css, /--report-page-height:\s*720px/);

  const standard = JSON.parse(await readFile(join(root, "public/valia-deck/report-standard.json"), "utf8"));
  assert.equal(standard.standardVersion, 4);
  assert.deepEqual(standard.requiredPages.map((page) => page.key), expectedPages);
  assert.ok(standard.languageRules.length >= 5);
});
