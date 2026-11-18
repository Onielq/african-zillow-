/**
 * Builds a small, evidence-led timeline from source-observed listing snapshots.
 * The source observation is not proof that a property was sold or that it remains
 * available after the source's last observation.
 *
 * @typedef {"active"|"withdrawn"|"expired"|"sold_or_leased"|"unknown"} SourceListingStatus
 * @typedef {Object} ListingObservation
 * @property {string|Date} observed_at
 * @property {string|number} asking_amount
 * @property {string} currency
 * @property {string} rent_period
 * @property {string} listing_status
 */

/** @type {Record<SourceListingStatus, string>} */
const STATUS_LABELS = {
  active: "Active (source reported)",
  withdrawn: "Withdrawn (source reported)",
  expired: "Expired (source reported)",
  sold_or_leased: "Sold or leased (source reported; exact outcome unspecified)",
  unknown: "Status unknown"
};

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizedDecimal(value) {
  const raw = String(value ?? "").trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return raw;
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [integerPart = "0", fractionalPart = ""] = unsigned.split(".");
  const integer = integerPart.replace(/^0+(?=\d)/, "");
  const fraction = fractionalPart.replace(/0+$/, "");
  const isZero = integer === "0" && !fraction;
  return (negative && !isZero ? "-" : "") + integer + (fraction ? "." + fraction : "");
}

/**
 * @param {unknown} value
 * @returns {SourceListingStatus}
 */
export function normalizeSourceListingStatus(value) {
  if (typeof value !== "string") return "unknown";
  return Object.hasOwn(STATUS_LABELS, value) ? /** @type {SourceListingStatus} */ (value) : "unknown";
}

/**
 * The wording deliberately avoids converting a broad source status into a
 * stronger outcome. In particular, "sold_or_leased" is not shown as SOLD.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function sourceListingStatusLabel(value) {
  return STATUS_LABELS[normalizeSourceListingStatus(value)];
}

/**
 * @param {ListingObservation[]} observations
 * @returns {Array<{
 *   eventType: "first_observed"|"asking_price_changed"|"asking_terms_changed"|"status_changed"|"relisted_by_source",
 *   occurredAt: string,
 *   description: string,
 *   sourceReported: true,
 *   previousAskingAmount: string|null,
 *   askingAmount: string,
 *   currency: string,
 *   previousStatus: SourceListingStatus|null,
 *   listingStatus: SourceListingStatus
 * }>}
 */
export function buildMarketListingHistory(observations) {
  const ordered = [...(Array.isArray(observations) ? observations : [])]
    .filter((item) => item && Number.isFinite(new Date(item.observed_at).getTime()))
    .sort((left, right) => new Date(left.observed_at).getTime() - new Date(right.observed_at).getTime());

  /** @type {ReturnType<typeof buildMarketListingHistory>} */
  const events = [];
  let previous = null;

  for (const observation of ordered) {
    const occurredAt = new Date(observation.observed_at).toISOString();
    const status = normalizeSourceListingStatus(observation.listing_status);
    const amount = String(observation.asking_amount);
    const currency = String(observation.currency ?? "").toUpperCase();
    const rentPeriod = String(observation.rent_period ?? "not_applicable");

    if (!previous) {
      events.push({
        eventType: "first_observed",
        occurredAt,
        description: "Listing first observed by the source",
        sourceReported: true,
        previousAskingAmount: null,
        askingAmount: amount,
        currency,
        previousStatus: null,
        listingStatus: status
      });
      previous = { amount, currency, rentPeriod, status };
      continue;
    }

    const amountChanged = normalizedDecimal(previous.amount) !== normalizedDecimal(amount);
    const currencyChanged = previous.currency !== currency;
    const rentPeriodChanged = previous.rentPeriod !== rentPeriod;

    if (amountChanged || currencyChanged || rentPeriodChanged) {
      const isComparablePriceChange = amountChanged && !currencyChanged && !rentPeriodChanged;
      events.push({
        eventType: isComparablePriceChange ? "asking_price_changed" : "asking_terms_changed",
        occurredAt,
        description: isComparablePriceChange
          ? "Source-reported asking price changed"
          : "Source-reported asking terms changed",
        sourceReported: true,
        previousAskingAmount: previous.amount,
        askingAmount: amount,
        currency,
        previousStatus: previous.status,
        listingStatus: status
      });
    }

    if (previous.status !== status) {
      const wasWithdrawnOrExpired = previous.status === "withdrawn" || previous.status === "expired";
      const wasRelisted = wasWithdrawnOrExpired && status === "active";
      events.push({
        eventType: wasRelisted ? "relisted_by_source" : "status_changed",
        occurredAt,
        description: wasRelisted
          ? "Source reported the listing as active again"
          : status === "sold_or_leased"
            ? sourceListingStatusLabel(status)
            : sourceListingStatusLabel(status),
        sourceReported: true,
        previousAskingAmount: previous.amount,
        askingAmount: amount,
        currency,
        previousStatus: previous.status,
        listingStatus: status
      });
    }

    previous = { amount, currency, rentPeriod, status };
  }

  return events;
}
