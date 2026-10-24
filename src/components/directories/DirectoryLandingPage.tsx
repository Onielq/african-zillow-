"use client";

import Link from "next/link";
import styles from "./directory-landing-page.module.css";

type EvidenceItem = {
  number: string;
  title: string;
  description: string;
};

type DirectoryKind = "projects" | "developers";

type DirectoryLandingPageProps = {
  kind: DirectoryKind;
  eyebrow: string;
  title: string;
  description: string;
  status: string;
  recordLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  evidenceHeading: string;
  evidenceIntro: string;
  evidence: EvidenceItem[];
};

const NAV_ITEMS = [
  { href: "/", label: "Map workspace", key: "map" },
  { href: "/projects", label: "Projects", key: "projects" },
  { href: "/developers", label: "Developers", key: "developers" },
  { href: "/data-sources", label: "Data sources", key: "sources" }
] as const;

export function DirectoryLandingPage({
  kind,
  eyebrow,
  title,
  description,
  status,
  recordLabel,
  emptyTitle,
  emptyDescription,
  evidenceHeading,
  evidenceIntro,
  evidence
}: DirectoryLandingPageProps) {
  return (
    <main className={styles.page} data-directory={kind}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Rwanda Land Intelligence home">
          <span className={styles.brandMark} aria-hidden="true">R</span>
          <span className={styles.brandText}>
            <strong>Land Intelligence</strong>
            <small>RWANDA</small>
          </span>
        </Link>

        <nav className={styles.navigation} aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const currentKey = kind === "projects" || kind === "developers" ? kind : "";
            const isCurrent = item.key === currentKey;
            return (
              <Link
                aria-current={isCurrent ? "page" : undefined}
                className={isCurrent ? styles.navigationCurrent : undefined}
                href={item.href}
                key={item.key}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className={styles.content}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1>{title}</h1>
          <p className={styles.heroDescription}>{description}</p>
          <div className={styles.heroMeta}>
            <span className={styles.statusPill}>
              <span aria-hidden="true" className={styles.statusDot} />
              {status}
            </span>
            <span className={styles.geography}>Pilot geography · Kigali City + Bugesera</span>
          </div>
        </section>

        <section className={styles.inventory} aria-labelledby="inventory-title">
          <div className={styles.inventoryCopy}>
            <p className={styles.eyebrow}>LIVE INVENTORY</p>
            <h2 id="inventory-title">{emptyTitle}</h2>
            <p>{emptyDescription}</p>
            <div className={styles.actions}>
              <Link className={styles.primaryAction} href="/data-sources">
                Review data sources <span aria-hidden="true">↗</span>
              </Link>
              <Link className={styles.secondaryAction} href="/">
                Return to map
              </Link>
            </div>
          </div>
          <aside className={styles.inventoryStatus} aria-label="Current inventory status">
            <span className={styles.statusIcon} aria-hidden="true">
              {kind === "projects" ? "◇" : "◎"}
            </span>
            <strong>0</strong>
            <span>{recordLabel}</span>
            <small>This means no records are verified and published in this directory; it does not mean none exist in Rwanda.</small>
          </aside>
        </section>

        <section className={styles.evidenceSection} aria-labelledby="evidence-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>PUBLISHING STANDARD</p>
              <h2 id="evidence-title">{evidenceHeading}</h2>
            </div>
            <p>{evidenceIntro}</p>
          </div>
          <div className={styles.evidenceGrid}>
            {evidence.map((item) => (
              <article className={styles.evidenceCard} key={item.number}>
                <span className={styles.evidenceNumber}>{item.number}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.integrityNote} aria-label="Data integrity commitment">
          <span className={styles.integrityMark} aria-hidden="true">✓</span>
          <div>
            <h2>Evidence first. No invented inventory.</h2>
            <p>
              A public website, social post or map marker is not enough to prove a current listing,
              developer relationship, price, delivery date or permission to republish. Missing evidence
              stays visible as missing until a source is checked.
            </p>
          </div>
        </section>

        <footer className={styles.footer}>
          <Link href="/" className={styles.footerBrand}>Rwanda Land Intelligence</Link>
          <span>Source status and publication permission are checked separately.</span>
          <Link href="/data-sources">Data source register ↗</Link>
        </footer>
      </div>
    </main>
  );
}
