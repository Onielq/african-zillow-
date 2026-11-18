import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMarketListingHistory,
  normalizeSourceListingStatus,
  sourceListingStatusLabel
} from "../src/lib/market-listing-history.js";

const observation = (overrides = {}) => ({
  observed_at: "2026-11-01T10:00:00.000Z",
  asking_amount: "125000000.00",
  currency: "RWF",
  rent_period: "not_applicable",
  listing_status: "active",
  ...overrides
});

test("the first source snapshot starts a timeline without claiming a transaction", () => {
  const [event] = buildMarketListingHistory([observation()]);
  assert.equal(event.eventType, "first_observed");
  assert.equal(event.sourceReported, true);
  assert.match(event.description, /first observed/i);
});

test("price history distinguishes a comparable price change from changed terms", () => {
  const events = buildMarketListingHistory([
    observation(),
    observation({ observed_at: "2026-11-05T10:00:00.000Z", asking_amount: "120000000.00" }),
    observation({
      observed_at: "2026-11-06T10:00:00.000Z",
      asking_amount: "120000000.00",
      currency: "USD"
    })
  ]);
  assert.deepEqual(events.map((event) => event.eventType), [
    "first_observed",
    "asking_price_changed",
    "asking_terms_changed"
  ]);
  assert.equal(events[1].previousAskingAmount, "125000000.00");
  assert.equal(events[1].askingAmount, "120000000.00");
});

test("a withdrawal or expiry followed by active is explicitly labelled source-reported relisting", () => {
  const events = buildMarketListingHistory([
    observation({ listing_status: "expired" }),
    observation({ observed_at: "2026-11-10T10:00:00.000Z", listing_status: "active" })
  ]);
  assert.equal(events[1].eventType, "relisted_by_source");
  assert.match(events[1].description, /source reported/i);
});

test("sold_or_leased never becomes a definitive SOLD result", () => {
  assert.equal(normalizeSourceListingStatus("sold_or_leased"), "sold_or_leased");
  assert.match(sourceListingStatusLabel("sold_or_leased"), /sold or leased/i);
  assert.match(sourceListingStatusLabel("sold_or_leased"), /exact outcome unspecified/i);
  assert.notEqual(sourceListingStatusLabel("sold_or_leased"), "SOLD");
});

test("repeated identical snapshots do not create false price or status events", () => {
  const events = buildMarketListingHistory([
    observation(),
    observation({ observed_at: "2026-11-02T10:00:00.000Z", asking_amount: "125000000" })
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, "first_observed");
});

test("observations are sorted without mutating the source array", () => {
  const later = observation({ observed_at: "2026-11-05T10:00:00.000Z", asking_amount: "120000000" });
  const earlier = observation({ observed_at: "2026-11-01T10:00:00.000Z" });
  const input = [later, earlier];
  const events = buildMarketListingHistory(input);
  assert.equal(events[0].occurredAt, "2026-11-01T10:00:00.000Z");
  assert.equal(input[0], later);
});
