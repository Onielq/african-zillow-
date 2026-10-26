import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const sourcePath = join(root, "public", "land-price-transaction.tsv");
const outputPath = join(root, "src", "data", "land-price-transaction.generated.ts");
const expectedHeader = "PROVINCE\tDISTRICT\tSECTOR\tCELL\tWEIGHTED AVERAGE TRANSACTION PRICE (RWF/M²)";
const source = await readFile(sourcePath, "utf8");
const lines = source.trimEnd().split(/\r?\n/);
if (lines[0] !== expectedHeader) {
  throw new Error("Unexpected header in public/land-price-transaction.tsv");
}

const rows = [];
for (const [lineIndex, line] of lines.slice(1).entries()) {
  if (!line.trim()) continue;
  const fields = line.split("\t");
  if (fields.length !== 5 || fields.slice(0, 4).some((field) => !field.trim())) continue;
  const [province, district, sector, cell, priceText] = fields;
  const price = Number(priceText.replace(/,/g, "").trim());
  if (![province, district, sector, cell].every((value) => value.trim()) || !Number.isFinite(price) || price <= 0) continue;
  rows.push([province.trim(), district.trim(), sector.trim(), cell.trim(), price, lineIndex + 2]);
}
if (rows.length === 0) throw new Error("No valid transaction data rows were generated.");

const generated = [
  "// Generated from public/land-price-transaction.tsv by scripts/generate-land-price-index.mjs.",
  "// Do not edit manually; rerun the generator when the source TSV changes.",
  "export type LandPriceTransactionRow = readonly [",
  "  province: string,",
  "  district: string,",
  "  sector: string,",
  "  cell: string,",
  "  weightedAverageTransactionPriceRwfPerM2: number,",
  "  sourceRow: number",
  "];",
  "",
  "export const LAND_PRICE_TRANSACTION_ROWS = [",
  ...rows.map((row) => `  ${JSON.stringify(row)},`),
  "] as const satisfies readonly LandPriceTransactionRow[];",
  ""
].join("\n");

await mkdir(join(root, "src", "data"), { recursive: true });
await writeFile(outputPath, generated, "utf8");
console.log(`Generated ${rows.length} land transaction rows for Worker-compatible runtime use.`);
