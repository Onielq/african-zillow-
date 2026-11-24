"use client";

import { useState, type FormEvent } from "react";
import { ExternalLink, FileSearch, MapPin, X } from "lucide-react";
import styles from "./buyer-listing-lookup.module.css";

export type BuyerListingRecord = {
  inventoryKind?: "external_source" | "first_party_taiseel";
  listingReference?: string | null;
  sourceListingId: string | null;
  sourceKey: string | null;
  sourceTitle: string | null;
  sourcePublisher: string | null;
  sourceUrl: string | null;
  attributionRequired: boolean;
  listingType: "sale" | "rent";
  askingAmount: string;
  currency: string;
  rentPeriod: string;
  propertyType: string;
  district: string;
  sector: string | null;
  propertyAreaSqm: string | null;
  listingUrl: string | null;
  sourceReportedStatus: string;
  firstSeenAt: string;
  lastSeenAt: string;
  cell: string | null;
  address: string | null;
  projectName: string | null;
  buildingName: string | null;
  unitLabel: string | null;
  bedrooms: number | null;
  bathrooms: string | null;
  internalAreaSqm: string | null;
  plotAreaSqm: string | null;
};

export type BuyerVerifiedParcelLink = {
  upi: string;
  parcelNumber: string | null;
  parcelAreaSqm: string | null;
  parcelRecordStatus: string;
  relationshipRole: string;
  evidenceType: string;
  reviewedAt: string;
};

type BuyerListingLookupResponse = {
  ok: true;
  dataStatus: "available";
  linkStatus: "no_verified_primary_site_link" | "verified" | "multiple_verified_links";
  listing: BuyerListingRecord;
  parcelLinks: BuyerVerifiedParcelLink[];
  note: string;
};

type Props = {
  onParcelSelected: (
    upi: string,
    listing: BuyerListingRecord,
    link: BuyerVerifiedParcelLink
  ) => Promise<boolean>;
};

function formatAskingPrice(listing: BuyerListingRecord): string {
  const amount = Number(listing.askingAmount);
  if (!Number.isFinite(amount) || amount <= 0) return "Price not supplied";
  const formatted = new Intl.NumberFormat("en-RW", {
    maximumFractionDigits: 0
  }).format(amount);
  const rentPeriod = listing.listingType === "rent" && listing.rentPeriod !== "not_applicable"
    ? " / " + listing.rentPeriod
    : "";
  return formatted + " " + listing.currency + rentPeriod;
}

function listingKindLabel(listing: BuyerListingRecord): string {
  if (listing.inventoryKind === "first_party_taiseel") {
    return listing.listingType === "rent" ? "Taiseel listing for rent" : "Taiseel listing for sale";
  }
  return listing.listingType === "rent" ? "Advertised for rent" : "Advertised for sale";
}

export function BuyerListingLookup({ onParcelSelected }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [lookupMode, setLookupMode] = useState<"external_source" | "first_party_taiseel">("external_source");
  const [sourceKey, setSourceKey] = useState("");
  const [listingId, setListingId] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [result, setResult] = useState<BuyerListingLookupResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectionMessage, setSelectionMessage] = useState("");
  const [selectingUpi, setSelectingUpi] = useState<string | null>(null);

  const findListing = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const source = sourceKey.trim();
    const id = listingId.trim();
    if (!id || (lookupMode === "external_source" && !source)) return;

    setStatus("loading");
    setResult(null);
    setErrorMessage("");
    setSelectionMessage("");
    setSelectingUpi(null);

    try {
      const params = lookupMode === "external_source"
        ? new URLSearchParams({ sourceKey: source, listingId: id })
        : new URLSearchParams({ listingReference: id });
      const endpoint = lookupMode === "external_source"
        ? "/api/market/listing-profile?"
        : "/api/market/exchange/listing-profile?";
      const response = await fetch(endpoint + params.toString(), {
        cache: "no-store"
      });
      const payload = await response.json() as BuyerListingLookupResponse | {
        ok?: false;
        message?: string;
      };
      if (!response.ok || !("listing" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The listing could not be found."
        );
      }
      setResult(payload);
      setStatus("ready");

      if (payload.parcelLinks.length === 1) {
        await selectParcel(payload.parcelLinks[0], payload.listing);
      }
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error
        ? error.message
        : "Listing lookup is temporarily unavailable.");
    }
  };

  const selectParcel = async (
    link: BuyerVerifiedParcelLink,
    listing: BuyerListingRecord
  ) => {
    setSelectingUpi(link.upi);
    setSelectionMessage("");
    try {
      const opened = await onParcelSelected(link.upi, listing, link);
      if (opened) {
        setIsOpen(false);
        setStatus("idle");
        setResult(null);
        return;
      }
      setSelectionMessage(
        "This UPI has a verified listing link, but the parcel was not found in the connected cadastral map coverage. No location was guessed."
      );
    } catch {
      setSelectionMessage(
        "The linked parcel could not be opened from the current map sources. The verified relationship has been kept separate from a guessed location."
      );
    } finally {
      setSelectingUpi(null);
    }
  };

  return (
    <div className={styles.wrapper}>
      <button
        aria-controls="buyer-listing-lookup-panel"
        aria-expanded={isOpen}
        className={isOpen ? styles.triggerActive : styles.trigger}
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <FileSearch aria-hidden="true" size={15} strokeWidth={1.9} />
        <span>Listing ID</span>
      </button>

      {isOpen ? (
        <section
          aria-label="Search by property listing ID"
          className={styles.panel}
          id="buyer-listing-lookup-panel"
        >
          <header className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>MARKETPLACE ENTRY</p>
              <h3>Find a property listing</h3>
            </div>
            <button
              aria-label="Close listing search"
              className={styles.close}
              onClick={() => setIsOpen(false)}
              type="button"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </header>

          <form className={styles.form} onSubmit={findListing}>
            <div className={styles.modeSwitch} role="group" aria-label="Listing inventory">
              <button
                aria-pressed={lookupMode === "external_source"}
                className={lookupMode === "external_source" ? styles.modeOptionActive : styles.modeOption}
                onClick={() => {
                  setLookupMode("external_source");
                  setStatus("idle");
                  setResult(null);
                  setErrorMessage("");
                  setSelectionMessage("");
                }}
                type="button"
              >
                External source
              </button>
              <button
                aria-pressed={lookupMode === "first_party_taiseel"}
                className={lookupMode === "first_party_taiseel" ? styles.modeOptionActive : styles.modeOption}
                onClick={() => {
                  setLookupMode("first_party_taiseel");
                  setStatus("idle");
                  setResult(null);
                  setErrorMessage("");
                  setSelectionMessage("");
                }}
                type="button"
              >
                Taiseel Exchange
              </button>
            </div>
            {lookupMode === "external_source" ? (
              <label className={styles.field}>
                <span>Listing source key</span>
                <input
                  autoComplete="off"
                  maxLength={100}
                  onChange={(event) => setSourceKey(event.target.value)}
                  placeholder="For example: source-key"
                  required
                  value={sourceKey}
                />
              </label>
            ) : null}
            <label className={styles.field}>
              <span>{lookupMode === "first_party_taiseel" ? "Taiseel listing reference" : "Source listing ID"}</span>
              <input
                autoComplete="off"
                maxLength={lookupMode === "first_party_taiseel" ? 120 : 200}
                onChange={(event) => setListingId(event.target.value)}
                placeholder={lookupMode === "first_party_taiseel"
                  ? "Paste the reference shown on the Taiseel listing"
                  : "Paste the ID from the listing source"}
                required
                value={listingId}
              />
            </label>
            <p className={styles.help}>
              {lookupMode === "first_party_taiseel"
                ? "Taiseel references resolve only published listings with valid seller authorization. A seller's address or map location does not prove parcel identity."
                : "Use the listing ID supplied by its source. A street address or nearby location is not used to link it to a parcel."}
            </p>
            <button className={styles.submit} disabled={status === "loading"} type="submit">
              {status === "loading" ? "Checking listing…" : "Find listing"}
            </button>
          </form>

          {status === "error" ? (
            <p className={styles.message} role="status">{errorMessage}</p>
          ) : null}

          {result ? (
            <div className={styles.result} aria-live="polite">
              <div className={styles.resultHeader}>
                <span className={styles.sourceLabel}>
                  {result.listing.inventoryKind === "first_party_taiseel"
                    ? "Taiseel Exchange"
                    : result.listing.sourcePublisher ?? result.listing.sourceTitle ?? result.listing.sourceKey ?? "External source"}
                </span>
                <span className={styles.sourceStatus}>
                  {result.listing.inventoryKind === "first_party_taiseel"
                    ? "Taiseel status · " + result.listing.sourceReportedStatus
                    : "Source reported · " + result.listing.sourceReportedStatus}
                </span>
              </div>
              <p className={styles.resultTitle}>
                {result.listing.projectName ?? result.listing.buildingName ?? result.listing.address ?? result.listing.propertyType}
              </p>
              <p className={styles.resultPrice}>{formatAskingPrice(result.listing)}</p>
              <p className={styles.resultMeta}>
                {listingKindLabel(result.listing)} · {result.listing.propertyType} · {result.listing.district}
                {result.listing.sector ? " · " + result.listing.sector : ""}
                {result.listing.propertyAreaSqm ? " · " + result.listing.propertyAreaSqm + " m²" : ""}
              </p>
              {result.listing.listingUrl ? (
                <a
                  className={styles.sourceLink}
                  href={result.listing.listingUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open original listing <ExternalLink aria-hidden="true" size={12} />
                </a>
              ) : result.listing.sourceUrl ? (
                <a
                  className={styles.sourceLink}
                  href={result.listing.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open source <ExternalLink aria-hidden="true" size={12} />
                </a>
              ) : null}
              {result.listing.attributionRequired ? (
                <p className={styles.help}>Source attribution is required when this record is displayed.</p>
              ) : null}

              {result.parcelLinks.length === 0 ? (
                <div className={styles.unlinked} role="status">
                  <strong>No verified parcel link</strong>
                  <p>
                    {result.note} The listing remains a separate market record; its location is not treated as parcel identity.
                  </p>
                </div>
              ) : (
                <div className={styles.links}>
                  <strong>
                    {result.parcelLinks.length === 1
                      ? "Independently verified parcel link"
                      : "Choose the linked parcel"}
                  </strong>
                  <p className={styles.help}>{result.note}</p>
                  {result.parcelLinks.map((link) => (
                    <button
                      className={styles.parcelChoice}
                      disabled={selectingUpi !== null}
                      key={link.upi + ":" + link.relationshipRole}
                      onClick={() => void selectParcel(link, result.listing)}
                      type="button"
                    >
                      <MapPin aria-hidden="true" size={15} />
                      <span>
                        <strong>{link.upi}</strong>
                        <small>
                          {link.relationshipRole.replaceAll("_", " ")}
                          {link.parcelNumber ? " · Parcel " + link.parcelNumber : ""}
                          {link.parcelAreaSqm ? " · " + link.parcelAreaSqm + " m²" : ""}
                        </small>
                      </span>
                      <span className={styles.choiceAction}>
                        {selectingUpi === link.upi ? "Opening…" : "Open profile"}
                      </span>
                    </button>
                  ))}
                  {selectionMessage ? (
                    <p className={styles.message} role="status">{selectionMessage}</p>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
