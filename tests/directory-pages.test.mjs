import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readProjectFile = (path) => readFile(join(root, path), "utf8");

test("project and developer directories remain evidence-gated until a feed is verified", async () => {
  const projects = await readProjectFile("src/app/projects/page.tsx");
  const developers = await readProjectFile("src/app/developers/page.tsx");
  const directory = await readProjectFile("src/components/directories/DirectoryLandingPage.tsx");
  const mapExperience = await readProjectFile("src/components/map/MapExperience.tsx");

  assert.match(projects, /kind="projects"/);
  assert.match(projects, /No verified project feed is connected yet/i);
  assert.match(projects, /Source and display permission/i);
  assert.match(developers, /kind="developers"/);
  assert.match(developers, /No verified developer directory is connected yet/i);
  assert.match(developers, /Authority to represent/i);
  assert.match(directory, /This means no records are verified and published in this directory/i);
  assert.ok(directory.includes('href: "/projects"'));
  assert.ok(directory.includes('href: "/developers"'));
  assert.ok(directory.includes('href: "/data-sources"'));
  assert.ok(mapExperience.includes('href="/projects">Open project directory'));
  assert.ok(mapExperience.includes('href="/developers">Open developer directory'));
});

test("official market-source checks test page availability without importing data rows", async () => {
  const healthRoute = await readProjectFile("src/app/api/data-sources/health/route.ts");
  const sourcePage = await readProjectFile("src/app/data-sources/page.tsx");
  const register = await readProjectFile("docs/DATA_SOURCE_REGISTER.md");

  assert.match(healthRoute, /rwandalanddashboard\.lands\.rw\/prices/);
  assert.match(healthRoute, /data\.gov\.rw\/datasets\/3cee397e-8da0-418f-a382-b97feffba7ed/);
  assert.match(healthRoute, /kind === "webpage"/);
  assert.match(healthRoute, /does not read or import market-data rows/i);
  assert.match(sourcePage, /MARKET DATA/);
  assert.match(sourcePage, /two official land-market source pages/i);
  assert.match(register, /A reachable page is not a connected market-data feed/i);
});
