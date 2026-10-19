import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readProjectFile = (path) => readFile(join(root, path), "utf8");

test("the starter shell does not pretend live land data is connected", async () => {
  const page = await readProjectFile("src/app/page.tsx");
  assert.match(page, /No live map connected/);
  assert.match(page, /No parcel records loaded/);
  assert.match(page, /later phase/);
});

test("the design system includes reduced-motion handling", async () => {
  const css = await readProjectFile("src/app/globals.css");
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /--brand:\s*#176B50/i);
});

test("map and motion engines are included for their planned phases", async () => {
  const packageJson = JSON.parse(await readProjectFile("package.json"));
  assert.ok(packageJson.dependencies["maplibre-gl"]);
  assert.ok(packageJson.dependencies.gsap);
});
