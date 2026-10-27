"use client";

import { useState } from "react";
import Link from "next/link";

type TalkToExpertProps = {
  areaName?: string | null;
};

export function TalkToExpert({ areaName }: TalkToExpertProps) {
  const [isVisible, setIsVisible] = useState(true);
  const insightArea = areaName?.trim() || "Rwanda land market";

  if (!isVisible) return null;

  return (
    <aside aria-label="Expert assistance" className="expert-cta">
      <Link
        aria-label={`Talk to an expert about ${insightArea}`}
        className="expert-cta-link"
        href="/contact"
      >
        <span aria-hidden="true" className="expert-cta-icon">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="10" cy="7" r="4" />
            <path d="M19 8v6M16 11h6" />
          </svg>
        </span>
        <span className="expert-cta-copy">
          <span className="expert-cta-title">Talk to an expert</span>
          <span className="expert-cta-subtitle">
            Get full insights on {insightArea}
          </span>
        </span>
      </Link>
      <button
        aria-label="Dismiss expert assistance"
        className="expert-cta-close"
        onClick={() => setIsVisible(false)}
        type="button"
      >
        ×
      </button>
    </aside>
  );
}
