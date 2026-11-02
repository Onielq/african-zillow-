"use client";

import { useEffect, useRef, useState } from "react";

type ProjectReportModalProps = {
  projectName: string;
  onClose: () => void;
};

const DECK_WIDTH = 1280;
const DECK_PAGE_HEIGHT = 720;
const FALLBACK_DECK_PAGES = 5;

export function ProjectReportModal({ projectName, onClose }: ProjectReportModalProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0.75);
  const [deckHeight, setDeckHeight] = useState(DECK_PAGE_HEIGHT * FALLBACK_DECK_PAGES);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const measure = () => {
      const availableWidth = Math.max(240, viewport.clientWidth - 28);
      setScale(Math.min(1, availableWidth / DECK_WIDTH));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);

    return () => observer.disconnect();
  }, []);

  const handleFrameLoad = () => {
    const document = frameRef.current?.contentDocument;
    if (!document) return;

    const pageCount = document.querySelectorAll(".page").length || FALLBACK_DECK_PAGES;
    const measuredHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      pageCount * DECK_PAGE_HEIGHT
    );

    setDeckHeight(measuredHeight);
  };

  return (
    <aside
      aria-label={projectName + " project presentation"}
      aria-modal="false"
      className="valia-project-report-window"
      role="dialog"
    >
      <header className="valia-project-report-window-header">
        <div className="valia-project-report-window-title">
          <p>TAISEEL / PROJECT PRESENTATION</p>
          <h2>{projectName}</h2>
          <span>Original Valia Deck layout · embedded without redesign</span>
        </div>
        <button
          aria-label="Close project presentation"
          className="valia-project-report-window-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </header>

      <div className="valia-project-report-scroll" ref={viewportRef}>
        <div
          className="valia-project-report-scale-stage"
          style={{
            width: DECK_WIDTH * scale,
            height: deckHeight * scale
          }}
        >
          <iframe
            className="valia-project-report-frame"
            onLoad={handleFrameLoad}
            ref={frameRef}
            src="/valia-deck/index.html"
            style={{
              width: DECK_WIDTH,
              height: deckHeight,
              transform: "scale(" + scale + ")"
            }}
            title="Original five-page Valia project presentation"
          />
        </div>
      </div>
    </aside>
  );
}
