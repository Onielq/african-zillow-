/**
 * Historical baseline for clearly labelled exploratory transaction estimates.
 *
 * Official source: NISR, Rwanda Statistical Yearbook 2025, Table 5.2
 * "Land transactions by district", 2023 column.
 * https://statistics.gov.rw/sites/default/files/documents/2025-12/RWANDA_STATISTICAL_YEARBOOK_2025.pdf
 *
 * These are annual 2023 land-transaction counts, NOT current monthly counts.
 * We divide by 12 only to establish a historical monthly baseline.
 *
 * Bugesera's 4,350 figure is a user-reported dashboard reading on 24 Oct 2026.
 * An indexed overview separately displayed 4,031, so the current-month value is
 * retained as an explicitly unverified observation rather than called live data.
 */
export type TransactionDistrictBenchmark = {
  district: string;
  annualTransactions2023: number;
  currentMonthReported?: {
    count: number;
    observedOn: string;
    status: "user-reported-unverified";
    note: string;
  };
};

export const TRANSACTION_DISTRICT_BENCHMARKS: Record<string, TransactionDistrictBenchmark> = {
  bugesera: {
    district: "Bugesera",
    annualTransactions2023: 50698,
    currentMonthReported: {
      count: 4350,
      observedOn: "2026-10-24",
      status: "user-reported-unverified",
      note: "The indexed dashboard overview separately displayed 4,031; current month-to-date figures require direct source reconciliation."
    }
  },
  gasabo: { district: "Gasabo", annualTransactions2023: 73377 },
  kicukiro: { district: "Kicukiro", annualTransactions2023: 40102 },
  nyarugenge: { district: "Nyarugenge", annualTransactions2023: 23527 }
};

export const TRANSACTION_BENCHMARK_SOURCE =
  "https://statistics.gov.rw/sites/default/files/documents/2025-12/RWANDA_STATISTICAL_YEARBOOK_2025.pdf";

export const TRANSACTION_DASHBOARD_SOURCE =
  "https://rwandalanddashboard.lands.rw/transactions";

export function getMonthlyHistoricalBaseline(district: string): number | null {
  const benchmark = TRANSACTION_DISTRICT_BENCHMARKS[district.trim().toLocaleLowerCase("en")];
  return benchmark ? Math.round(benchmark.annualTransactions2023 / 12) : null;
}
