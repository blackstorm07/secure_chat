"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Plus, Shield } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { ChatPinDialog } from "@/components/chat/ChatPinDialog";
import { useForm } from "react-hook-form";
import { ConversationItem } from "@/components/chat/ConversationItem";
import { ConversationSearch } from "@/components/chat/ConversationSearch";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useChat } from "@/hooks/useChat";
import { conversationTitle, formatListTime, otherMembers, visiblePresence } from "@/lib/utils";
import { participantSchema, type ParticipantValues } from "@/lib/validations";
import { errorMessage } from "@/services/api";
import { createDirectConversation } from "@/services/chat.service";
import { useAuthStore } from "@/store/auth.store";
import { useChatStore } from "@/store/chat.store";
import { usePinStore } from "@/store/pin.store";

export function ChatSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const { conversations, conversationsStatus, conversationsError, previews, unread, presence, connection, reload } = useChat();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const onSearch = useCallback((value: string) => setQuery(value), []);
  const form = useForm<ParticipantValues>({ resolver: zodResolver(participantSchema), defaultValues: { participantUserId: "" } });
  const selfOnline = connection === "online";
  const unlockedId = usePinStore((state) => state.unlockedId);
  const grant = usePinStore((state) => state.grant);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const filtered = conversations.filter((conversation) => {
      if (!query || !user) return true;
      const peers = otherMembers(conversation, user.id).join(" ").toLowerCase();
      const title = conversationTitle(conversation, user.id).toLowerCase();
      return conversation.id.toLowerCase().includes(query) || peers.includes(query) || title.includes(query);
    });
    return [...filtered].sort((left, right) => {
      const leftTime = previews[left.id]?.at ?? left.updatedAt;
      const rightTime = previews[right.id]?.at ?? right.updatedAt;
      return rightTime.localeCompare(leftTime);
    });
  }, [conversations, previews, query, user]);

  const close = useCallback(() => {
    setOpen(false);
    setCreateError(null);
    form.reset();
  }, [form]);

  return (
    <aside className="flex h-full w-full min-w-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)]">
      <div className="flex items-center justify-between px-4 pt-4 md:hidden">
        <Link href="/chat" className="flex items-center gap-2 font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--primary)] text-white">
            <Shield className="h-4 w-4" aria-hidden="true" />
          </span>
          SecureChat
        </Link>
        <ThemeToggle />
      </div>
      {user ? (
        <div className="flex items-center gap-3 px-4 py-4">
          <Avatar label={user.username} image={user.profileImage} presence={selfOnline ? "online" : "offline"} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user.username}</p>
            <p className={selfOnline ? "text-xs font-medium text-[var(--online)]" : "text-xs text-[var(--muted)]"}>{selfOnline ? "Online" : connection === "connecting" || connection === "reconnecting" ? "Connecting" : "Offline"}</p>
          </div>
          <Link href="/profile" className="grid h-9 w-9 place-items-center rounded-xl text-[var(--muted)] hover:bg-[var(--hover)]" aria-label="Account">
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      ) : null}
      <div className="px-4 pb-3">
        <ConversationSearch onSearch={onSearch} />
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_rgba(99,102,241,0.28)]"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New Chat
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {conversationsStatus === "loading" ? <p className="px-3 py-2 text-sm text-[var(--muted)]">Loading conversations</p> : null}
        {conversationsStatus === "error" ? (
          <div className="px-3 py-2" role="alert">
            <p className="text-sm">{conversationsError}</p>
            <Button className="mt-2" variant="ghost" onClick={() => void reload()}>
              Retry
            </Button>
          </div>
        ) : null}
        {conversationsStatus === "ready" && visible.length === 0 ? (
          <p className="px-3 py-4 text-sm text-[var(--muted)]">{query ? "No conversations match." : "No conversations yet."}</p>
        ) : null}
        <ul className="grid gap-1">
          {user
            ? visible.map((conversation) => {
                const title = conversationTitle(conversation, user.id);
                const peer = otherMembers(conversation, user.id)[0];
                const preview = previews[conversation.id];
                const count = unread[conversation.id] ?? 0;
                return (
                  <ConversationItem
                    key={conversation.id}
                    href={`/chat/${conversation.id}`}
                    title={title}
                    preview={preview && unlockedId !== conversation.id ? "Encrypted message" : (preview?.label ?? "No preview yet")}
                    onNavigate={
                      pathname === `/chat/${conversation.id}` && unlockedId === conversation.id
                        ? undefined
                        : (event) => {
                            event.preventDefault();
                            setPendingId(conversation.id);
                          }
                    }
                    timeLabel={formatListTime(preview?.at ?? conversation.updatedAt)}
                    unread={count}
                    active={pathname === `/chat/${conversation.id}`}
                    presence={peer ? visiblePresence(presence[peer], connection) : "unknown"}
                  />
                );
              })
            : null}
        </ul>
      </div>
      {open ? (
        <Modal title="New conversation" onClose={close}>
          <form
            className="grid gap-4"
            onSubmit={form.handleSubmit(async (values) => {
              if (!csrfToken) return;
              setCreateError(null);
              try {
                const result = await createDirectConversation(csrfToken, values.participantUserId);
                useChatStore.getState().loadConversations();
                close();
                router.push(`/chat/${result.conversation.id}`);
              } catch (error) {
                setCreateError(errorMessage(error));
              }
            })}
          >
            <p className="text-sm text-[var(--muted)]">The server accepts another account id. It does not look up usernames.</p>
            {createError ? (
              <p role="alert" className="text-sm text-[var(--danger)]">
                {createError}
              </p>
            ) : null}
            <Field label="User id" htmlFor="participantUserId" error={form.formState.errors.participantUserId?.message}>
              <input id="participantUserId" className="field" autoComplete="off" {...form.register("participantUserId")} />
            </Field>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Starting" : "Start conversation"}
            </Button>
          </form>
        </Modal>
      ) : null}
      {pendingId ? (
        <ChatPinDialog
          onClose={() => setPendingId(null)}
          onUnlocked={() => {
            const id = pendingId;
            grant(id);
            setPendingId(null);
            router.push(`/chat/${id}`);
          }}
        />
      ) : null}
    </aside>
  );
}
