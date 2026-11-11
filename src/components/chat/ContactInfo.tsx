"use client";

import { Ban, X } from "lucide-react";
import { useEffect, useState } from "react";
import { EncryptionIndicator } from "@/components/chat/EncryptionIndicator";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { UnavailableNote } from "@/components/ui/UnavailableNote";
import { copyText, shortId, visiblePresence } from "@/lib/utils";
import { useChatStore } from "@/store/chat.store";
import { describeEncryption, safetyNumber } from "@/services/encryption.service";

export function ContactInfo({
  title,
  peerId,
  peerDeviceId,
  peerIdentityKey,
  about,
  presence,
  image,
  tone,
  onClose,
}: {
  title: string;
  peerId: string | null;
  peerDeviceId: string | null;
  peerIdentityKey: string | null;
  about: string;
  presence?: "online" | "offline" | "unknown";
  image?: string | null;
  tone?: string;
  onClose: () => void;
}) {
  const storedPresence = useChatStore((state) => (peerId ? state.presence[peerId] : undefined));
  const connection = useChatStore((state) => state.connection);
  const resolvedPresence = visiblePresence(storedPresence, connection, presence);
  const encryption = describeEncryption();
  const [copied, setCopied] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [mediaNote, setMediaNote] = useState(false);
  const [filesNote, setFilesNote] = useState(false);
  const [safetyFor, setSafetyFor] = useState<{ deviceId: string; value: string } | null>(null);
  const safety = safetyFor && safetyFor.deviceId === peerDeviceId ? safetyFor.value : null;
  const status = resolvedPresence === "online" ? "Online" : resolvedPresence === "offline" ? "Offline" : "Status unknown";

  useEffect(() => {
    if (!peerDeviceId || !peerIdentityKey) return;
    let cancelled = false;
    const deviceId = peerDeviceId;
    void safetyNumber(deviceId, peerIdentityKey)
      .then((value) => {
        if (!cancelled && value) setSafetyFor({ deviceId, value });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [peerDeviceId, peerIdentityKey]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Contact Info</h2>
        <button type="button" className="grid h-9 w-9 place-items-center rounded-xl text-[var(--muted)] hover:bg-[var(--hover)]" aria-label="Close contact information" onClick={onClose}>
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="grid justify-items-center gap-2 text-center">
        <Avatar label={title} image={image} tone={tone} presence={resolvedPresence} size="xl" dotBorder="border-[var(--panel)]" />
        <p className="text-lg font-semibold">{title}</p>
        <p className={resolvedPresence === "online" ? "text-sm font-medium text-[var(--online)]" : "text-sm text-[var(--muted)]"}>{status}</p>
        <p className="max-w-[16rem] text-sm text-[var(--muted)]">{about}</p>
        {peerId ? (
          <Button
            variant="ghost"
            onClick={() => {
              void copyText(peerId).then((ok) => setCopied(ok));
            }}
          >
            {copied ? "Copied" : `Copy user id ${shortId(peerId)}`}
          </Button>
        ) : null}
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Encryption</h3>
        <EncryptionIndicator state={encryption.state} layout="card" detail={encryption.detail} />
        {safety ? (
          <p className="mt-2 font-mono text-[11px] leading-5 break-all text-[var(--muted)]">Safety number {safety.replace(/(.{5})/g, "$1 ").trim()}</p>
        ) : (
          <p className="mt-2 text-xs text-[var(--muted)]">The safety number appears after both browsers have published a device key.</p>
        )}
      </div>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Shared Media</h3>
          <button type="button" className="text-xs font-medium text-[var(--primary)]" onClick={() => setMediaNote((value) => !value)}>
            See all
          </button>
        </div>
        <UnavailableNote>Attachment keys travel inside the encrypted message. This client cannot list shared media yet.</UnavailableNote>
        {mediaNote ? (
          <p className="mt-2 text-xs text-[var(--muted)]" role="status">
            There is no shared-media index on the server.
          </p>
        ) : null}
      </section>
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Files</h3>
          <button type="button" className="text-xs font-medium text-[var(--primary)]" onClick={() => setFilesNote((value) => !value)}>
            See all
          </button>
        </div>
        <UnavailableNote>The server cannot list shared files. Attachment keys are not available to this client yet.</UnavailableNote>
        {filesNote ? (
          <p className="mt-2 text-xs text-[var(--muted)]" role="status">
            Shared files appear only after a message can carry an attachment key.
          </p>
        ) : null}
      </section>
      <div className="mt-auto pt-2">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/80 py-3 text-sm font-medium text-red-400 transition hover:bg-red-500/10"
          onClick={() => setBlockOpen(true)}
        >
          <Ban className="h-4 w-4" aria-hidden="true" />
          Block Contact
        </button>
      </div>
      {blockOpen ? (
        <Modal title="Block contact" onClose={() => setBlockOpen(false)}>
          <p className="text-sm text-[var(--muted)]">Blocking is not available. The server has no block list, so this button does not change who can message you.</p>
          <Button className="mt-4" variant="ghost" onClick={() => setBlockOpen(false)}>
            Close
          </Button>
        </Modal>
      ) : null}
    </div>
  );
}
