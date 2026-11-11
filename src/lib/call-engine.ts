const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export function captureCallMedia(media: "audio" | "video"): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: media === "video" ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
  });
}

export function stopMedia(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

interface CallEngineHandlers {
  onRemote: (stream: MediaStream) => void;
  onIce: (candidate: RTCIceCandidate | null) => void;
  onFailed: () => void;
}

export class CallEngine {
  readonly local: MediaStream;
  private readonly pc: RTCPeerConnection;
  private pending: RTCIceCandidateInit[] = [];

  constructor(local: MediaStream, handlers: CallEngineHandlers) {
    this.local = local;
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    for (const track of local.getTracks()) this.pc.addTrack(track, local);
    const remote = new MediaStream();
    this.pc.ontrack = (event) => {
      const tracks = event.streams[0]?.getTracks() ?? [event.track];
      for (const track of tracks) {
        if (!remote.getTracks().some((current) => current.id === track.id)) remote.addTrack(track);
      }
      handlers.onRemote(remote);
    };
    this.pc.onicecandidate = (event) => handlers.onIce(event.candidate);
    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === "failed") handlers.onFailed();
    };
  }

  async offer(): Promise<string> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return this.pc.localDescription?.sdp ?? "";
  }

  async acceptOffer(sdp: string): Promise<string> {
    await this.pc.setRemoteDescription({ type: "offer", sdp });
    await this.flush();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return this.pc.localDescription?.sdp ?? "";
  }

  async acceptAnswer(sdp: string): Promise<void> {
    await this.pc.setRemoteDescription({ type: "answer", sdp });
    await this.flush();
  }

  async addIce(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc.remoteDescription) {
      this.pending.push(candidate);
      return;
    }
    await this.pc.addIceCandidate(candidate);
  }

  setMuted(muted: boolean): void {
    for (const track of this.local.getAudioTracks()) track.enabled = !muted;
  }

  setCameraOff(off: boolean): void {
    for (const track of this.local.getVideoTracks()) track.enabled = !off;
  }

  close(): void {
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.onconnectionstatechange = null;
    this.pc.close();
    stopMedia(this.local);
  }

  private async flush(): Promise<void> {
    const queued = this.pending;
    this.pending = [];
    for (const candidate of queued) await this.pc.addIceCandidate(candidate);
  }
}
