"use client";

import styles from "./buyer-property-profile.module.css";
import type { SelectedArea } from "./MapView";
import type { RwandaProjectRecord } from "@/data/project-directory";
import type { BuyerListingRecord, BuyerVerifiedParcelLink } from "@/components/map/BuyerListingLookup";

type BuyerPropertyProfileProps = {
  area: SelectedArea;
  linkedProject: RwandaProjectRecord | null;
  priceEvidenceLabel: string;
  priceEvidenceNote: string;
  transactionBenchmarkPerM2: number | null;
  linkedListing: BuyerListingRecord | null;
  listingParcelLink: BuyerVerifiedParcelLink | null;
};

function formatRwfPerM2(value: number): string {
  return new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(value) + " RWF/m²";
}

function formatListingAskingPrice(listing: BuyerListingRecord): string {
  const amount = Number(listing.askingAmount);
  if (!Number.isFinite(amount) || amount <= 0) return "Asking price not supplied";
  const formatted = new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(amount);
  const period = listing.listingType === "rent" && listing.rentPeriod !== "not_applicable"
    ? " / " + listing.rentPeriod
    : "";
  return formatted + " " + listing.currency + period;
}

function formatEvidenceDate(value: string): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-RW", { dateStyle: "medium" }).format(date);
}

function zoningSummary(area: SelectedArea): string {
  if (area.zoningStatus === "loading" || !area.zoningStatus) return "Mapped zoning is being checked.";
  if (area.zoningStatus === "error" || area.zoningStatus === "unavailable") return "Zoning data is currently unavailable.";
  if (area.zoningStatus === "not-covered") return "No zoning designation is mapped for this parcel in the connected source.";
  if (!area.zoning?.length) return "A mapped planning area was found, but no designation label was supplied.";
  return area.zoning
    .map((zone) => [zone.code, zone.name].filter(Boolean).join(" · "))
    .join("; ");
}

export function BuyerPropertyProfile({
  area,
  linkedProject,
  priceEvidenceLabel,
  priceEvidenceNote,
  transactionBenchmarkPerM2,
  linkedListing,
  listingParcelLink
}: BuyerPropertyProfileProps) {
  const hasMappedParcelIdentity = area.sourceType === "cadastral-parcel" && Boolean(area.upi);
  const areaLabel = typeof area.parcelSizeM2 === "number" && area.parcelSizeM2 > 0
    ? new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(area.parcelSizeM2) + " m²"
    : "Area not supplied";
  const areaBasis = area.parcelSizeSource === "geometry-estimate"
    ? "estimated from mapped geometry"
    : area.parcelSizeSource === "cadastral-attribute"
      ? "cadastral source attribute"
      : "area basis not supplied";
  const listingStatus = area.parcelMarketStatusSource === "source" && area.parcelMarketStatus
    ? area.parcelMarketStatus === "available"
      ? "Source-reported · available"
      : "Source-reported · off market"
    : "Availability unverified";
  const hasParcelSaleRecord = area.parcelPriceType === "recorded-sale-price" &&
    typeof area.parcelPriceValue === "number" &&
    area.parcelPriceValue > 0 &&
    Boolean(area.parcelPriceSource?.trim());

  return (
    <section aria-label="Connected property profile" className={styles.profile}>
      <div className={styles.header}>
        <p className={styles.eyebrow}>BUYER PROPERTY PROFILE</p>
        <h3>One property. Three intelligence layers.</h3>
        <p className={styles.intro}>
          The profile connects separate evidence about this parcel. Each layer has its own source and status.
        </p>
      </div>

      <ol className={styles.pillars}>
        <li className={styles.pillar}>
          <span aria-hidden="true" className={styles.step}>01</span>
          <div className={styles.content}>
            <div className={styles.pillarHeading}>
              <h4>Land Intelligence</h4>
              <span className={hasMappedParcelIdentity ? styles.statusReady : styles.statusPending}>
                {hasMappedParcelIdentity ? "Parcel mapped" : "Identity incomplete"}
              </span>
            </div>
            <p className={styles.primary}>
              {area.upi ? "UPI " + area.upi : "UPI not supplied"}
            </p>
            <p className={styles.detail}>
              {areaLabel} · {areaBasis}
            </p>
            <p className={styles.detail}>
              Zoning: {zoningSummary(area)}
            </p>
            {typeof area.wetlandAreaM2 === "number" && area.wetlandAreaM2 > 0 ? (
              <p className={styles.detail}>
                Mapped wetland overlap: {new Intl.NumberFormat("en-RW", { maximumFractionDigits: 0 }).format(area.wetlandAreaM2)} m². Confirm applicable restrictions with the planning authority.
              </p>
            ) : null}
            <p className={styles.caveat}>
              The mapped parcel is not proof of title, ownership, encumbrances or permission to build.
            </p>
          </div>
        </li>

        <li className={styles.pillar}>
          <span aria-hidden="true" className={styles.step}>02</span>
          <div className={styles.content}>
            <div className={styles.pillarHeading}>
              <h4>Development &amp; Regulatory Intelligence</h4>
              <span className={linkedProject ? styles.statusFound : styles.statusPending}>
                {linkedProject ? "Exact-UPI project match" : "No exact-UPI project match"}
              </span>
            </div>
            {linkedProject ? (
              <>
                <p className={styles.primary}>{linkedProject.name}</p>
                <p className={styles.detail}>
                  {linkedProject.developer}
                  {linkedProject.status ? " · Register status: " + linkedProject.status : ""}
                </p>
                {linkedProject.sourceUrl ? (
                  <a className={styles.sourceLink} href={linkedProject.sourceUrl} rel="noreferrer" target="_blank">
                    Open project source
                  </a>
                ) : null}
              </>
            ) : (
              <p className={styles.detail}>
                No project record in the connected directory is linked to this exact UPI. This does not prove that no development affects the land.
              </p>
            )}
            <p className={styles.caveat}>
              Formal registration, authority approvals and regulatory-compliance evidence are not connected to this profile.
            </p>
          </div>
        </li>

        <li className={styles.pillar}>
          <span aria-hidden="true" className={styles.step}>03</span>
          <div className={styles.content}>
            <div className={styles.pillarHeading}>
              <h4>Marketplace &amp; Market Intelligence</h4>
              <span className={area.parcelMarketStatusSource === "source" && area.parcelMarketStatus ? styles.statusFound : styles.statusPending}>
                {listingStatus}
              </span>
            </div>
            <p className={styles.primary}>Price evidence: {priceEvidenceLabel}</p>
            <p className={styles.detail}>{priceEvidenceNote}</p>
            <p className={styles.detail}>
              {transactionBenchmarkPerM2 !== null
                ? "Area-level transaction-price signal: " + formatRwfPerM2(transactionBenchmarkPerM2) + ". This is not this parcel's sale price."
                : "No usable area-level transaction-price benchmark is available for this parcel."}
            </p>
            <p className={styles.detail}>
              {hasParcelSaleRecord
                ? "A source-labelled parcel sale-price record is attached. Confirm the date and transfer evidence with the competent registry."
                : "No parcel-specific completed-sale record is connected."}
            </p>
            {linkedListing && listingParcelLink ? (
              <div className={styles.listingEvidence}>
                <p className={styles.primary}>Verified source listing attached</p>
                <p className={styles.detail}>
                  {linkedListing.sourcePublisher ?? linkedListing.sourceTitle ?? linkedListing.sourceKey}
                  {" · Listing ID " + linkedListing.sourceListingId}
                </p>
                <p className={styles.detail}>
                  Asking price: {formatListingAskingPrice(linkedListing)} · Source-reported status: {linkedListing.sourceReportedStatus}
                </p>
                <p className={styles.detail}>
                  Link role: {listingParcelLink.relationshipRole.replaceAll("_", " ")} · Evidence checked: {listingParcelLink.evidenceType.replaceAll("_", " ")}
                  {formatEvidenceDate(listingParcelLink.reviewedAt)
                    ? " · Reviewed " + formatEvidenceDate(listingParcelLink.reviewedAt)
                    : ""}
                </p>
                {linkedListing.listingUrl ? (
                  <a className={styles.sourceLink} href={linkedListing.listingUrl} rel="noreferrer" target="_blank">
                    Open original listing
                  </a>
                ) : linkedListing.sourceUrl ? (
                  <a className={styles.sourceLink} href={linkedListing.sourceUrl} rel="noreferrer" target="_blank">
                    Open listing source
                  </a>
                ) : null}
                {linkedListing.attributionRequired ? (
                  <p className={styles.caveat}>Source attribution is required for this listing record.</p>
                ) : null}
              </div>
            ) : null}
            <p className={styles.detail}>
              Advertiser identity and a verified comparable-listing set are not connected to this parcel yet.
            </p>
            <p className={styles.caveat}>
              A listing joins this profile only after its source record has an independently checked UPI relationship.
            </p>
          </div>
        </li>
      </ol>
    </section>
  );
}
