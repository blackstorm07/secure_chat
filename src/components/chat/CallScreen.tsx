"use client";

import { Menu, Mic, MicOff, Minus, Phone, User, Video, VideoOff, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useCallStore, type CallPhase } from "@/store/call.store";

function formatDuration(startedAt: number, now: number): string {
  const total = Math.max(0, Math.floor((now - startedAt) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function statusText(phase: CallPhase, media: "audio" | "video", error: string | null, startedAt: number | null, now: number, hasLocal: boolean): string {
  if (phase === "ended") return error ?? "Call ended.";
  if (phase === "incoming") return media === "video" ? "Incoming video call" : "Incoming voice call";
  if (phase === "outgoing") return hasLocal ? "Calling…" : "Waiting for microphone and camera…";
  if (phase === "connecting") return "Connecting…";
  if (phase === "active" && startedAt) return formatDuration(startedAt, now);
  return "Call";
}

export function CallScreen() {
  const phase = useCallStore((state) => state.phase);
  const media = useCallStore((state) => state.media);
  const peerName = useCallStore((state) => state.peerName);
  const minimized = useCallStore((state) => state.minimized);
  const muted = useCallStore((state) => state.muted);
  const cameraOff = useCallStore((state) => state.cameraOff);
  const error = useCallStore((state) => state.error);
  const localStream = useCallStore((state) => state.localStream);
  const remoteStream = useCallStore((state) => state.remoteStream);
  const startedAt = useCallStore((state) => state.startedAt);
  const finish = useCallStore((state) => state.decline);
  const accept = useCallStore((state) => state.accept);
  const toggleMute = useCallStore((state) => state.toggleMute);
  const toggleCamera = useCallStore((state) => state.toggleCamera);
  const setMinimized = useCallStore((state) => state.setMinimized);
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phase !== "active") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === "ended" && minimized) setMinimized(false);
  }, [minimized, phase, setMinimized]);

  useEffect(() => {
    if (phase === "idle") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish, phase]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [menuOpen]);

  if (phase === "idle") return null;

  const status = statusText(phase, media, error, startedAt, now, Boolean(localStream));
  const remoteVideo = (remoteStream?.getVideoTracks().length ?? 0) > 0;
  const localVideo = Boolean(localStream?.getVideoTracks().some((track) => track.enabled));

  if (minimized) {
    return (
      <div className="fixed bottom-20 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-[#141414] px-4 py-2 text-white shadow-lg md:bottom-6">
        <button type="button" className="max-w-[220px] truncate text-sm" onClick={() => setMinimized(false)}>
          {peerName || "Call"} · {status}
        </button>
        <button type="button" aria-label="End call" title="End call" className="grid h-9 w-9 place-items-center rounded-full bg-[#ef4444]" onClick={finish}>
          <Phone className="h-4 w-4 rotate-[135deg]" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] bg-[#141414] text-white" role="dialog" aria-modal="true" aria-label={status}>
      {remoteVideo ? (
        <video className="absolute inset-0 h-full w-full object-cover" autoPlay playsInline muted ref={(node) => bind(node, remoteStream)} />
      ) : null}
      <audio className="sr-only" autoPlay ref={(node) => bind(node, remoteStream)} />
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-4">
        <div className="relative" ref={menuRef}>
          <CircleButton label={menuOpen ? "Close call menu" : "Call menu"} pressed={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
            <Menu className="h-5 w-5" />
          </CircleButton>
          {menuOpen ? (
            <div role="menu" className="absolute top-14 left-0 w-52 rounded-2xl border border-white/10 bg-[#1c1c1c] p-1 shadow-lg">
              <MenuItem
                label={muted ? "Unmute microphone" : "Mute microphone"}
                disabled={phase === "incoming" || phase === "ended"}
                onClick={() => {
                  setMenuOpen(false);
                  toggleMute();
                }}
              />
              <MenuItem
                label={cameraOff ? "Turn camera on" : "Turn camera off"}
                disabled={media !== "video" || phase === "incoming" || phase === "ended"}
                onClick={() => {
                  setMenuOpen(false);
                  toggleCamera();
                }}
              />
              <MenuItem
                label="End call"
                onClick={() => {
                  setMenuOpen(false);
                  finish();
                }}
              />
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <CircleButton label="Minimize call" onClick={() => setMinimized(true)}>
            <Minus className="h-5 w-5" />
          </CircleButton>
          <CircleButton label={cameraOff ? "Turn camera on" : "Turn camera off"} disabled={media !== "video" || phase === "incoming" || phase === "ended"} onClick={toggleCamera}>
            {cameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
          </CircleButton>
          <CircleButton label={phase === "incoming" ? "Decline call" : "End call"} onClick={finish}>
            <X className="h-5 w-5" />
          </CircleButton>
        </div>
      </div>
      {remoteVideo ? (
        <div className="absolute inset-x-0 top-20 z-10 text-center">
          <p className="text-lg font-medium">{peerName || "Username"}</p>
          <p className="mt-1 text-sm text-white/70">{status}</p>
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center px-6">
          <div className="grid h-36 w-36 place-items-center rounded-full bg-[#4a4a4a]" aria-hidden="true">
            <User className="h-16 w-16 text-[#2b2b2b]" strokeWidth={1.75} />
          </div>
          <p className="mt-6 text-lg font-medium">{peerName || "Username"}</p>
          <p className="mt-2 text-sm text-white/70" role="status">
            {status}
          </p>
          <CallActions phase={phase} muted={muted} onAccept={() => void accept()} onFinish={finish} onToggleMute={toggleMute} />
        </div>
      )}
      {remoteVideo ? (
        <div className="absolute inset-x-0 bottom-10 z-10 flex justify-center">
          <CallActions phase={phase} muted={muted} onAccept={() => void accept()} onFinish={finish} onToggleMute={toggleMute} />
        </div>
      ) : null}
      {localVideo ? (
        <video
          className="absolute right-4 bottom-28 z-10 h-36 w-28 rounded-2xl border border-white/20 object-cover shadow-lg"
          autoPlay
          playsInline
          muted
          ref={(node) => bind(node, localStream)}
        />
      ) : null}
    </div>
  );
}

function CallActions({
  phase,
  muted,
  onAccept,
  onFinish,
  onToggleMute,
}: {
  phase: CallPhase;
  muted: boolean;
  onAccept: () => void;
  onFinish: () => void;
  onToggleMute: () => void;
}) {
  if (phase === "incoming") {
    return (
      <div className="mt-10 flex items-center gap-10">
        <RoundButton label="Answer call" className="bg-[#22c55e]" onClick={onAccept}>
          <Phone className="h-6 w-6" />
        </RoundButton>
        <RoundButton label="Decline call" className="bg-[#ef4444]" onClick={onFinish}>
          <Phone className="h-6 w-6 rotate-[135deg]" />
        </RoundButton>
      </div>
    );
  }
  if (phase === "ended") return null;
  return (
    <div className="mt-10 flex items-center gap-6">
      <RoundButton label={muted ? "Unmute microphone" : "Mute microphone"} className="bg-white/15" onClick={onToggleMute}>
        {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
      </RoundButton>
      <RoundButton label="End call" className="bg-[#ef4444]" onClick={onFinish}>
        <Phone className="h-6 w-6 rotate-[135deg]" />
      </RoundButton>
    </div>
  );
}

function CircleButton({
  label,
  onClick,
  children,
  disabled = false,
  pressed = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className="grid h-11 w-11 place-items-center rounded-full border border-white/30 text-white transition hover:bg-white/10 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function MenuItem({ label, onClick, disabled = false }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={cn("w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-white/10 disabled:opacity-40", disabled && "hover:bg-transparent")}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function RoundButton({
  label,
  className,
  onClick,
  children,
}: {
  label: string;
  className: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={cn("grid h-14 w-14 place-items-center rounded-full text-white transition hover:brightness-110", className)}>
      {children}
    </button>
  );
}

function bind(node: HTMLMediaElement | null, stream: MediaStream | null): void {
  if (!node || node.srcObject === stream) return;
  node.srcObject = stream;
  if (stream) void node.play().catch(() => undefined);
}
