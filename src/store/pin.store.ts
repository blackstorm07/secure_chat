import { create } from "zustand";

interface PinState {
  unlockedId: string | null;
  pendingUnlockId: string | null;
  grant: (conversationId: string) => void;
  consume: (conversationId: string) => void;
  unlock: (conversationId: string) => void;
  lock: () => void;
}

export const usePinStore = create<PinState>((set, get) => ({
  unlockedId: null,
  pendingUnlockId: null,
  grant: (conversationId) => set({ pendingUnlockId: conversationId }),
  consume: (conversationId) => {
    if (get().pendingUnlockId !== conversationId) return;
    set({ unlockedId: conversationId, pendingUnlockId: null });
  },
  unlock: (conversationId) => set({ unlockedId: conversationId, pendingUnlockId: null }),
  lock: () => set({ unlockedId: null }),
}));

export function lockChat(): void {
  usePinStore.getState().lock();
}
