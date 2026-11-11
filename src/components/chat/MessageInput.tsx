"use client";

import { ImageIcon, Send, Smile, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AttachmentMenu } from "@/components/chat/AttachmentMenu";
import { ImagePreview } from "@/components/chat/ImagePreview";
import { IconButton } from "@/components/ui/IconButton";
import { bytesToBase64 } from "@/lib/chat-text";
import { compressImageFile, shouldCompressImage } from "@/lib/compress-image";
import { attachmentMime, validateAttachment } from "@/lib/validations";
import { formatBytes, isObjectId } from "@/lib/utils";
import { errorMessage } from "@/services/api";
import { getConversation, sendTextMessage } from "@/services/chat.service";
import { deleteAttachment, downloadCiphertext, uploadCiphertext } from "@/services/media.service";
import { useAuthStore } from "@/store/auth.store";
import { useChatStore } from "@/store/chat.store";
import { realtime } from "@/services/socket.service";

const EMOJI = ["😀", "😁", "😂", "😊", "😍", "😎", "🤔", "🙌", "👍", "👏", "🙏", "🔥", "✨", "🎉", "❤️", "💙", "✅", "📎", "🔒", "👀", "😴", "🤝", "📌", "📝"];

interface LocalAttachment {
  attachmentId: string;
  name: string;
  mimeType: string;
  size: number;
  previewUrl: string | null;
  key: Uint8Array;
}

export function MessageInput({ conversationId, snap = null }: { conversationId: string; snap?: { id: number; file: File } | null }) {
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const deviceId = useChatStore((state) => state.device?.deviceId ?? null);
  const conversation = useChatStore((state) => state.conversations.find((item) => item.id === conversationId));
  const [text, setText] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [accept, setAccept] = useState<string | undefined>(undefined);
  const [progress, setProgress] = useState<number | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [attachment, setAttachment] = useState<LocalAttachment | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const typingRef = useRef(false);
  const sendingRef = useRef(false);
  const attachmentRef = useRef<LocalAttachment | null>(null);
  const onFileRef = useRef<(file: File | undefined) => Promise<void>>(async () => undefined);
  const handledSnap = useRef(0);
  const canUpload = isObjectId(conversationId);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      const current = attachmentRef.current;
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
      const token = useAuthStore.getState().csrfToken;
      if (current && token) void deleteAttachment(token, current.attachmentId).catch(() => undefined);
    };
  }, []);

  function resize(element: HTMLTextAreaElement) {
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }

  async function sendMessage() {
    if (typingRef.current && canUpload) {
      typingRef.current = false;
      realtime.sendTyping(conversationId, false);
    }
    const value = text.trim();
    const pendingFile = attachmentRef.current;
    if ((!value && !pendingFile) || sendingRef.current) return;
    if (!csrfToken || !deviceId || !userId) {
      setHint("Sign in again before sending.");
      return;
    }
    let current = conversation;
    if (!current) {
      setHint("This conversation is still loading.");
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setHint(null);
    try {
      try {
        const fresh = await getConversation(conversationId);
        current = fresh.conversation;
        useChatStore.setState((state) => ({
          conversations: state.conversations.some((item) => item.id === fresh.conversation.id)
            ? state.conversations.map((item) => (item.id === fresh.conversation.id ? fresh.conversation : item))
            : [fresh.conversation, ...state.conversations],
        }));
      } catch {
        // Keep the conversation already on screen if the refresh fails.
      }
      const recipients = current.members
        .filter((member) => member.membershipStatus === "active")
        .flatMap((member) => (member.devices ?? []).map((device) => ({ userId: member.userId, deviceId: device.id })))
        .filter((recipient) => recipient.deviceId !== deviceId);
      const messages = await sendTextMessage(csrfToken, {
        conversationId,
        senderDeviceId: deviceId,
        recipients,
        text: value,
        file: pendingFile
          ? {
              attachmentId: pendingFile.attachmentId,
              name: pendingFile.name,
              mimeType: pendingFile.mimeType,
              size: pendingFile.size,
              key: bytesToBase64(pendingFile.key),
            }
          : undefined,
      });
      for (const message of messages) useChatStore.getState().upsertMessage(message);
      setText("");
      if (areaRef.current) areaRef.current.style.height = "auto";
      if (pendingFile) await clearAttachment(false);
    } catch (error) {
      setHint(errorMessage(error));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function clearAttachment(removeRemote: boolean) {
    abortRef.current?.abort();
    abortRef.current = null;
    setProgress(null);
    const current = attachmentRef.current;
    if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
    if (removeRemote && current && csrfToken) void deleteAttachment(csrfToken, current.attachmentId).catch(() => undefined);
    attachmentRef.current = null;
    setAttachment(null);
    setPreviewOpen(false);
  }

  function choose(next: string) {
    if (!canUpload) {
      setAttachmentError("Upload needs a conversation id the server recognizes.");
      return;
    }
    if (!csrfToken) {
      setAttachmentError("Sign in again before uploading.");
      return;
    }
    setAccept(next);
    window.setTimeout(() => fileRef.current?.click(), 0);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!csrfToken) {
      setAttachmentError("Sign in again before uploading.");
      return;
    }
    if (!canUpload) {
      setAttachmentError("Upload needs a conversation id the server recognizes.");
      return;
    }
    setAttachmentError(null);
    let prepared = file;
    if (shouldCompressImage(file)) {
      setCompressing(true);
      try {
        prepared = await compressImageFile(file);
      } finally {
        setCompressing(false);
      }
    }
    const validation = validateAttachment(prepared);
    if (validation) {
      setAttachmentError(validation);
      return;
    }
    await clearAttachment(true);
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress(0);
    try {
      const uploaded = await uploadCiphertext({
        file: prepared,
        conversationId,
        csrfToken,
        signal: controller.signal,
        onProgress: (loaded, total) => setProgress(total > 0 ? Math.round((loaded / total) * 100) : 0),
      });
      const mimeType = attachmentMime(prepared) ?? prepared.type;
      const previewUrl = mimeType.startsWith("image/") || mimeType.startsWith("video/") ? URL.createObjectURL(prepared) : null;
      const next = {
        attachmentId: uploaded.attachmentId,
        name: prepared.name,
        mimeType,
        size: prepared.size,
        previewUrl,
        key: uploaded.key,
      };
      attachmentRef.current = next;
      setAttachment(next);
      setHint(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setAttachmentError(errorMessage(error));
    } finally {
      setProgress(null);
      abortRef.current = null;
    }
  }

  onFileRef.current = onFile;

  useEffect(() => {
    if (!snap || snap.id === handledSnap.current) return;
    handledSnap.current = snap.id;
    void onFileRef.current(snap.file);
  }, [snap]);

  async function verifyDownload() {
    if (!attachment || !csrfToken) return;
    setAttachmentError(null);
    try {
      const blob = await downloadCiphertext({ attachmentId: attachment.attachmentId, csrfToken, key: attachment.key });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = attachment.name;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setAttachmentError(errorMessage(error));
    }
  }

  return (
    <div className="px-3 pt-1 pb-3 sm:px-4 sm:pb-4">
      {hint ? (
        <p className="mb-2 text-xs text-[var(--muted)]" role="status">
          {hint}
        </p>
      ) : null}
      {attachmentError ? (
        <p className="mb-2 text-sm text-[var(--danger)]" role="alert">
          {attachmentError}
        </p>
      ) : null}
      {compressing ? (
        <p className="mb-2 text-xs text-[var(--muted)]" role="status">
          Compressing image…
        </p>
      ) : null}
      {progress !== null ? (
        <div className="mb-2" aria-live="polite">
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
            <div className="h-full bg-[var(--primary)]" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-[var(--muted)]">
            <span>Encrypting and uploading {progress}%</span>
            <button type="button" className="underline" onClick={() => void clearAttachment(true)}>
              Cancel upload
            </button>
          </div>
        </div>
      ) : null}
      {attachment ? (
        <div className="mb-2 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--sidebar)] p-2">
          {attachment.previewUrl && attachment.mimeType.startsWith("image/") ? (
            <button type="button" className="shrink-0" aria-label={`Preview ${attachment.name}`} onClick={() => setPreviewOpen(true)}>
              {/* Local decrypted preview. The image optimizer cannot fetch a blob URL. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={attachment.previewUrl} alt="" className="h-14 w-14 cursor-zoom-in rounded-xl object-cover" />
            </button>
          ) : null}
          {previewOpen && attachment.previewUrl && attachment.mimeType.startsWith("image/") ? (
            <ImagePreview src={attachment.previewUrl} alt={attachment.name} onClose={() => setPreviewOpen(false)} />
          ) : null}
          {attachment.previewUrl && attachment.mimeType.startsWith("video/") ? <video src={attachment.previewUrl} className="h-14 w-20 rounded-xl" muted /> : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{attachment.name}</p>
            <p className="text-xs text-[var(--muted)]">{formatBytes(attachment.size)} · ciphertext on private storage</p>
          </div>
          <button type="button" className="text-xs underline" onClick={() => void verifyDownload()}>
            Download decrypted
          </button>
          <IconButton label="Remove attachment" onClick={() => void clearAttachment(true)}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
      ) : null}
      <div className="flex items-end gap-1 rounded-[1.75rem] border border-[var(--border)] bg-[var(--sidebar)] py-1 pr-1 pl-1">
        <div className="relative">
          <IconButton className="h-10 w-10 text-[var(--muted)]" label={emojiOpen ? "Close emoji" : "Insert emoji"} aria-expanded={emojiOpen} onClick={() => setEmojiOpen((value) => !value)}>
            <Smile className="h-5 w-5" />
          </IconButton>
          {emojiOpen ? (
            <div className="absolute bottom-14 left-0 z-20 grid w-56 grid-cols-6 gap-1 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-2 shadow-[var(--shadow)]">
              {EMOJI.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="rounded-lg p-1 text-lg hover:bg-[var(--hover)]"
                  aria-label={`Insert ${emoji}`}
                  onClick={() => {
                    setText((value) => value + emoji);
                    setEmojiOpen(false);
                    areaRef.current?.focus();
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <label className="sr-only" htmlFor="composer">
          Message
        </label>
        <textarea
          id="composer"
          ref={areaRef}
          rows={1}
          value={text}
          placeholder="Type a message..."
          className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-1 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
          onChange={(event) => {
            setText(event.target.value);
            resize(event.target);
            if (!canUpload) return;
            if (!typingRef.current && event.target.value.trim()) {
              typingRef.current = true;
              realtime.sendTyping(conversationId, true);
            }
            if (!event.target.value.trim() && typingRef.current) {
              typingRef.current = false;
              realtime.sendTyping(conversationId, false);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              sendMessage();
            }
          }}
          onBlur={() => {
            if (typingRef.current && canUpload) {
              typingRef.current = false;
              realtime.sendTyping(conversationId, false);
            }
          }}
        />
        <AttachmentMenu className="h-10 w-10 text-[var(--muted)]" disabled={progress !== null || compressing} onPick={choose} />
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          className="sr-only"
          aria-label="Choose a file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void onFile(file);
          }}
        />
        <IconButton className="h-10 w-10 text-[var(--muted)]" label="Upload image" disabled={progress !== null || compressing} onClick={() => choose("image/jpeg,image/png,image/webp,image/gif")}>
          <ImageIcon className="h-5 w-5" />
        </IconButton>
        <button
          type="button"
          className="mb-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-white transition hover:brightness-110 disabled:opacity-50"
          aria-label="Send message"
          disabled={sending || progress !== null || compressing}
          onClick={() => void sendMessage()}
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
