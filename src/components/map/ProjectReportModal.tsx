"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type ProjectReportModalProps = {
  projectName: string;
  onClose: () => void;
};

type WindowPosition = { left: number; top: number };
type WindowSize = { width: number; height: number };
type DragState = {
  pointerId: number;
  pointerX: number;
  pointerY: number;
  left: number;
  top: number;
};

const DECK_WIDTH = 1280;
const DECK_PAGE_HEIGHT = 720;
const FALLBACK_DECK_PAGES = 5;
const HEADER_GRAB_ZONE = 68;
const DOCK_HEIGHT = 68;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function ProjectReportModal({ projectName, onClose }: ProjectReportModalProps) {
  const windowRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const restorePositionRef = useRef<WindowPosition | null>(null);
  const restoreSizeRef = useRef<WindowSize | null>(null);

  const [scale, setScale] = useState(0.75);
  const [deckHeight, setDeckHeight] = useState(DECK_PAGE_HEIGHT * FALLBACK_DECK_PAGES);
  const [windowPosition, setWindowPosition] = useState<WindowPosition | null>(null);
  const [windowSize, setWindowSize] = useState<WindowSize | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [dragging, setDragging] = useState(false);

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

  // Keep the window and its title bar reachable after a browser resize or a
  // manual resize of the window itself.
  useEffect(() => {
    const element = windowRef.current;
    const parent = element?.parentElement;
    if (!element || !parent) return;

    const keepInBounds = () => {
      const currentElement = windowRef.current;
      const container = currentElement?.parentElement;
      if (!currentElement || !container) return;

      setWindowPosition((current) => {
        if (!current) return current;

        const next = {
          left: clamp(current.left, 0, container.clientWidth - currentElement.offsetWidth),
          top: clamp(current.top, 0, container.clientHeight - HEADER_GRAB_ZONE)
        };

        return next.left === current.left && next.top === current.top ? current : next;
      });
    };

    const observer = new ResizeObserver(keepInBounds);
    observer.observe(parent);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const handleHeaderPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-no-drag]")) return;

    const element = windowRef.current;
    const parent = element?.parentElement;
    if (!element || !parent) return;

    const elementRect = element.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const left = elementRect.left - parentRect.left;
    const top = elementRect.top - parentRect.top;

    dragRef.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      left,
      top
    };

    setWindowPosition({ left, top });
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleHeaderPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const element = windowRef.current;
    const parent = element?.parentElement;
    if (!drag || drag.pointerId !== event.pointerId || !element || !parent) return;

    const maxLeft = parent.clientWidth - element.offsetWidth;
    const maxTop = parent.clientHeight - HEADER_GRAB_ZONE;

    setWindowPosition({
      left: clamp(drag.left + event.clientX - drag.pointerX, 0, maxLeft),
      top: clamp(drag.top + event.clientY - drag.pointerY, 0, maxTop)
    });
  };

  const finishDragging = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;

    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const toggleMinimized = () => {
    const element = windowRef.current;
    const parent = element?.parentElement;
    if (!element || !parent) return;

    if (minimized) {
      setMinimized(false);
      if (restorePositionRef.current) setWindowPosition(restorePositionRef.current);
      if (restoreSizeRef.current) setWindowSize(restoreSizeRef.current);
      return;
    }

    const elementRect = element.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    restorePositionRef.current = windowPosition ?? {
      left: elementRect.left - parentRect.left,
      top: elementRect.top - parentRect.top
    };
    restoreSizeRef.current = {
      width: elementRect.width,
      height: elementRect.height
    };

    const dockWidth = Math.min(320, Math.max(260, parent.clientWidth - 16));
    setWindowSize(null);
    setWindowPosition({
      left: Math.max(8, parent.clientWidth - dockWidth - 8),
      top: Math.max(8, parent.clientHeight - DOCK_HEIGHT - 8)
    });
    setMinimized(true);
  };

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

  const windowStyle = {
    ...(windowPosition
      ? {
          left: windowPosition.left,
          top: windowPosition.top,
          right: "auto",
          bottom: "auto"
        }
      : {}),
    ...(!minimized && windowSize
      ? {
          width: windowSize.width,
          height: windowSize.height
        }
      : {})
  };

  return (
    <aside
      aria-label={projectName + " project study"}
      aria-modal="false"
      aria-expanded={!minimized}
      className={
        "valia-project-report-window" +
        (minimized ? " valia-project-report-window-minimized" : "")
      }
      ref={windowRef}
      role="dialog"
      style={windowStyle}
    >
      <header
        className={
          "valia-project-report-window-header" +
          (dragging ? " valia-project-report-window-header-dragging" : "")
        }
        onPointerCancel={finishDragging}
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={finishDragging}
        title="Drag to move the project window"
      >
        <div className="valia-project-report-window-title">
          <p>TAISEEL / PROJECT STUDY</p>
          <h2>{projectName}</h2>
          <span>Integrated five-page project study</span>
        </div>
        <div className="valia-project-report-window-controls" data-no-drag>
          <button
            aria-label={minimized ? "Restore project presentation" : "Minimize project presentation"}
            aria-pressed={minimized}
            className="valia-project-report-window-minimize"
            onClick={toggleMinimized}
            type="button"
          >
            {minimized ? "□" : "−"}
          </button>
          <button
            aria-label="Close project presentation"
            className="valia-project-report-window-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
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
            title={projectName + " five-page project study"}
          />
        </div>
      </div>
    </aside>
  );
}
