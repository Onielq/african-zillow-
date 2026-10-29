"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type TalkToExpertProps = {
  areaName?: string | null;
};

export function TalkToExpert({ areaName }: TalkToExpertProps) {
  const router = useRouter();
  const [isHidden, setIsHidden] = useState(false);
  const [showReopen, setShowReopen] = useState(false);
  const mainActionRef = useRef<HTMLButtonElement>(null);
  const reopenButtonRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const insightArea = areaName?.trim() || "Rwanda land market";

  useEffect(() => {
    if (showReopen) reopenButtonRef.current?.focus();
  }, [showReopen]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  const openContact = () => router.push("/contact");

  const closeCard = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsHidden(true);
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setShowReopen(true);
    }, 250);
  };

  const reopenCard = () => {
    setShowReopen(false);
    setIsHidden(false);
    // Restore focus after React makes the main action visible and focusable again.
    window.setTimeout(() => mainActionRef.current?.focus(), 0);
  };

  return (
    <>
      <div
        aria-hidden={isHidden ? true : undefined}
        className={isHidden ? "expert-card hidden" : "expert-card"}
      >
        <button
          ref={mainActionRef}
          aria-label={`Talk to an expert about ${insightArea}`}
          className="expert-main-action"
          onClick={openContact}
          tabIndex={isHidden ? -1 : 0}
          type="button"
        >
          <span aria-hidden="true" className="expert-icon">
            <svg
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              stroke="#ffffff"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="9" cy="8" r="3.2" />
              <path d="M3.5 19c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" />
              <path d="M16.5 8.5c1.2 0 2.3.5 3 1.3" />
              <path d="M17.5 11.5c.8 0 1.5.4 2 1" />
            </svg>
          </span>
          <span className="expert-text">
            <span className="expert-title">Talk to an expert</span>
            <span className="expert-subtitle">
              Get full insights on <strong>{insightArea}</strong>
            </span>
          </span>
        </button>
        <button
          aria-label="Close expert card"
          className="expert-close-btn"
          onClick={closeCard}
          type="button"
          tabIndex={isHidden ? -1 : 0}
        >
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="5" y1="5" x2="19" y2="19" />
            <line x1="19" y1="5" x2="5" y2="19" />
          </svg>
        </button>
      </div>

      <button
        ref={reopenButtonRef}
        aria-label="Reopen talk to an expert"
        className={showReopen ? "expert-reopen-btn visible" : "expert-reopen-btn"}
        onClick={reopenCard}
        type="button"
      >
        <svg
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" />
        </svg>
        Talk to an expert
      </button>
    </>
  );
}
