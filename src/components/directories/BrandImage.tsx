"use client";

import { useEffect, useState } from "react";
import { optimizedBrandImageUrl, type BrandImageFit } from "@/lib/brand-assets";

type BrandImageProps = {
  name: string;
  source?: string | null;
  className: string;
  fit?: BrandImageFit;
  width?: number;
  height?: number;
};

function initialsForName(name: string): string {
  return name
    .split(/[\s&\/-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function BrandImage({
  name,
  source,
  className,
  fit = "contain",
  width = 160,
  height = 120
}: BrandImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(!source);

  useEffect(() => {
    setLoaded(false);
    setFailed(!source);
  }, [source]);

  return (
    <span
      className={"brand-image-frame " + className}
      data-failed={failed ? "true" : "false"}
      data-loaded={loaded ? "true" : "false"}
      data-fit={fit}
      role={source ? undefined : "img"}
      aria-label={source ? undefined : name + " initials"}
    >
      <span className="brand-image-skeleton" aria-hidden="true" />
      <span className="brand-image-initials" aria-hidden="true">{initialsForName(name)}</span>
      {source && !failed ? (
        <img
          alt={name + " logo or project image"}
          decoding="async"
          loading="lazy"
          onError={() => setFailed(true)}
          onLoad={() => setLoaded(true)}
          src={optimizedBrandImageUrl(source, width, height, fit)}
        />
      ) : null}
    </span>
  );
}
