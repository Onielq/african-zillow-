import assert from "node:assert/strict";
import test from "node:test";
import { searchRwandaProjects } from "../src/lib/project-search.js";

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
