import type { ReactNode } from "react";
import { BrandImage } from "@/components/directories/BrandImage";
import type { RwandaProjectRecord } from "@/data/project-directory";

type ProjectReportProps = {
  project: RwandaProjectRecord;
  projects: RwandaProjectRecord[];
  onBack: () => void;
  onLocate: () => void;
};

type DistrictStatusCounts = {
  completed: number;
  building: number;
  pipeline: number;
  stalled: number;
  other: number;
};

function normalizeProjectText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");
}

function projectStatusGroup(status: string): keyof DistrictStatusCounts {
  const value = status.toLocaleLowerCase("en");
  if (/stalled|suspended|developer changed/.test(value)) return "stalled";
  if (/completed|occupied|operational|delivered/.test(value)) return "completed";
  if (/under construction|under development|construction/.test(value)) return "building";
  if (/planned|pipeline|proposed/.test(value)) return "pipeline";
  return "other";
}

function formatProjectNumber(value: number): string {
  return new Intl.NumberFormat("en-RW", { maximumFractionDigits: 1 }).format(value);
}

function displayOrUnreported(value: string | null | undefined): string {
  return value?.trim() || "Not reported in the current project record";
}

function locationPrecisionLabel(project: RwandaProjectRecord): string {
  switch (project.locationPrecision) {
    case "parcel-upi":
      return "Parcel-level identifier recorded";
    case "address-coordinate":
      return "Address coordinates recorded";
    case "administrative-area":
      return "Administrative area recorded";
    case "district":
      return "District-level location only";
    default:
      return "Location precision not established";
  }
}

function ReportSection({
  number,
  kicker,
  title,
  children
}: {
  number: string;
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="project-report-section">
      <div className="project-report-section-heading">
        <span className="project-report-section-number">{number}</span>
        <div>
          <p>{kicker}</p>
          <h4>{title}</h4>
        </div>
      </div>
      {children}
    </section>
  );
}

function ReportField({ label, value }: { label: string; value: string }) {
  return (
    <div className="project-report-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function ProjectReport({
  project,
  projects,
  onBack,
  onLocate
}: ProjectReportProps) {
  const districtKey = normalizeProjectText(project.district);
  const districtProjects = districtKey
    ? projects.filter((item) => normalizeProjectText(item.district) === districtKey)
    : [];
  const otherDistrictProjects = districtProjects.filter((item) => item.id !== project.id);
  const statusCounts = districtProjects.reduce<DistrictStatusCounts>(
    (counts, item) => {
      counts[projectStatusGroup(item.status)] += 1;
      return counts;
    },
    { completed: 0, building: 0, pipeline: 0, stalled: 0, other: 0 }
  );
  const knownDistrictUnits = districtProjects.reduce(
    (total, item) => total + (typeof item.units === "number" ? item.units : 0),
    0
  );
  const knownProjectCount = districtProjects.filter((item) => typeof item.units === "number").length;
  const hasCoordinate = typeof project.latitude === "number" && typeof project.longitude === "number";
  const hasKnownLocation = Boolean(project.district || project.sector || project.cell || project.parcelUpi || hasCoordinate);
  const landArea = project.landHa !== null ? formatProjectNumber(project.landHa) + " ha" : "Not reported";
  const unitCount = project.units !== null ? formatProjectNumber(project.units) : "Not reported";
  const timeline = [
    { label: "Reported start", value: project.start, state: project.start ? "recorded" : "missing" },
    { label: "Current position", value: project.status, state: "current" },
    { label: "Reported completion", value: project.completion, state: project.completion ? "recorded" : "missing" }
  ];

  return (
    <div aria-label={project.name + " project report"} className="project-directory-detail project-report">
      <div className="project-report-toolbar">
        <button className="project-directory-back" onClick={onBack} type="button">
          <span aria-hidden="true">←</span> All projects
        </button>
        <span className="project-report-toolbar-label">PROJECT REPORT</span>
      </div>

      <header className="project-report-cover">
        {project.imageUrl ? (
          <BrandImage
            name={project.name}
            source={project.imageUrl}
            className="project-report-cover-image"
            fit="cover"
            width={900}
            height={520}
          />
        ) : (
          <div aria-label="Project imagery not available in the current record" className="project-report-cover-placeholder">
            <span className="project-report-placeholder-mark">T</span>
            <span>PROJECT IMAGERY NOT IN CURRENT RECORD</span>
            <small>Visual reference pending</small>
          </div>
        )}
        <div className="project-report-cover-copy">
          <div className="project-report-brandline">
            <span className="project-report-brandmark">T</span>
            <span>TAISEEL</span>
            <i />
            <span>DEVELOPMENT INTELLIGENCE</span>
          </div>
          <p className="project-report-eyebrow">{project.category}</p>
          <h3>{project.name}</h3>
          <p className="project-report-location">
            {[project.sector, project.district].filter(Boolean).join(" · ") || "Location not established"}
            {project.cell ? " · " + project.cell : ""}
          </p>
          <div className="project-report-statusline">
            <span className="project-report-status-dot" />
            <span>{project.status}</span>
          </div>
        </div>
      </header>

      <div className="project-report-stat-grid" aria-label="Project headline figures">
        <div className="project-report-stat">
          <span>RECORDED UNITS</span>
          <strong>{unitCount}</strong>
          <small>{project.units !== null ? "Units stated in the project register" : "No unit total supplied"}</small>
        </div>
        <div className="project-report-stat">
          <span>LAND AREA</span>
          <strong>{landArea}</strong>
          <small>{project.landHa !== null ? "Reported project land area" : "No land area supplied"}</small>
        </div>
        <div className="project-report-stat">
          <span>START</span>
          <strong>{project.start || "—"}</strong>
          <small>{project.start ? "Recorded start date" : "Not reported"}</small>
        </div>
        <div className="project-report-stat project-report-stat-dark">
          <span>COMPLETION</span>
          <strong>{project.completion || "—"}</strong>
          <small>{project.completion ? "Recorded or target date" : "Not reported"}</small>
        </div>
      </div>

      <div className="project-report-price-note">
        <div>
          <span>PRICE & AVAILABILITY</span>
          <strong>Not reported in this project record</strong>
        </div>
        <p>No sale price, rental rate or live unit availability is being inferred.</p>
      </div>

      <ReportSection number="01" kicker="PROJECT PROFILE" title="Who is behind the development">
        <div className="project-report-field-grid">
          <ReportField label="Developer" value={displayOrUnreported(project.developer)} />
          <ReportField label="Owner / client" value={displayOrUnreported(project.owner)} />
          <ReportField label="Development type" value={displayOrUnreported(project.category)} />
          <ReportField label="Sales / access route" value={displayOrUnreported(project.route)} />
        </div>
      </ReportSection>

      <ReportSection number="02" kicker="DELIVERY" title="Project status & timeline">
        <div className="project-report-timeline">
          {timeline.map((item, index) => (
            <div className={"project-report-timeline-item is-" + item.state} key={item.label}>
              <span className="project-report-timeline-marker">{index + 1}</span>
              <div>
                <span>{item.label}</span>
                <strong>{item.value || "Not reported in the current project record"}</strong>
              </div>
            </div>
          ))}
        </div>
        <p className="project-report-note">
          Dates are reproduced from the project register. A target completion date is not proof of handover.
        </p>
      </ReportSection>

      <ReportSection number="03" kicker="LOCATION" title="Where the project is recorded">
        <div className="project-report-location-card">
          <div className="project-report-location-icon" aria-hidden="true">⌖</div>
          <div>
            <strong>{[project.cell, project.sector, project.district].filter(Boolean).join(" · ") || "Location not established"}</strong>
            <span>{locationPrecisionLabel(project)}</span>
          </div>
        </div>
        <div className="project-report-field-grid">
          <ReportField label="District" value={displayOrUnreported(project.district)} />
          <ReportField label="Sector" value={displayOrUnreported(project.sector)} />
          <ReportField label="Cell" value={displayOrUnreported(project.cell)} />
          <ReportField label="Parcel UPI" value={displayOrUnreported(project.parcelUpi)} />
          <ReportField
            label="Coordinates"
            value={hasCoordinate ? project.latitude!.toFixed(5) + ", " + project.longitude!.toFixed(5) : "Not reported"}
          />
          <ReportField label="Map location quality" value={locationPrecisionLabel(project)} />
        </div>
        {!hasKnownLocation ? (
          <p className="project-report-warning">This record cannot be placed more precisely until a source-backed location is added.</p>
        ) : null}
        <button className="project-report-locate-button" onClick={onLocate} type="button">
          Locate this project on the map <span aria-hidden="true">↗</span>
        </button>
      </ReportSection>

      <ReportSection number="04" kicker="DISTRICT CONTEXT" title="Other projects in the same district">
        {project.district ? (
          <>
            <div className="project-report-district-summary">
              <div><strong>{districtProjects.length}</strong><span>tracked records</span></div>
              <div><strong>{knownDistrictUnits > 0 ? formatProjectNumber(knownDistrictUnits) : "—"}</strong><span>known units in records</span></div>
            </div>
            <div className="project-report-district-breakdown">
              <span>{statusCounts.completed} completed / occupied</span>
              <span>{statusCounts.building} under development</span>
              <span>{statusCounts.pipeline} planned / pipeline</span>
              <span>{statusCounts.stalled} stalled / changed</span>
            </div>
            {otherDistrictProjects.length > 0 ? (
              <div className="project-report-related-list">
                {otherDistrictProjects.slice(0, 5).map((item) => (
                  <div className="project-report-related-item" key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.category}</span>
                    </div>
                    <div>
                      <strong>{item.units !== null ? formatProjectNumber(item.units) + " units" : "Units not reported"}</strong>
                      <span>{item.status}</span>
                    </div>
                  </div>
                ))}
                {otherDistrictProjects.length > 5 ? (
                  <p className="project-report-note">{otherDistrictProjects.length - 5} more district records are in the register.</p>
                ) : null}
              </div>
            ) : (
              <p className="project-report-note">No other project in this district is currently linked in the register.</p>
            )}
          </>
        ) : (
          <p className="project-report-note">District context cannot be calculated because the project location is not recorded.</p>
        )}
        <p className="project-report-caveat">
          Register context only. These records are not confirmed nearby developments, a complete district census, or verified market comparables.
          {knownProjectCount > 0 ? " Unit totals include only " + knownProjectCount + " record" + (knownProjectCount === 1 ? "" : "s") + " with a stated unit count." : ""}
        </p>
      </ReportSection>

      <ReportSection number="05" kicker="MARKET & PRODUCT" title="What is not yet established">
        <div className="project-report-gap-grid">
          {[
            "Sale prices",
            "Rental rates",
            "Unit mix & floor areas",
            "Payment schedule",
            "Sales / absorption",
            "Handover inventory",
            "Planning approvals",
            "Title / escrow evidence"
          ].map((label) => (
            <div className="project-report-gap-item" key={label}>
              <span aria-hidden="true">—</span>
              <div><strong>{label}</strong><small>Not captured in this record</small></div>
            </div>
          ))}
        </div>
        <p className="project-report-warning">
          This report is a structured project-register profile, not a legal due-diligence certificate, valuation, sales inventory or investment recommendation.
        </p>
      </ReportSection>

      <ReportSection number="06" kicker="SOURCE & EVIDENCE" title="Where the record comes from">
        <div className="project-report-source-list">
          {project.sourceUrl ? (
            <a href={project.sourceUrl} rel="noreferrer" target="_blank">
              <span>PRIMARY REFERENCE</span>
              <strong>Open project source</strong>
              <i aria-hidden="true">↗</i>
            </a>
          ) : (
            <div className="project-report-source-missing">
              <span>PRIMARY REFERENCE</span>
              <strong>No source link attached to this record</strong>
            </div>
          )}
          {project.secondarySourceUrl ? (
            <a href={project.secondarySourceUrl} rel="noreferrer" target="_blank">
              <span>SECONDARY REFERENCE</span>
              <strong>Open supporting source</strong>
              <i aria-hidden="true">↗</i>
            </a>
          ) : (
            <div className="project-report-source-missing">
              <span>SECONDARY REFERENCE</span>
              <strong>No second source attached</strong>
            </div>
          )}
        </div>
        <p className="project-report-note">
          Source links are references for further review. Facts in this report are limited to fields currently stored in the Taiseel project register.
        </p>
      </ReportSection>

      <footer className="project-report-footer">
        <span>TAISEEL · PROJECT INTELLIGENCE</span>
        <span>{project.id}</span>
      </footer>
    </div>
  );
}
