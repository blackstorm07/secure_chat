"use client";

import { ContactInfo } from "@/components/chat/ContactInfo";

export function ContactPanel({
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
  return (
    <aside className="flex min-h-0 w-full flex-1 flex-col border-l border-[var(--border)] bg-[var(--panel)] xl:w-[300px] xl:flex-none">
      <ContactInfo
        title={title}
        peerId={peerId}
        peerDeviceId={peerDeviceId}
        peerIdentityKey={peerIdentityKey}
        about={about}
        presence={presence}
        image={image}
        tone={tone}
        onClose={onClose}
      />
    </aside>
  );
}
