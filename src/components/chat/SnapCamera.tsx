"use client";

import { SwitchCamera, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Facing = "user" | "environment";

export function SnapCamera({ onClose, onCapture }: { onClose: () => void; onCapture: (file: File) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [facing, setFacing] = useState<Facing>("user");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let active = true;
    const previous = streamRef.current;
    streamRef.current = null;
    stopStream(previous);
    setReady(false);
    setError(null);
    void startCamera(facing, () => active).then((result) => {
      if (!active) {
        stopStream(result.stream);
        return;
      }
      if (result.error) {
        setError(result.error);
        setReady(Boolean(streamRef.current?.getVideoTracks().some((track) => track.readyState === "live")));
        return;
      }
      const video = videoRef.current;
      if (!video || !result.stream) return;
      stopStream(streamRef.current);
      streamRef.current = result.stream;
      video.srcObject = result.stream;
      void video.play().then(() => {
        if (active) setReady(true);
      }).catch(() => {
        if (active) setError("The camera could not start.");
      });
    });
    return () => {
      active = false;
    };
  }, [facing]);

  useEffect(() => {
    return () => stopStream(streamRef.current);
  }, []);

  async function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth < 1 || capturing) return;
    setCapturing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The snap could not be saved.");
      if (facing === "user") {
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      if (!blob) throw new Error("The snap could not be saved.");
      onCapture(new File([blob], `snap-${Date.now()}.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The snap could not be saved.");
      setCapturing(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Snap camera">
      <div className="flex items-center justify-between px-3 py-2">
        <button type="button" className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/10" aria-label="Close camera" onClick={onClose}>
          <X className="h-5 w-5" />
        </button>
        <p className="text-sm">Snap camera</p>
        <button
          type="button"
          className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/10 disabled:opacity-40"
          aria-label={facing === "user" ? "Use back camera" : "Use front camera"}
          disabled={capturing}
          onClick={() => setFacing((current) => (current === "user" ? "environment" : "user"))}
        >
          <SwitchCamera className="h-5 w-5" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <video ref={videoRef} className={`h-full w-full object-contain ${facing === "user" ? "-scale-x-100" : ""}`} autoPlay muted playsInline />
        {error ? <p className="absolute inset-x-6 bottom-6 text-center text-sm text-white" role="alert">{error}</p> : null}
        {!error && !ready ? <p className="absolute inset-x-6 top-6 text-center text-sm text-white/80">Starting camera…</p> : null}
      </div>
      <div className="grid place-items-center py-5">
        <button
          type="button"
          className="grid h-16 w-16 place-items-center rounded-full border-4 border-white disabled:opacity-40"
          aria-label="Take snap"
          disabled={!ready || Boolean(error) || capturing}
          onClick={() => void capture()}
        >
          <span className="h-12 w-12 rounded-full bg-white" />
        </button>
      </div>
    </div>,
    document.body,
  );
}

async function startCamera(facing: Facing, active: () => boolean): Promise<{ stream: MediaStream | null; error: string | null }> {
  if (!navigator.mediaDevices?.getUserMedia) return { stream: null, error: "This browser cannot use the camera." };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
    if (!active()) return { stream, error: null };
    return { stream, error: null };
  } catch (error) {
    return { stream: null, error: cameraMessage(error) };
  }
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function cameraMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") return "Allow camera access to take a snap.";
  if (error instanceof DOMException && error.name === "NotFoundError") return "No camera was found.";
  if (error instanceof DOMException && error.name === "NotReadableError") return "The camera is already in use.";
  return "The camera could not start.";
}
