'use client'

import { create } from 'zustand'

interface UnreadStore {
  totalUnread: number
  setTotalUnread: (count: number) => void
  increment: () => void
}

export const useUnreadStore = create<UnreadStore>((set) => ({
  totalUnread: 0,
  setTotalUnread: (count) => set({ totalUnread: count }),
  increment: () => set((s) => ({ totalUnread: s.totalUnread + 1 })),
}))
