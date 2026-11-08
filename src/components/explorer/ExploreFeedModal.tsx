"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Grid,
  MapPin,
  Users,
  X
} from "lucide-react";
import { BrandImage } from "@/components/directories/BrandImage";
import { RWANDA_PROJECT_RECORDS, type RwandaProjectRecord } from "@/data/project-directory";
import styles from "./explore-feed-modal.module.css";

type FeedCategory = "all" | "residential" | "commercial" | "mixed-use";

type ExploreProject = RwandaProjectRecord & { imageUrl: string };

const FEED_PROJECTS = RWANDA_PROJECT_RECORDS.filter(
  (project): project is ExploreProject => Boolean(project.imageUrl?.trim())
);

const CATEGORIES: Array<{ id: FeedCategory; label: string }> = [
  { id: "all", label: "For you" },
  { id: "residential", label: "Residential" },
  { id: "commercial", label: "Commercial" },
  { id: "mixed-use", label: "Mixed-use" }
];

function matchesCategory(project: ExploreProject, category: FeedCategory): boolean {
  const value = project.category.toLocaleLowerCase("en");
  if (category === "all") return true;
  if (category === "residential") return value.includes("residential");
  if (category === "commercial") {
    return value.includes("commercial") || value.includes("retail") || value.includes("office");
  }
  return value.includes("mixed-use") || value.includes("mixed use");
}

function projectLocation(project: ExploreProject): string {
  return [project.sector, project.district].filter(Boolean).join(" · ") || project.district || "Rwanda";
}

function locationPrecisionLabel(project: ExploreProject): string {
  switch (project.locationPrecision) {
    case "parcel-upi":
      return "Parcel UPI supplied";
    case "address-coordinate":
      return "Address / coordinate";
    case "administrative-area":
      return "Administrative area";
    case "district":
      return "District only";
    default:
      return "Location precision not established";
  }
}

type ExploreFeedModalProps = {
  onClose: () => void;
  returnFocusRef: { current: HTMLButtonElement | null };
};

export function ExploreFeedModal({ onClose, returnFocusRef }: ExploreFeedModalProps) {
  const [activeCategory, setActiveCategory] = useState<FeedCategory>("all");
  const [selectedProject, setSelectedProject] = useState<ExploreProject | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const visibleProjects = useMemo(
    () => FEED_PROJECTS.filter((project) => matchesCategory(project, activeCategory)),
    [activeCategory]
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable.item(0);
      const last = focusable.item(focusable.length - 1);

      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [onClose, returnFocusRef]);

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="taiseel-explore-title"
        aria-modal="true"
        className={styles.dialog}
        id="taiseel-explore-feed-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header className={styles.header}>
          <div className={styles.heading}>
            <span aria-hidden="true" className={styles.headingIcon}>
              <Grid size={19} strokeWidth={1.8} />
            </span>
            <div>
              <p className={styles.eyebrow}>TAISEEL / PROPERTY DISCOVERY</p>
              <h2 id="taiseel-explore-title">Explore</h2>
            </div>
          </div>
          <button
            aria-label="Close Explore"
            className={styles.closeButton}
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        {selectedProject ? (
          <div className={styles.detailLayout}>
            <div className={styles.detailMedia}>
              <BrandImage
                className={styles.detailImage}
                fit="cover"
                height={900}
                name={selectedProject.name}
                source={selectedProject.imageUrl}
                width={1100}
              />
              <span className={styles.mediaType}>Photo</span>
            </div>

            <aside aria-label="Project post details" className={styles.detailPanel}>
              <button
                className={styles.backButton}
                onClick={() => setSelectedProject(null)}
                type="button"
              >
                <ArrowLeft aria-hidden="true" size={16} />
                Back to grid
              </button>

              <p className={styles.detailEyebrow}>{selectedProject.category}</p>
              <h3>{selectedProject.name}</h3>
              <p className={styles.developerName}>{selectedProject.developer}</p>

              <p className={styles.locationLine}>
                <MapPin aria-hidden="true" size={15} />
                {projectLocation(selectedProject)}
              </p>

              <dl className={styles.facts}>
                <div>
                  <dt>Project status on record</dt>
                  <dd>{selectedProject.status}</dd>
                </div>
                {selectedProject.units !== null ? (
                  <div>
                    <dt>Reported project units</dt>
                    <dd>{selectedProject.units.toLocaleString("en-RW")}</dd>
                  </div>
                ) : null}
                {selectedProject.completion ? (
                  <div>
                    <dt>Completion / target in source</dt>
                    <dd>{selectedProject.completion}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Location precision</dt>
                  <dd>{locationPrecisionLabel(selectedProject)}</dd>
                </div>
              </dl>

              <div className={styles.viewerSection}>
                <div className={styles.viewerHeading}>
                  <Users aria-hidden="true" size={17} />
                  <strong>People who viewed this</strong>
                </div>
                <p>
                  Viewer identities will appear here when signed-in view tracking is connected.
                  No viewer records are available yet.
                </p>
              </div>

              <div className={styles.sources}>
                {selectedProject.sourceUrl ? (
                  <a href={selectedProject.sourceUrl} rel="noreferrer" target="_blank">
                    Open project source <ExternalLink aria-hidden="true" size={13} />
                  </a>
                ) : null}
                <a href={selectedProject.imageUrl} rel="noreferrer" target="_blank">
                  Open image source <ExternalLink aria-hidden="true" size={13} />
                </a>
              </div>

              <p className={styles.disclaimer}>
                Project register information is not a live unit-availability feed or proof of
                current sale or rental availability.
              </p>
            </aside>
          </div>
        ) : (
          <div className={styles.feedBody}>
            <div aria-label="Explore categories" className={styles.categories} role="tablist">
              {CATEGORIES.map((category) => (
                <button
                  aria-selected={activeCategory === category.id}
                  className={
                    activeCategory === category.id
                      ? styles.categoryActive
                      : styles.category
                  }
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  role="tab"
                  type="button"
                >
                  {category.label}
                </button>
              ))}
            </div>

            {visibleProjects.length > 0 ? (
              <div aria-label="Project media" className={styles.grid} role="tabpanel">
                {visibleProjects.map((project, index) => (
                  <button
                    aria-label={"Open " + project.name}
                    className={
                      visibleProjects.length >= 4 && (index === 0 || index === 2)
                        ? styles.gridTileFeature
                        : styles.gridTile
                    }
                    key={project.id}
                    onClick={() => setSelectedProject(project)}
                    type="button"
                  >
                    <BrandImage
                      className={styles.tileImage}
                      fit="cover"
                      height={560}
                      name={project.name}
                      source={project.imageUrl}
                      width={560}
                    />
                    <span className={styles.tileType}>Photo</span>
                    <span className={styles.tileOverlay}>
                      <strong>{project.name}</strong>
                      <small>{projectLocation(project)}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <Grid aria-hidden="true" size={26} />
                <strong>No project photos in this category yet</strong>
                <p>Only project records with a sourced image are shown in Explore.</p>
              </div>
            )}

            <p className={styles.feedFootnote}>
              Images come from the project register. A project record does not confirm live
              property availability.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
