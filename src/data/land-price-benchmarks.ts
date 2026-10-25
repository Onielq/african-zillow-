/**
 * District-level land transaction/reference-price comparison snapshot.
 *
 * Source: Rwanda Land Dashboard /reference, the table explicitly labelled
 * "Comparison of Transaction Prices and Land Reference Prices".
 * Review date: 2026-10-25. Source observation date and methodology are not
 * disclosed. These values are analytical benchmarks, not formal valuations.
 *
 * The /prices page separately reports Nyarugenge at 50,771 RWF/m²; the
 * /reference comparison reports 50,865 RWF/m² as average transaction price.
 * Use the explicitly labelled transaction-price value for valuation, and keep
 * the discrepancy visible until the publisher reconciles the two pages.
 */
export type DistrictLandPriceBenchmark = {
  district: string;
  province: string;
  averageTransactionPricePerM2: number;
  averageReferencePricePerM2: number;
  sourceUrl: string;
  reviewedOn: string;
  observationDate: string;
  methodologyStatus: string;
  note?: string;
};

export const LAND_PRICE_BENCHMARK_SOURCE =
  "https://rwandalanddashboard.lands.rw/reference";
export const LAND_PRICE_PRICES_CROSSCHECK_SOURCE =
  "https://rwandalanddashboard.lands.rw/prices";

export const DISTRICT_LAND_PRICE_BENCHMARKS: Record<string, DistrictLandPriceBenchmark> = {
  gasabo: {
    district: "Gasabo",
    province: "Kigali City",
    averageTransactionPricePerM2: 36103,
    averageReferencePricePerM2: 19976,
    sourceUrl: LAND_PRICE_BENCHMARK_SOURCE,
    reviewedOn: "2026-10-25",
    observationDate: "Not disclosed on the source page",
    methodologyStatus: "Provisional dashboard comparison; weighting method not disclosed"
  },
  kicukiro: {
    district: "Kicukiro",
    province: "Kigali City",
    averageTransactionPricePerM2: 61499,
    averageReferencePricePerM2: 27914,
    sourceUrl: LAND_PRICE_BENCHMARK_SOURCE,
    reviewedOn: "2026-10-25",
    observationDate: "Not disclosed on the source page",
    methodologyStatus: "Provisional dashboard comparison; weighting method not disclosed"
  },
  nyarugenge: {
    district: "Nyarugenge",
    province: "Kigali City",
    averageTransactionPricePerM2: 50865,
    averageReferencePricePerM2: 28077,
    sourceUrl: LAND_PRICE_BENCHMARK_SOURCE,
    reviewedOn: "2026-10-25",
    observationDate: "Not disclosed on the source page",
    methodologyStatus: "Provisional dashboard comparison; weighting method not disclosed",
    note: "The separate /prices page reports 50,771 RWF/m², a 94 RWF/m² difference. This implementation uses the explicitly labelled Avg Transaction Price value from /reference; reconciliation remains open."
  },
  bugesera: {
    district: "Bugesera",
    province: "Eastern Province",
    averageTransactionPricePerM2: 4038,
    averageReferencePricePerM2: 1145,
    sourceUrl: LAND_PRICE_BENCHMARK_SOURCE,
    reviewedOn: "2026-10-25",
    observationDate: "Not disclosed on the source page",
    methodologyStatus: "Provisional dashboard comparison; weighting method not disclosed"
  }
};

export function getDistrictLandPriceBenchmark(
  district: string | null | undefined
): DistrictLandPriceBenchmark | null {
  const key = (district ?? "").trim().toLocaleLowerCase("en");
  return DISTRICT_LAND_PRICE_BENCHMARKS[key] ?? null;
}
