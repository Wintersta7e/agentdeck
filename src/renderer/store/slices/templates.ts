import type { StateCreator } from 'zustand'
import type { AppState } from '../appStore'
import type { LegacyTemplate as Template, Role } from '../../../shared/types'

export interface TemplatesSlice {
  templates: Template[]
  setTemplates: (templates: Template[]) => void
  roles: Role[]
  setRoles: (roles: Role[]) => void
}

export const createTemplatesSlice: StateCreator<AppState, [], [], TemplatesSlice> = (set) => ({
  templates: [],
  setTemplates: (templates) => set({ templates }),

  roles: [],
  setRoles: (roles) => set({ roles }),
})
