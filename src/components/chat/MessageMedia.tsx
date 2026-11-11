"use client";

import { useEffect, useState } from "react";
import { ImagePreview } from "@/components/chat/ImagePreview";
import { base64ToBytes, type ChatAttachment } from "@/lib/chat-text";
import { errorMessage } from "@/services/api";
import { downloadCiphertext } from "@/services/media.service";
import { useAuthStore } from "@/store/auth.store";

export function MessageMedia({ file, outgoing }: { file: ChatAttachment; outgoing: boolean }) {
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!csrfToken) return;
    let active = true;
    let objectUrl: string | null = null;
    setUrl(null);
    setFailed(null);
    downloadCiphertext({ attachmentId: file.attachmentId, csrfToken, key: base64ToBytes(file.key) })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((error: unknown) => {
        if (active) setFailed(errorMessage(error));
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [csrfToken, file.attachmentId, file.key]);

  if (failed) {
    return <p className={outgoing ? "text-xs text-white/80" : "text-xs text-[var(--danger)]"}>{failed}</p>;
  }
  if (!url) {
    return <p className={outgoing ? "text-xs text-white/75" : "text-xs text-[var(--muted)]"}>Opening encrypted file…</p>;
  }
  if (file.mimeType.startsWith("image/")) {
    return (
      <>
        <button type="button" className="block max-w-full" aria-label={`Preview ${file.name}`} onClick={() => setPreviewOpen(true)}>
          {/* The decrypted image exists only as a local blob URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={file.name} className="max-h-64 max-w-full cursor-zoom-in rounded-xl object-contain" />
        </button>
        {previewOpen ? <ImagePreview src={url} alt={file.name} onClose={() => setPreviewOpen(false)} /> : null}
      </>
    );
  }
  if (file.mimeType.startsWith("video/")) {
    return <video src={url} controls className="max-h-64 max-w-full rounded-xl" />;
  }
  return (
    <a href={url} download={file.name} className={outgoing ? "text-sm underline" : "text-sm text-[var(--primary)] underline"}>
      {file.name}
    </a>
  );
}
