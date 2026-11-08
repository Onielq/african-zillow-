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
type MediaType = "image" | "video";

type ExploreMedia = {
  id: string;
  type: MediaType;
  mediaUrl: string;
  project: RwandaProjectRecord;
};

const FEED_MEDIA: ExploreMedia[] = RWANDA_PROJECT_RECORDS.flatMap((project) => {
  const media: ExploreMedia[] = [];
  if (project.imageUrl?.trim()) {
    media.push({
      id: project.id + "-image",
      type: "image",
      mediaUrl: project.imageUrl,
      project
    });
  }
  if (project.videoUrl?.trim()) {
    media.push({
      id: project.id + "-video",
      type: "video",
      mediaUrl: project.videoUrl,
      project
    });
  }
  return media;
});

const CATEGORIES: Array<{ id: FeedCategory; label: string }> = [
  { id: "all", label: "For you" },
  { id: "residential", label: "Residential" },
  { id: "commercial", label: "Commercial" },
  { id: "mixed-use", label: "Mixed-use" }
];

function matchesCategory(media: ExploreMedia, category: FeedCategory): boolean {
  const value = media.project.category.toLocaleLowerCase("en");
  if (category === "all") return true;
  if (category === "residential") return value.includes("residential");
  if (category === "commercial") {
    return value.includes("commercial") || value.includes("retail") || value.includes("office");
  }
  return value.includes("mixed-use") || value.includes("mixed use");
}

function projectLocation(project: RwandaProjectRecord): string {
  return [project.sector, project.district].filter(Boolean).join(" · ") || project.district || "Rwanda";
}

function locationPrecisionLabel(project: RwandaProjectRecord): string {
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
  const [selectedMedia, setSelectedMedia] = useState<ExploreMedia | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const visibleMedia = useMemo(
    () => FEED_MEDIA.filter((media) => matchesCategory(media, activeCategory)),
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

  const selectedProject = selectedMedia?.project ?? null;

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

        {selectedMedia && selectedProject ? (
          <div className={styles.detailLayout}>
            <div className={styles.detailMedia}>
              {selectedMedia.type === "video" ? (
                <video
                  className={styles.detailVideo}
                  controls
                  playsInline
                  preload="metadata"
                  poster={selectedProject.imageUrl ?? undefined}
                  src={selectedMedia.mediaUrl}
                >
                  Your browser does not support embedded video.
                </video>
              ) : (
                <BrandImage
                  className={styles.detailImage}
                  fit="cover"
                  height={900}
                  name={selectedProject.name}
                  source={selectedMedia.mediaUrl}
                  width={1100}
                />
              )}
              <span className={styles.mediaType}>
                {selectedMedia.type === "video" ? "Video" : "Photo"}
              </span>
            </div>

            <aside aria-label="Project post details" className={styles.detailPanel}>
              <button
                className={styles.backButton}
                onClick={() => setSelectedMedia(null)}
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
                {selectedMedia.type === "image" ? (
                  <a href={selectedMedia.mediaUrl} rel="noreferrer" target="_blank">
                    Open image source <ExternalLink aria-hidden="true" size={13} />
                  </a>
                ) : null}
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

            {visibleMedia.length > 0 ? (
              <div aria-label="Project media" className={styles.grid} role="tabpanel">
                {visibleMedia.map((media, index) => (
                  <button
                    aria-label={"Open " + media.project.name + " " + media.type}
                    className={
                      visibleMedia.length >= 4 && (index === 0 || index === 2)
                        ? styles.gridTileFeature
                        : styles.gridTile
                    }
                    key={media.id}
                    onClick={() => setSelectedMedia(media)}
                    type="button"
                  >
                    {media.type === "video" ? (
                      <video
                        className={styles.tileVideo}
                        muted
                        playsInline
                        preload="metadata"
                        poster={media.project.imageUrl ?? undefined}
                        src={media.mediaUrl}
                      />
                    ) : (
                      <BrandImage
                        className={styles.tileImage}
                        fit="cover"
                        height={560}
                        name={media.project.name}
                        source={media.mediaUrl}
                        width={560}
                      />
                    )}
                    <span className={styles.tileType}>
                      {media.type === "video" ? "Video" : "Photo"}
                    </span>
                    <span className={styles.tileOverlay}>
                      <strong>{media.project.name}</strong>
                      <small>{projectLocation(media.project)}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <Grid aria-hidden="true" size={26} />
                <strong>No project media in this category yet</strong>
                <p>Only project records with a sourced image or video are shown in Explore.</p>
              </div>
            )}

            <p className={styles.feedFootnote}>
              Media comes from the project register. A project record does not confirm live
              property availability.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
