import { create } from 'zustand'
import type { OfficeSnapshot } from '../../../shared/office-types'

interface OfficeStoreState {
  snapshot: OfficeSnapshot | null
  theme: string | null
  setSnapshot(snap: OfficeSnapshot): void
  setTheme(name: string): void
}

export const useOfficeStore = create<OfficeStoreState>((set) => ({
  snapshot: null,
  theme: null,
  setSnapshot: (snap) => set({ snapshot: snap }),
  setTheme: (name) => set({ theme: name }),
}))
