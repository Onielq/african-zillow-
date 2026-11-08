import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readProjectFile = (path) => readFile(join(root, path), "utf8");

test("Explore media comes only from sourced project-register image and video fields", async () => {
  const modal = await readProjectFile("src/components/explorer/ExploreFeedModal.tsx");
  const projects = await readProjectFile("src/data/project-directory.ts");

  assert.match(modal, /RWANDA_PROJECT_RECORDS\.flatMap/);
  assert.match(modal, /if \(project\.imageUrl\?\.trim\(\)\)/);
  assert.match(modal, /if \(project\.videoUrl\?\.trim\(\)\)/);
  assert.match(projects, /imageUrl\?: string/);
  assert.match(projects, /videoUrl\?: string/);
  assert.match(modal, /Only project media in this category yet/);
});

test("Explore opens a property detail view with project provenance and honest viewer state", async () => {
  const modal = await readProjectFile("src/components/explorer/ExploreFeedModal.tsx");

  assert.match(modal, /Project status on record/);
  assert.match(modal, /Location precision/);
  assert.match(modal, /Open project source/);
  assert.match(modal, /People who viewed this/);
  assert.match(modal, /No viewer records are available yet/);
  assert.match(modal, /not a live unit-availability feed/);
  assert.doesNotMatch(modal, /(?:likes|viewCount|viewers)\s*[:=]/i);
});

test("Explore modal locks background scrolling and supports keyboard dismissal and focus return", async () => {
  const modal = await readProjectFile("src/components/explorer/ExploreFeedModal.tsx");

  assert.match(modal, /document\.body\.style\.overflow = "hidden"/);
  assert.match(modal, /event\.key === "Escape"/);
  assert.match(modal, /event\.key !== "Tab"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /returnFocusRef\.current\?\.focus\(\)/);
  assert.match(modal, /role="dialog"/);
});

test("the map workspace opens the Explore pop-up without replacing Market Explorer", async () => {
  const map = await readProjectFile("src/components/map/MapExperience.tsx");

  assert.match(map, /import \{ ExploreFeedModal \} from "@\/components\/explorer\/ExploreFeedModal"/);
  assert.match(map, /aria-label="Open Explore feed"/);
  assert.match(map, /setExploreFeedOpen\(true\)/);
  assert.match(map, /<ExploreFeedModal/);
  assert.match(map, /returnFocusRef=\{exploreFeedTriggerRef\}/);
  assert.match(map, /href="\/explorer"[\s\S]{0,80}Market explorer/);
});

test("Explore keeps a three-column desktop mosaic, a narrow-screen grid, and reduced-motion support", async () => {
  const css = await readProjectFile("src/components/explorer/explore-feed-modal.module.css");

  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /grid-row: span 2/);
  assert.match(css, /\.tileVideo/);
  assert.match(css, /\.detailVideo/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
