import { create } from "zustand";
import { errorMessage } from "@/services/api";
import { listConversations, listMessages } from "@/services/chat.service";
import type { RealtimeNotice } from "@/services/socket.service";
import type { ConversationDto } from "@/types";
import type { ConversationPreview, ConnectionState, PresenceState } from "@/types/chat";
import type { StoredMessage } from "@/types/message";
import type { ActiveDevice } from "@/services/device.service";
import { mapPool } from "@/lib/utils";

export interface ThreadState {
  items: StoredMessage[];
  nextCursor: string | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  loadingOlder: boolean;
}

interface ChatState {
  conversations: ConversationDto[];
  conversationsStatus: "idle" | "loading" | "ready" | "error";
  conversationsError: string | null;
  previews: Record<string, ConversationPreview>;
  threads: Record<string, ThreadState>;
  unread: Record<string, number>;
  presence: Record<string, PresenceState>;
  typing: Record<string, string[]>;
  connection: ConnectionState;
  realtimeError: string | null;
  activeConversationId: string | null;
  device: ActiveDevice | null;
  deviceError: string | null;
  loadConversations: () => Promise<void>;
  loadMessages: (conversationId: string, mode: "latest" | "older") => Promise<void>;
  loadPreview: (conversationId: string) => Promise<void>;
  setActive: (conversationId: string | null) => void;
  setDevice: (device: ActiveDevice | null, error?: string | null) => void;
  upsertMessage: (message: StoredMessage) => void;
  removeMessages: (ids: string[]) => void;
  applyRealtime: (event: RealtimeNotice) => void;
}

const emptyThread = (): ThreadState => ({
  items: [],
  nextCursor: null,
  status: "idle",
  error: null,
  loadingOlder: false,
});

const typingTimers = new Map<string, number>();

function previewLabel(message: Pick<StoredMessage, "plaintext" | "attachment">): string {
  if (message.plaintext) return message.plaintext;
  if (message.attachment?.mimeType.startsWith("image/")) return "Photo";
  if (message.attachment) return message.attachment.name;
  return "Encrypted message";
}

function sortMessages(items: StoredMessage[]): StoredMessage[] {
  return [...items].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

function mergeMessages(current: StoredMessage[], incoming: StoredMessage[]): StoredMessage[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    const previous = byId.get(item.id);
    byId.set(item.id, {
      ...item,
      plaintext: item.plaintext ?? previous?.plaintext ?? null,
      attachment: item.attachment ?? previous?.attachment ?? null,
    });
  }
  return sortMessages([...byId.values()]);
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  conversationsStatus: "idle",
  conversationsError: null,
  previews: {},
  threads: {},
  unread: {},
  presence: {},
  typing: {},
  connection: "offline",
  realtimeError: null,
  activeConversationId: null,
  device: null,
  deviceError: null,
  setDevice: (device, error = null) => set({ device, deviceError: error }),
  setActive: (conversationId) =>
    set((state) => ({
      activeConversationId: conversationId,
      unread: conversationId ? { ...state.unread, [conversationId]: 0 } : state.unread,
    })),
  loadConversations: async () => {
    const initial = get().conversations.length === 0;
    if (initial) set({ conversationsStatus: "loading", conversationsError: null });
    try {
      const result = await listConversations();
      set({ conversations: result.conversations, conversationsStatus: "ready", conversationsError: null });
      void mapPool(result.conversations, 3, (conversation) => get().loadPreview(conversation.id));
    } catch (error) {
      set({ conversationsStatus: "error", conversationsError: errorMessage(error) });
    }
  },
  loadPreview: async (conversationId) => {
    try {
      const page = await listMessages(conversationId, { limit: 1 });
      const latest = page.messages[0];
      if (!latest) return;
      set((state) => ({
        previews: { ...state.previews, [conversationId]: { label: previewLabel(latest), at: latest.createdAt } },
      }));
    } catch {
      // A missing preview should not block the conversation list.
    }
  },
  loadMessages: async (conversationId, mode) => {
    const current = get().threads[conversationId] ?? emptyThread();
    if (mode === "older") {
      if (!current.nextCursor || current.loadingOlder) return;
      set((state) => ({ threads: { ...state.threads, [conversationId]: { ...current, loadingOlder: true, error: null } } }));
      try {
        const page = await listMessages(conversationId, { cursor: current.nextCursor, limit: 30 });
        set((state) => {
          const latest = state.threads[conversationId] ?? current;
          return {
            threads: {
              ...state.threads,
              [conversationId]: {
                ...latest,
                items: mergeMessages(latest.items, page.messages),
                nextCursor: page.nextCursor,
                loadingOlder: false,
                status: "ready",
                error: null,
              },
            },
          };
        });
      } catch (error) {
        const latest = get().threads[conversationId] ?? current;
        set((state) => ({
          threads: { ...state.threads, [conversationId]: { ...latest, loadingOlder: false, error: errorMessage(error) } },
        }));
      }
      return;
    }

    if (current.status !== "ready") {
      set((state) => ({ threads: { ...state.threads, [conversationId]: { ...current, status: "loading", error: null } } }));
    }
    try {
      const page = await listMessages(conversationId, { limit: 30 });
      set((state) => {
        const latest = state.threads[conversationId] ?? current;
        const ordered = sortMessages(page.messages);
        const newest = ordered.at(-1);
        const keepCursor = latest.items.length > page.messages.length ? latest.nextCursor : page.nextCursor;
        return {
          threads: {
            ...state.threads,
            [conversationId]: {
              items: mergeMessages(latest.items, page.messages),
              nextCursor: keepCursor,
              status: "ready",
              error: null,
              loadingOlder: false,
            },
          },
          previews: newest
            ? {
                ...state.previews,
                [conversationId]: {
                  label: newest.plaintext || newest.attachment ? previewLabel(newest) : state.previews[conversationId]?.label ?? "Encrypted message",
                  at: newest.createdAt,
                },
              }
            : state.previews,
        };
      });
    } catch (error) {
      const latest = get().threads[conversationId] ?? current;
      set((state) => ({
        threads: { ...state.threads, [conversationId]: { ...latest, status: "error", error: errorMessage(error), loadingOlder: false } },
      }));
    }
  },
  upsertMessage: (message) =>
    set((state) => {
      const thread = state.threads[message.conversationId] ?? emptyThread();
      return {
        threads: {
          ...state.threads,
          [message.conversationId]: { ...thread, items: mergeMessages(thread.items, [message]), status: "ready" },
        },
      };
    }),
  removeMessages: (ids) =>
    set((state) => {
      const idSet = new Set(ids);
      const threads: Record<string, ThreadState> = {};
      for (const [conversationId, thread] of Object.entries(state.threads)) {
        threads[conversationId] = { ...thread, items: thread.items.filter((item) => !idSet.has(item.id)) };
      }
      return { threads };
    }),
  applyRealtime: (event) => {
    if (event.type === "connection") {
      set({ connection: event.status, realtimeError: event.status === "online" ? null : get().realtimeError });
      if (event.status === "online") {
        void get().loadConversations();
        const active = get().activeConversationId;
        if (active) void get().loadMessages(active, "latest");
      }
      return;
    }
    if (event.type === "error") {
      set({ realtimeError: event.message });
      return;
    }
    if (event.type === "message") {
      const active = get().activeConversationId === event.conversationId;
      if (!active) {
        set((state) => ({ unread: { ...state.unread, [event.conversationId]: (state.unread[event.conversationId] ?? 0) + 1 } }));
        void get().loadPreview(event.conversationId);
      } else {
        void get().loadMessages(event.conversationId, "latest");
      }
      if (!get().conversations.some((conversation) => conversation.id === event.conversationId)) void get().loadConversations();
      return;
    }
    if (event.type === "delivered" || event.type === "read") {
      set((state) => {
        const threads: Record<string, ThreadState> = {};
        for (const [conversationId, thread] of Object.entries(state.threads)) {
          threads[conversationId] = {
            ...thread,
            items: thread.items.map((item) =>
              item.id === event.messageId
                ? {
                    ...item,
                    deliveredAt: event.deliveredAt,
                    readAt: event.type === "read" ? event.readAt : item.readAt,
                  }
                : item,
            ),
          };
        }
        return { threads };
      });
      return;
    }
    if (event.type === "typing") {
      const key = `${event.conversationId}:${event.userId}`;
      const existing = typingTimers.get(key);
      if (existing) window.clearTimeout(existing);
      set((state) => {
        const current = new Set(state.typing[event.conversationId] ?? []);
        if (event.state === "start") current.add(event.userId);
        else current.delete(event.userId);
        return { typing: { ...state.typing, [event.conversationId]: [...current] } };
      });
      if (event.state === "start") {
        typingTimers.set(
          key,
          window.setTimeout(() => {
            set((state) => ({
              typing: {
                ...state.typing,
                [event.conversationId]: (state.typing[event.conversationId] ?? []).filter((userId) => userId !== event.userId),
              },
            }));
          }, 4000),
        );
      }
      return;
    }
    if (event.type === "presence") {
      set((state) => ({ presence: { ...state.presence, [event.userId]: event.status } }));
      return;
    }
    if (event.type === "revoked" && get().device?.deviceId === event.deviceId) {
      set({ device: null, deviceError: "This device was revoked.", connection: "offline" });
    }
  },
}));
