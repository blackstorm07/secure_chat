"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function Avatar({
  label,
  image,
  presence = "unknown",
  size = "md",
  tone,
  dotBorder,
}: {
  label: string;
  image?: string | null;
  presence?: "online" | "offline" | "unknown";
  size?: "sm" | "md" | "lg" | "xl";
  tone?: string;
  dotBorder?: string;
}) {
  const [failed, setFailed] = useState(false);
  const dimension = size === "xl" ? "h-28 w-28 text-3xl" : size === "lg" ? "h-16 w-16 text-xl" : size === "sm" ? "h-10 w-10 text-sm" : "h-12 w-12 text-base";
  const dot = size === "xl" || size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <span className="relative inline-flex shrink-0">
      {image && !failed ? (
        // Profile images are caller-supplied https URLs, outside the image optimizer allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className={cn("rounded-full object-cover", dimension)} onError={() => setFailed(true)} />
      ) : (
        <span className={cn("inline-flex items-center justify-center rounded-full font-semibold text-white", dimension, tone ?? "bg-[var(--primary)]")} aria-hidden="true">
          {label.slice(0, 1).toUpperCase()}
        </span>
      )}
      {presence !== "unknown" ? (
        <span
          className={cn(
            "absolute right-0 bottom-0 rounded-full border-2",
            dot,
            dotBorder ?? "border-[var(--sidebar)]",
            presence === "online" ? "bg-[var(--online)]" : "bg-[#64748b]",
          )}
          aria-hidden="true"
        />
      ) : null}
      <span className="sr-only">{presence === "unknown" ? `${label}, status unknown` : `${label}, ${presence}`}</span>
    </span>
  );
}
