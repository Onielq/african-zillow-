import Link from "next/link";

const plannedTools = [
  "Developers",
  "Projects",
  "Metrics",
  "Sources",
  "Show"
] as const;

function BrandMark() {
  return (
    <svg
      aria-hidden="true"
      className="brand-mark"
      viewBox="0 0 40 40"
      fill="none"
    >
      <rect x="1" y="1" width="38" height="38" rx="12" fill="currentColor" />
      <path
        d="M10 11.5 19.5 7l10.5 5.2v14.2L19.5 33 10 27.6V11.5Z"
        stroke="white"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m10.5 19 9 5.2 10.1-5.5M19.5 24.2V32"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="19.5" cy="18" r="2.4" fill="white" />
    </svg>
  );
}

function DisabledControl({ label }: { label: string }) {
  return (
    <button
      aria-label={`${label}, planned for a later phase`}
      className="toolbar-control"
      disabled
      title="This control will be connected in a later implementation phase."
      type="button"
    >
      {label}
      <span aria-hidden="true" className="control-chevron">⌄</span>
    </button>
  );
}

export default function Home() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <Link aria-label="Rwanda Land Intelligence home" className="brand" href="/">
          <BrandMark />
          <span className="brand-copy">
            <span className="brand-name">Land Intelligence</span>
            <span className="brand-country">RWANDA</span>
          </span>
        </Link>

        <nav aria-label="Primary navigation" className="primary-navigation">
          <button
            className="compare-control"
            disabled
            title="Area comparison will be connected in a later phase."
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
              <path d="M7 4H3v12h4M13 4h4v12h-4M7 7h6M7 10h6M7 13h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Compare
          </button>
        </nav>

        <div aria-label="Area navigation" className="topbar-actions">
          <button disabled title="Area navigation will be enabled with the map.">Areas</button>
          <button disabled title="Project exploration is planned for a later phase.">Projects</button>
        </div>
      </header>

      <section aria-label="Map workspace" className="map-workspace">
        <div aria-label="Map canvas not connected yet" className="map-canvas" role="region">
          <div aria-hidden="true" className="canvas-grid" />

          <div className="map-status">
            <span className="status-dot" />
            Foundation stage
          </div>

          <div className="map-message">
            <div aria-hidden="true" className="map-symbol">
              <svg viewBox="0 0 52 52" fill="none">
                <path d="M7 13.5 18.6 8l14.7 6.3L45 8.5v30L33.3 44l-14.7-6.3L7 43.5v-30Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="m18.6 8-.1 29.7M33.3 14.3V44M7 26l11.5-5.4L33.3 27 45 21.7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="eyebrow">GEOGRAPHICAL WORKSPACE</p>
            <h1>The map starts here.</h1>
            <p className="map-description">
              The application foundation is ready. The interactive map will be
              connected after the basemap provider and permitted Rwanda
              geographical sources are confirmed.
            </p>
            <div className="map-state-list">
              <span><span className="state-marker" /> No live map connected</span>
              <span><span className="state-marker" /> No parcel records loaded</span>
            </div>
          </div>

          <nav aria-label="Map tools, planned" className="map-toolbar">
            {plannedTools.map((label) => (
              <DisabledControl key={label} label={label} />
            ))}
          </nav>

          <div className="map-footer">
            <span>RWANDA LAND INTELLIGENCE</span>
            <span>Geographical data not yet connected</span>
          </div>
        </div>
      </section>
    </main>
  );
}
