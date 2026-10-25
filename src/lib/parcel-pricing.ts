/**
 * Product pricing rule for a parcel:
 * asking price = parcel area (m²) × average transaction price per m².
 * The caller supplies the best currently available cell/sector/district rate.
 */
export function calculateParcelAskingPrice(
  parcelAreaM2: number | null | undefined,
  averageTransactionPricePerM2: number | null | undefined
): number | null {
  if (
    typeof parcelAreaM2 !== "number" ||
    !Number.isFinite(parcelAreaM2) ||
    parcelAreaM2 <= 0 ||
    typeof averageTransactionPricePerM2 !== "number" ||
    !Number.isFinite(averageTransactionPricePerM2) ||
    averageTransactionPricePerM2 <= 0
  ) {
    return null;
  }

  return Math.round(parcelAreaM2 * averageTransactionPricePerM2);
}
