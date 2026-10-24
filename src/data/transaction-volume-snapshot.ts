export const TRANSACTION_VOLUME_SNAPSHOT = [
  {
    district: "Bugesera",
    transactionCount: 4350,
    period: "Current month",
    observedOn: "2026-10-24",
    sourceUrl: "https://rwandalanddashboard.lands.rw/transactions",
    status:
      "User-provided dashboard reading, observed 24 Oct 2026; not a live feed. Publicly indexed snapshot differed, so verify against the publisher before relying on the count."
  }
] as const;

export type TransactionVolumeObservation =
  (typeof TRANSACTION_VOLUME_SNAPSHOT)[number];
