"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function ImagePreview({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-4" onMouseDown={() => onCloseRef.current()}>
      <button
        ref={closeRef}
        type="button"
        className="absolute top-3 right-3 z-10 grid h-11 w-11 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70"
        aria-label="Close preview"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => onCloseRef.current()}
      >
        <X className="h-5 w-5" />
      </button>
      <div role="dialog" aria-modal="true" aria-label={alt || "Image preview"} onMouseDown={(event) => event.stopPropagation()}>
        {/* Decrypted preview is a local blob URL. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="max-h-[90vh] max-w-[92vw] rounded-xl object-contain" />
      </div>
    </div>,
    document.body,
  );
}
