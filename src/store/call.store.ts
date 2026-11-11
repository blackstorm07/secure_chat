import { create } from "zustand";
import { createClientMessageId } from "@/lib/chat-text";
import { CallEngine, captureCallMedia, stopMedia } from "@/lib/call-engine";
import { realtime, type CallSignal } from "@/services/socket.service";
import { useAuthStore } from "@/store/auth.store";
import { useChatStore } from "@/store/chat.store";

export type CallPhase = "idle" | "outgoing" | "incoming" | "connecting" | "active" | "ended";
export type CallMedia = "audio" | "video";

interface CallState {
  phase: CallPhase;
  media: CallMedia;
  conversationId: string | null;
  callId: string | null;
  peerUserId: string | null;
  peerName: string;
  minimized: boolean;
  muted: boolean;
  cameraOff: boolean;
  error: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  startedAt: number | null;
  startOutgoing: (input: { conversationId: string; peerUserId: string; peerName: string; media: CallMedia }) => Promise<void>;
  accept: () => Promise<void>;
  decline: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  setMinimized: (minimized: boolean) => void;
  applySignal: (signal: CallSignal) => void;
  endLocal: () => void;
}

const cleared = {
  phase: "idle" as const,
  media: "video" as const,
  conversationId: null,
  callId: null,
  peerUserId: null,
  peerName: "",
  minimized: false,
  muted: false,
  cameraOff: false,
  error: null,
  localStream: null,
  remoteStream: null,
  startedAt: null,
};

let sessionGeneration = 0;
let engine: CallEngine | null = null;
let queuedOffer: string | null = null;
let offerHandled = false;
let earlyIce: RTCIceCandidateInit[] = [];
let ringTimer: number | null = null;

function peerLabel(conversationId: string, peerUserId: string): string {
  const conversation = useChatStore.getState().conversations.find((item) => item.id === conversationId);
  const member = conversation?.members.find((item) => item.userId === peerUserId && item.membershipStatus === "active");
  return member?.username || "Username";
}

function mediaBlockedReason(): string | null {
  if (typeof window === "undefined") return "The call could not be started.";
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return "This browser can use the camera and microphone on localhost or HTTPS only.";
  }
  return null;
}

function mediaError(error: unknown): string {
  const blocked = mediaBlockedReason();
  if (blocked) return blocked;
  if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
    return "Allow the microphone and camera to place this call.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No microphone or camera was found.";
  }
  return "The call could not be started.";
}

function clearRing(): void {
  if (ringTimer !== null) window.clearTimeout(ringTimer);
  ringTimer = null;
}

function teardown(): void {
  clearRing();
  offerHandled = false;
  queuedOffer = null;
  earlyIce = [];
  const current = engine;
  engine = null;
  if (current) current.close();
  else stopMedia(useCallStore.getState().localStream);
}

function alive(generation: number): boolean {
  return generation === sessionGeneration;
}

function end(message: string | null, notify: boolean): void {
  const snapshot = useCallStore.getState();
  sessionGeneration += 1;
  const kind = snapshot.phase === "incoming" ? "decline" : snapshot.phase === "outgoing" ? "cancel" : "hangup";
  const shouldNotify = notify && Boolean(snapshot.callId && snapshot.conversationId) && snapshot.phase !== "idle" && snapshot.phase !== "ended";
  teardown();
  if (message) {
    useCallStore.setState({
      ...cleared,
      phase: "ended",
      error: message,
      peerName: snapshot.peerName,
      peerUserId: snapshot.peerUserId,
      conversationId: snapshot.conversationId,
      media: snapshot.media,
    });
  } else {
    useCallStore.setState(cleared);
  }
  if (shouldNotify && snapshot.callId && snapshot.conversationId) {
    void realtime.sendCall({ conversationId: snapshot.conversationId, callId: snapshot.callId, kind });
  }
}

function attachEngine(local: MediaStream): CallEngine {
  if (engine) return engine;
  engine = new CallEngine(local, {
    onRemote: (stream) => {
      useCallStore.setState({
        remoteStream: stream,
        phase: "active",
        startedAt: useCallStore.getState().startedAt ?? Date.now(),
        error: null,
      });
    },
    onIce: (candidate) => {
      const state = useCallStore.getState();
      if (!state.callId || !state.conversationId || !candidate) return;
      void realtime.sendCall({
        conversationId: state.conversationId,
        callId: state.callId,
        kind: "ice",
        candidate: JSON.stringify(candidate.toJSON()),
      });
    },
    onFailed: () => {
      const state = useCallStore.getState();
      if (state.phase === "idle" || state.phase === "ended") return;
      end("The call disconnected.", true);
    },
  });
  const queued = earlyIce;
  earlyIce = [];
  const { muted, cameraOff } = useCallStore.getState();
  engine.setMuted(muted);
  engine.setCameraOff(cameraOff);
  for (const candidate of queued) void engine.addIce(candidate);
  return engine;
}

async function pushIce(raw: string | null | undefined): Promise<void> {
  if (!raw) return;
  let parsed: RTCIceCandidateInit;
  try {
    parsed = JSON.parse(raw) as RTCIceCandidateInit;
  } catch {
    return;
  }
  if (!engine) {
    earlyIce.push(parsed);
    return;
  }
  await engine.addIce(parsed);
}

async function answerOffer(sdp: string): Promise<void> {
  const state = useCallStore.getState();
  if (offerHandled || !engine || state.phase === "incoming" || state.phase === "outgoing" || state.phase === "idle" || state.phase === "ended") {
    if (!offerHandled) queuedOffer = sdp;
    return;
  }
  if (!state.callId || !state.conversationId) return;
  offerHandled = true;
  queuedOffer = null;
  const answer = await engine.acceptOffer(sdp);
  await realtime.sendCall({ conversationId: state.conversationId, callId: state.callId, kind: "answer", sdp: answer });
}

async function handleSignal(signal: CallSignal): Promise<void> {
  const selfId = useAuthStore.getState().user?.id;
  if (signal.fromUserId && selfId && signal.fromUserId === selfId) {
    const state = useCallStore.getState();
    if (signal.kind === "cancel" && state.phase === "incoming" && state.callId === signal.callId) end(null, false);
    return;
  }
  const state = useCallStore.getState();
  if (signal.kind !== "invite" && signal.callId !== state.callId) return;

  if (signal.kind === "invite") {
    if (state.phase !== "idle" && state.phase !== "ended") {
      void realtime.sendCall({ conversationId: signal.conversationId, callId: signal.callId, kind: "decline" });
      return;
    }
    const media = signal.media === "audio" ? "audio" : "video";
    sessionGeneration += 1;
    teardown();
    useCallStore.setState({
      ...cleared,
      phase: "incoming",
      media,
      conversationId: signal.conversationId,
      callId: signal.callId,
      peerUserId: signal.fromUserId,
      peerName: peerLabel(signal.conversationId, signal.fromUserId),
    });
    void useChatStore.getState().loadConversations().then(() => {
      const latest = useCallStore.getState();
      if (latest.callId !== signal.callId) return;
      useCallStore.setState({ peerName: peerLabel(signal.conversationId, signal.fromUserId) });
    });
    return;
  }

  if (signal.kind === "accept" && state.phase === "outgoing" && state.localStream && state.callId && state.conversationId) {
    clearRing();
    useCallStore.setState({ phase: "connecting", error: null });
    try {
      const current = attachEngine(state.localStream);
      const sdp = await current.offer();
      if (useCallStore.getState().callId !== state.callId) return;
      const ack = await realtime.sendCall({ conversationId: state.conversationId, callId: state.callId, kind: "offer", sdp });
      if (!ack.success && useCallStore.getState().callId === state.callId) end(ack.message || "The call could not be connected.", true);
    } catch {
      if (useCallStore.getState().callId === state.callId) end("The call could not be connected.", true);
    }
    return;
  }

  if (signal.kind === "decline") {
    end("Call declined.", false);
    return;
  }

  if (signal.kind === "cancel" || signal.kind === "hangup") {
    if (state.phase === "incoming" && signal.kind === "cancel") end(null, false);
    else if (state.phase === "outgoing" && signal.kind === "cancel") end("Call cancelled.", false);
    else end("Call ended.", false);
    return;
  }

  if (signal.kind === "offer" && signal.sdp) {
    await answerOffer(signal.sdp);
    return;
  }

  if (signal.kind === "answer" && signal.sdp && engine) {
    await engine.acceptAnswer(signal.sdp);
    return;
  }

  if (signal.kind === "ice") await pushIce(signal.candidate);
}

export const useCallStore = create<CallState>((set, get) => ({
  ...cleared,
  setMinimized: (minimized) => set({ minimized }),
  applySignal: (signal) => {
    void handleSignal(signal);
  },
  endLocal: () => end(null, false),
  decline: () => end(null, true),
  toggleMute: () => {
    const muted = !get().muted;
    engine?.setMuted(muted);
    if (!engine) {
      for (const track of get().localStream?.getAudioTracks() ?? []) track.enabled = !muted;
    }
    set({ muted });
  },
  toggleCamera: () => {
    const cameraOff = !get().cameraOff;
    engine?.setCameraOff(cameraOff);
    if (!engine) {
      for (const track of get().localStream?.getVideoTracks() ?? []) track.enabled = !cameraOff;
    }
    set({ cameraOff });
  },
  accept: async () => {
    const generation = sessionGeneration;
    const snapshot = get();
    if (snapshot.phase !== "incoming" || !snapshot.callId || !snapshot.conversationId) return;
    const blocked = mediaBlockedReason();
    if (blocked) {
      end(blocked, true);
      return;
    }
    set({ phase: "connecting", error: null });
    let local: MediaStream | null = null;
    try {
      local = await captureCallMedia(snapshot.media);
      if (!alive(generation)) {
        stopMedia(local);
        return;
      }
      set({ localStream: local });
      const current = attachEngine(local);
      const ack = await realtime.sendCall({ conversationId: snapshot.conversationId, callId: snapshot.callId, kind: "accept" });
      if (!alive(generation)) return;
      if (!ack.success) {
        end(ack.message || "The call could not be answered.", false);
        return;
      }
      if (queuedOffer) await answerOffer(queuedOffer);
      if (useCallStore.getState().remoteStream && useCallStore.getState().phase === "connecting") {
        set({ phase: "active", startedAt: get().startedAt ?? Date.now() });
      }
    } catch (error) {
      if (!alive(generation)) {
        stopMedia(local);
        return;
      }
      end(mediaError(error), true);
    }
  },
  startOutgoing: async (input) => {
    const phase = get().phase;
    if (phase !== "idle" && phase !== "ended") return;
    const blocked = mediaBlockedReason();
    if (blocked || !realtime.isConnected()) {
      set({
        ...cleared,
        phase: "ended",
        error: blocked ?? "Realtime is offline.",
        peerName: input.peerName,
        peerUserId: input.peerUserId,
        conversationId: input.conversationId,
        media: input.media,
      });
      return;
    }
    sessionGeneration += 1;
    const generation = sessionGeneration;
    teardown();
    const callId = createClientMessageId();
    set({
      ...cleared,
      phase: "outgoing",
      media: input.media,
      conversationId: input.conversationId,
      callId,
      peerUserId: input.peerUserId,
      peerName: input.peerName,
    });
    let local: MediaStream | null = null;
    let invited = false;
    try {
      const ack = await realtime.sendCall({ conversationId: input.conversationId, callId, kind: "invite", media: input.media });
      if (!alive(generation)) return;
      if (!ack.success) {
        end(ack.message || "The call could not be placed.", false);
        return;
      }
      invited = true;
      clearRing();
      ringTimer = window.setTimeout(() => {
        const latest = useCallStore.getState();
        if (latest.phase === "outgoing" && latest.callId === callId) end("No answer.", true);
      }, 45_000);
      local = await captureCallMedia(input.media);
      if (!alive(generation)) {
        stopMedia(local);
        return;
      }
      set({ localStream: local });
    } catch (error) {
      if (!alive(generation)) {
        stopMedia(local);
        return;
      }
      end(mediaError(error), invited);
    }
  },
}));
