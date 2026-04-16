import { create } from 'zustand'
import { createSessionsSlice, type SessionsSlice } from './slices/sessions'
import { createUiSlice, type UiSlice } from './slices/ui'
import { createProjectsSlice, type ProjectsSlice } from './slices/projects'
import { createWorkflowsSlice, type WorkflowsSlice } from './slices/workflows'
import { createTemplatesSlice, type TemplatesSlice } from './slices/templates'
import { createNotificationsSlice, type NotificationsSlice } from './slices/notifications'
import { createHomeSlice, type HomeSlice } from './slices/home'

export type AppState = SessionsSlice &
  UiSlice &
  ProjectsSlice &
  WorkflowsSlice &
  TemplatesSlice &
  NotificationsSlice &
  HomeSlice

export const useAppStore = create<AppState>()((...a) => ({
  ...createSessionsSlice(...a),
  ...createUiSlice(...a),
  ...createProjectsSlice(...a),
  ...createWorkflowsSlice(...a),
  ...createTemplatesSlice(...a),
  ...createNotificationsSlice(...a),
  ...createHomeSlice(...a),
}))
