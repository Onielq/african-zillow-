import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";

const resolvedEntry = fileURLToPath(import.meta.resolve("maplibre-gl"));

function findPackageRoot(startPath) {
  let current = dirname(startPath);
  const filesystemRoot = parse(current).root;

  while (current !== filesystemRoot) {
    const manifestPath = join(current, "package.json");
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        if (manifest.name === "maplibre-gl" && manifest.version) {
          return { root: current, version: String(manifest.version) };
        }
      } catch {
        // Continue walking up until the MapLibre package manifest is found.
      }
    }
    current = dirname(current);
  }

  throw new Error(
    "Could not locate the maplibre-gl package. Run npm install and try again."
  );
}

const { root: packageRoot, version } = findPackageRoot(resolvedEntry);
const sourceDirectory = join(packageRoot, "dist");
const destinationDirectory = join(
  process.cwd(),
  "public",
  "vendor",
  "maplibre-gl",
  version
);

const requiredFiles = [
  "maplibre-gl-worker.mjs",
  "maplibre-gl-shared.mjs"
];

for (const fileName of requiredFiles) {
  const source = join(sourceDirectory, fileName);
  if (!existsSync(source)) {
    throw new Error(
      `Expected MapLibre worker asset was not found: ${source}. Check the installed MapLibre version.`
    );
  }
}

mkdirSync(destinationDirectory, { recursive: true });
for (const fileName of requiredFiles) {
  copyFileSync(
    join(sourceDirectory, fileName),
    join(destinationDirectory, fileName)
  );
}

console.log(
  `MapLibre GL JS ${version} worker assets copied to public/vendor/maplibre-gl/${version}/`
);
