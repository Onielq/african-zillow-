"use client";

import Link from "next/link";
import styles from "./data-sources.module.css";

type SourceStatus = "connected" | "review" | "candidate" | "approval";

type DataSource = {
  name: string;
  publisher: string;
  status: SourceStatus;
  statusLabel: string;
  whatItProvides: string;
  currentUse: string;
  limitations: string;
  url: string;
  urlLabel: string;
};

const sources: DataSource[] = [
  {
    name: "Kigali administrative boundaries",
    publisher: "City of Kigali · Master Plan GIS",
    status: "connected",
    statusLabel: "Connected in prototype",
    whatItProvides: "District, sector, cell and village polygons for Kigali City.",
    currentUse: "Drives administrative selection and map zoom levels.",
    limitations: "Confirm publisher terms and permitted commercial caching/redistribution before public production.",
    url: "https://masterplan.kigalicity.gov.rw/portal/apps/webappviewer/index.html?id=fdd2e30cbc15401d9daee5f68982d755",
    urlLabel: "Open Kigali Master Plan"
  },
  {
    name: "Bugesera administrative boundaries",
    publisher: "Geodata Rwanda · Bugesera Masterplan",
    status: "review",
    statusLabel: "Connected · vintage review",
    whatItProvides: "Administrative polygons and planning overlays for Bugesera.",
    currentUse: "Drives administrative selection in Bugesera.",
    limitations: "The cell layer metadata reports an NISR source and capture year of 2012; a newer authoritative version should be checked before high-consequence use.",
    url: "https://geodata.rw/portal/apps/experiencebuilder/experience/?id=8b259ba9599747898ca728dba4e6d215",
    urlLabel: "Open Bugesera map"
  },
  {
    name: "Kigali cadastral parcels",
    publisher: "City of Kigali · Kigali Parcels layer",
    status: "approval",
    statusLabel: "Connected · reuse terms to confirm",
    whatItProvides: "Parcel polygons and public identification fields such as UPI, parcel number, area, wetland overlap and update date when supplied.",
    currentUse: "Shows parcel outlines at high zoom and exposes source fields in the parcel inspector.",
    limitations: "The source layer is dated 1 June 2026 in the app documentation. Written confirmation of commercial use, caching and redistribution terms is still required.",
    url: "https://masterplan.kigalicity.gov.rw/server/rest/services/Hosted/Kigali_Parcels_1June2026_for_search/FeatureServer/0",
    urlLabel: "Open parcel service"
  },
  {
    name: "Bugesera cadastral parcels",
    publisher: "National Land Authority · LAIS",
    status: "approval",
    statusLabel: "Connected · permission pending",
    whatItProvides: "Parcel geometry and UPI from the NLA-hosted Bugesera_Parcels FeatureServer.",
    currentUse: "Draws source-provided parcel geometry at high zoom. The production API intentionally limits fields to UPI and geometry.",
    limitations: "The item's reuse licence is not stated in its metadata. Written permission, coverage completeness, survey currency and any redistribution/caching terms remain unconfirmed. This is not proof of ownership.",
    url: "https://services7.arcgis.com/htgaiKX6RV2DDGgK/arcgis/rest/services/Bugesera_Parcels/FeatureServer/0",
    urlLabel: "Open LAIS parcel service"
  },
  {
    name: "District land-price snapshot",
    publisher: "National Land Authority · Rwanda Land Dashboard",
    status: "connected",
    statusLabel: "Snapshot mapped",
    whatItProvides: "Published district-average land price per square metre for the four current pilot districts.",
    currentUse: "Powers the prototype's district-level land-price view.",
    limitations: "The visible source table does not expose an observation date. It is not a live feed, a built-house sale price, or a sector/cell price estimate. The time series is not integrated.",
    url: "https://rwandalanddashboard.lands.rw/prices",
    urlLabel: "Open land-price source"
  },
  {
    name: "Land-transaction aggregates",
    publisher: "Rwanda Data Sharing Platform · Ministry of Environment / NLA",
    status: "candidate",
    statusLabel: "Candidate · access conditions",
    whatItProvides: "Published summaries such as transaction volume by year/type and land-use volume by year, aggregated by administrative area.",
    currentUse: "Not yet connected to the application API or joined to map areas.",
    limitations: "The catalog describes these as summary statistics derived from LAIS and says sharing is for approved users. Confirm access, use and redistribution terms before importing them into the product.",
    url: "https://data.gov.rw/datasets",
    urlLabel: "Browse official datasets"
  },
  {
    name: "Population and housing statistics",
    publisher: "National Institute of Statistics of Rwanda",
    status: "candidate",
    statusLabel: "Candidate · not connected",
    whatItProvides: "Official census and demographic context, including the 2022 Population and Housing Census.",
    currentUse: "Not currently joined to the map or market indicators.",
    limitations: "Census context can help describe demand but is not a property-price, rent, ownership or active-listing feed. Preserve survey year and geographic level with each metric.",
    url: "https://gis.statistics.gov.rw/data-sources/censuses/Population-and-Housing-Census",
    urlLabel: "Open census data portal"
  }
];

const statusDescriptions: Record<SourceStatus, string> = {
  connected: "Data is consumed by the prototype; its limits still apply.",
  review: "Data is connected, but source age or accuracy needs review.",
  candidate: "Official source identified; integration or access confirmation is pending.",
  approval: "Do not treat public endpoint access as reuse permission."
};

export default function DataSourcesPage() {
  const counts = {
    connected: sources.filter((source) => source.status === "connected").length,
    review: sources.filter((source) => source.status === "review").length,
    candidate: sources.filter((source) => source.status === "candidate").length,
    approval: sources.filter((source) => source.status === "approval").length
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Return to Rwanda Land Intelligence map">
          <span className={styles.brandMark} aria-hidden="true">R</span>
          <span>
            <strong>Land Intelligence</strong>
            <small>RWANDA</small>
          </span>
        </Link>
        <nav className={styles.navigation} aria-label="Page navigation">
          <Link href="/">Map workspace</Link>
          <span aria-current="page">Data sources</span>
        </nav>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>DATA GOVERNANCE / SOURCE REGISTER</p>
        <h1>Know what each layer can—and cannot—tell you.</h1>
        <p className={styles.intro}>
          This register separates connected data from sources that still need permission,
          a freshness check, or a real integration. A public endpoint is not automatically
          permission to republish its data.
        </p>
        <p className={styles.reviewDate}>Register reviewed 24 October 2026 · Pilot area: Kigali City and Bugesera</p>
      </section>

      <section className={styles.summary} aria-label="Source status summary">
        <div><strong>{counts.connected}</strong><span>Connected snapshots / feeds</span></div>
        <div><strong>{counts.review}</strong><span>Freshness review</span></div>
        <div><strong>{counts.candidate}</strong><span>Candidate sources</span></div>
        <div><strong>{counts.approval}</strong><span>Reuse approval gates</span></div>
      </section>

      <section className={styles.rules} aria-label="Trust rules">
        <div>
          <span className={styles.ruleNumber}>01</span>
          <h2>Parcel line ≠ title proof</h2>
          <p>Map geometry does not verify ownership, encumbrances, boundaries on the ground, or a right to transact.</p>
        </div>
        <div>
          <span className={styles.ruleNumber}>02</span>
          <h2>Source date travels with data</h2>
          <p>Do not imply a current market value when the observation date is absent or the data is a static snapshot.</p>
        </div>
        <div>
          <span className={styles.ruleNumber}>03</span>
          <h2>No invented records</h2>
          <p>Unconnected listings, rents, projects, yields and appreciation remain unavailable until evidence is integrated.</p>
        </div>
      </section>

      <section className={styles.sourceSection} aria-labelledby="source-register-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>SOURCE-BY-SOURCE</p>
            <h2 id="source-register-title">Source register</h2>
          </div>
          <p>Seven sources assessed · status describes this prototype, not an endorsement from the publisher.</p>
        </div>
        <div className={styles.cards}>
          {sources.map((source) => (
            <article className={styles.card} key={source.name}>
              <div className={styles.cardHeader}>
                <div>
                  <p className={styles.publisher}>{source.publisher}</p>
                  <h3>{source.name}</h3>
                </div>
                <span className={styles.status} data-status={source.status}>{source.statusLabel}</span>
              </div>
              <dl className={styles.details}>
                <div><dt>Provides</dt><dd>{source.whatItProvides}</dd></div>
                <div><dt>Current use</dt><dd>{source.currentUse}</dd></div>
                <div><dt>Limits / next check</dt><dd>{source.limitations}</dd></div>
              </dl>
              <a href={source.url} target="_blank" rel="noreferrer" className={styles.sourceLink}>
                {source.urlLabel} <span aria-hidden="true">↗</span>
              </a>
              <p className={styles.statusHelp}>{statusDescriptions[source.status]}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.nextSteps}>
        <p className={styles.eyebrow}>PRODUCTION GATES</p>
        <h2>What must happen before this becomes dependable data infrastructure?</h2>
        <ol>
          <li><strong>Confirm source rights.</strong> Obtain written reuse, caching, attribution and redistribution terms for cadastral and planning data.</li>
          <li><strong>Connect approved aggregates.</strong> Confirm Data Sharing Platform access conditions, then join transaction datasets by official administrative identifiers and preserve their reporting period.</li>
          <li><strong>Measure freshness and coverage.</strong> Track source dates, failed requests, missing geography and duplicate identifiers. Never fill gaps with inferred boundaries or synthetic market values.</li>
        </ol>
        <a href="https://www.lands.rw/land-use-and-mapping" target="_blank" rel="noreferrer" className={styles.contactLink}>
          National Land Authority — official land mapping information ↗
        </a>
      </section>

      <footer className={styles.footer}>
        <span>Rwanda Land Intelligence</span>
        <span>Evidence first. Legal records remain with the competent authority.</span>
        <Link href="/">Return to map ↑</Link>
      </footer>
    </main>
  );
}
