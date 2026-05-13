import { lazy, Suspense } from 'react'
import { SessionsScreen } from './screens/SessionsScreen/SessionsScreen'
import { NewSessionScreen } from './screens/NewSessionScreen/NewSessionScreen'
import { DiffReviewScreen } from './screens/DiffReviewScreen/DiffReviewScreen'
import { AgentsScreen } from './screens/AgentsScreen/AgentsScreen'
import { AlertsScreen } from './screens/AlertsScreen/AlertsScreen'
import { AppSettingsScreen } from './screens/AppSettingsScreen/AppSettingsScreen'
import { WorkflowsScreen } from './screens/WorkflowsScreen/WorkflowsScreen'
import { ProjectsScreen } from './screens/ProjectsScreen/ProjectsScreen'
import { HistoryScreen } from './screens/HistoryScreen/HistoryScreen'
import { HomeScreen } from './components/HomeScreen/HomeScreen'
import { PlaceholderScreen } from './components/PlaceholderScreen/PlaceholderScreen'
import { useAppStore } from './store/appStore'
import type { AgentConfig, Project } from '../shared/types'

const WorkflowEditor = lazy(() => import('./screens/WorkflowEditor/WorkflowEditor'))
const ProjectSettings = lazy(() =>
  import('./components/ProjectSettings/ProjectSettings').then((m) => ({
    default: m.ProjectSettings,
  })),
)
const NewProjectWizard = lazy(() =>
  import('./components/NewProjectWizard/NewProjectWizard').then((m) => ({
    default: m.NewProjectWizard,
  })),
)
const TemplateEditor = lazy(() =>
  import('./components/TemplateEditor/TemplateEditor').then((m) => ({
    default: m.TemplateEditor,
  })),
)

interface AppRoutesProps {
  onOpenProject: (project: Project) => void
  onOpenProjectWithAgent: (project: Project, agentConfig: AgentConfig) => void
}

export function AppRoutes({
  onOpenProject,
  onOpenProjectWithAgent,
}: AppRoutesProps): React.JSX.Element {
  const currentView = useAppStore((s) => s.currentView)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const activeWorkflowId = useAppStore((s) => s.activeWorkflowId)
  const settingsProjectId = useAppStore((s) => s.settingsProjectId)

  return (
    <>
      {currentView === 'home' && (
        <HomeScreen onOpenProject={onOpenProject} onOpenProjectWithAgent={onOpenProjectWithAgent} />
      )}
      {currentView === 'sessions' && !activeSessionId && <SessionsScreen />}
      {currentView === 'projects' && (
        <ProjectsScreen
          onOpenProject={onOpenProject}
          onOpenProjectWithAgent={onOpenProjectWithAgent}
        />
      )}
      {currentView === 'project-detail' && (
        <PlaceholderScreen
          phase="Phase 3.5"
          title="Project Detail"
          subtitle="Single-project overview with sessions, settings entry point, and recent activity."
        />
      )}
      {currentView === 'agents' && <AgentsScreen />}
      {currentView === 'workflows' && !activeWorkflowId && <WorkflowsScreen />}
      {currentView === 'history' && <HistoryScreen />}
      {currentView === 'alerts' && <AlertsScreen />}
      {currentView === 'app-settings' && <AppSettingsScreen />}
      {currentView === 'new-session' && <NewSessionScreen />}
      {currentView === 'diff' && <DiffReviewScreen />}
      <Suspense fallback={<div className="suspense-spinner" />}>
        {currentView === 'wizard' && <NewProjectWizard onCreateProject={onOpenProject} />}
        {currentView === 'settings' && <ProjectSettings key={settingsProjectId} />}
        {currentView === 'template-editor' && <TemplateEditor />}
        {(currentView === 'workflow' || (currentView === 'workflows' && activeWorkflowId)) &&
          activeWorkflowId && (
            <WorkflowEditor key={activeWorkflowId} workflowId={activeWorkflowId} />
          )}
      </Suspense>
    </>
  )
}
