"use client";

import { useCallback, useLayoutEffect, useState, type ReactNode } from "react";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatPinDialog } from "@/components/chat/ChatPinDialog";
import { ContactPanel } from "@/components/chat/ContactPanel";
import { MessageInput } from "@/components/chat/MessageInput";
import { SnapCamera } from "@/components/chat/SnapCamera";
import { MessageList } from "@/components/chat/MessageList";
import { Button } from "@/components/ui/Button";
import { useMessages } from "@/hooks/useMessages";
import { isObjectId, otherMembers, conversationTitle } from "@/lib/utils";
import { errorMessage } from "@/services/api";
import { deleteMessage } from "@/services/chat.service";
import { useAuthStore } from "@/store/auth.store";
import { useChatStore } from "@/store/chat.store";
import { usePinStore } from "@/store/pin.store";

export function ChatWindow({ conversationId }: { conversationId: string }) {
  return <LiveChat key={conversationId} conversationId={conversationId} />;
}

function ChatSurface({
  title,
  peerId,
  peerDeviceId,
  peerIdentityKey,
  image,
  tone,
  presenceOverride,
  about,
  banner,
  list,
  composer,
  conversationId,
  onSnap,
  cameraOpen,
  onCloseCamera,
  onCapture,
}: {
  title: string;
  peerId: string | null;
  peerDeviceId: string | null;
  peerIdentityKey: string | null;
  image?: string | null;
  tone?: string;
  presenceOverride?: "online" | "offline" | "unknown";
  about: string;
  banner?: string | null;
  list: ReactNode;
  composer: ReactNode;
  conversationId: string;
  onSnap: () => void;
  cameraOpen: boolean;
  onCloseCamera: () => void;
  onCapture: (file: File) => void;
}) {
  const unlocked = usePinStore((state) => state.unlockedId === conversationId);
  const unlock = usePinStore((state) => state.unlock);
  const [pinOpen, setPinOpen] = useState(false);
  useLayoutEffect(() => {
    const pin = usePinStore.getState();
    if (pin.pendingUnlockId === conversationId) {
      pin.consume(conversationId);
      return;
    }
    if (pin.unlockedId !== conversationId) setPinOpen(true);
  }, [conversationId]);
  const [panel, setPanel] = useState<"auto" | "open" | "closed">("auto");
  const panelClass =
    panel === "closed"
      ? "hidden"
      : panel === "open"
        ? "absolute inset-0 z-20 flex min-h-0 flex-col xl:static xl:inset-auto xl:z-auto xl:w-[300px] xl:shrink-0"
        : "hidden min-h-0 w-[300px] shrink-0 xl:flex";
  return (
    <section id="main" className="relative flex min-h-0 min-w-0 flex-1">
      <div className="chat-wallpaper flex min-w-0 flex-1 flex-col">
        <ChatHeader
          title={title}
          peerId={peerId}
          conversationId={conversationId}
          image={image}
          tone={tone}
          presenceOverride={presenceOverride}
          locked={!unlocked}
          onDecrypt={() => setPinOpen(true)}
          onSnap={onSnap}
          panel={panel}
          onToggleDetails={() =>
            setPanel((current) => {
              if (current === "open") return "closed";
              if (current === "closed") return "open";
              return window.matchMedia("(min-width: 1280px)").matches ? "closed" : "open";
            })
          }
        />
        {banner ? <p className="px-4 pt-3 text-center text-[11px] text-[var(--muted)]">{banner}</p> : null}
        {list}
        {pinOpen ? (
          <ChatPinDialog
            onClose={() => setPinOpen(false)}
            onUnlocked={() => {
              unlock(conversationId);
              setPinOpen(false);
            }}
          />
        ) : null}
        {composer}
        {cameraOpen ? <SnapCamera onClose={onCloseCamera} onCapture={onCapture} /> : null}
      </div>
      <div className={panelClass}>
        <ContactPanel
          title={title}
          peerId={peerId}
          peerDeviceId={peerDeviceId}
          peerIdentityKey={peerIdentityKey}
          about={about}
          presence={presenceOverride}
          image={image}
          tone={tone}
          onClose={() => setPanel("closed")}
        />
      </div>
    </section>
  );
}

function LiveChat({ conversationId }: { conversationId: string }) {
  const user = useAuthStore((state) => state.user);
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const conversation = useChatStore((state) => state.conversations.find((item) => item.id === conversationId));
  const { thread, typing, userId, loadOlder } = useMessages(conversationId);
  const unlocked = usePinStore((state) => state.unlockedId === conversationId);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [snap, setSnap] = useState<{ id: number; file: File } | null>(null);

  const onDelete = useCallback(
    async (ids: string[]) => {
      if (!csrfToken) return;
      setActionError(null);
      try {
        for (const id of ids) await deleteMessage(csrfToken, id);
        useChatStore.getState().removeMessages(ids);
      } catch (error) {
        setActionError(errorMessage(error));
      }
    },
    [csrfToken],
  );

  if (!isObjectId(conversationId)) {
    return <p className="p-6">That conversation id is not valid.</p>;
  }

  const title = conversation && user ? conversationTitle(conversation, user.id) : "Conversation";
  const peerId = conversation && user ? (otherMembers(conversation, user.id)[0] ?? null) : null;
  const peerDevice =
    conversation && user
      ? (conversation.members.find((member) => member.membershipStatus === "active" && member.userId !== user.id)?.devices[0] ?? null)
      : null;

  return (
    <ChatSurface
      title={title}
      peerId={peerId}
      peerDeviceId={peerDevice?.id ?? null}
      peerIdentityKey={peerDevice?.identityPublicKey ?? null}
      about="No status message is stored for this account."
      list={
        <>
          {actionError ? (
            <p className="px-4 py-2 text-sm text-[var(--danger)]" role="alert">
              {actionError}
            </p>
          ) : null}
          {thread?.status === "loading" && (thread.items.length ?? 0) === 0 ? <p className="px-4 py-3 text-sm text-[var(--muted)]">Loading messages</p> : null}
          {thread?.status === "error" ? (
            <div className="flex items-center justify-between gap-3 px-4 py-3" role="alert">
              <p className="text-sm">{thread.error}</p>
              <Button variant="ghost" onClick={() => void useChatStore.getState().loadMessages(conversationId, "latest")}>
                Retry
              </Button>
            </div>
          ) : null}
          <MessageList
            items={thread?.items ?? []}
            selfId={userId}
            typing={typing}
            loadingOlder={thread?.loadingOlder ?? false}
            hasOlder={Boolean(thread?.nextCursor)}
            onLoadOlder={() => void loadOlder()}
            onDelete={(ids) => void onDelete(ids)}
            locked={!unlocked}
          />
          <span className="sr-only">Signed in as {user?.id || "unknown user"}</span>
        </>
      }
      conversationId={conversationId}
      onSnap={() => setCameraOpen(true)}
      cameraOpen={cameraOpen}
      onCloseCamera={() => setCameraOpen(false)}
      onCapture={(file) => {
        setSnap({ id: Date.now(), file });
        setCameraOpen(false);
      }}
      composer={<MessageInput key={conversationId} conversationId={conversationId} snap={snap} />}
    />
  );
}
