import { useCallback } from 'react'
import { Titlebar } from './components/Titlebar/Titlebar'
import { Sidebar } from './components/Sidebar/Sidebar'
import { StatusBar } from './components/StatusBar/StatusBar'
import { HomeScreen } from './components/HomeScreen/HomeScreen'
import { TerminalPane } from './components/Terminal/TerminalPane'
import { NewProjectWizard } from './components/NewProjectWizard/NewProjectWizard'
import { ProjectSettings } from './components/ProjectSettings/ProjectSettings'
import { useAppStore } from './store/appStore'
import { useProjects } from './hooks/useProjects'
import type { Project } from '../shared/types'
import './App.css'

export function App(): React.JSX.Element {
  const currentView = useAppStore((s) => s.currentView)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const sessions = useAppStore((s) => s.sessions)
  const addSession = useAppStore((s) => s.addSession)
  const removeSession = useAppStore((s) => s.removeSession)
  const getSessionForProject = useAppStore((s) => s.getSessionForProject)

  const { updateProject } = useProjects()

  const handleOpenProject = useCallback(
    (project: Project) => {
      const existing = getSessionForProject(project.id)
      if (existing) {
        useAppStore.getState().setActiveSession(existing.id)
      } else {
        const sessionId = `session-${project.id}`
        addSession(sessionId, project.id)
      }
      void updateProject({ ...project, lastOpened: Date.now() })
    },
    [addSession, getSessionForProject, updateProject],
  )

  const handleCloseTab = useCallback(
    (sessionId: string) => {
      removeSession(sessionId)
    },
    [removeSession],
  )

  const handleAddTab = useCallback(() => {
    useAppStore.getState().setCurrentView('home')
  }, [])

  return (
    <div className="app">
      <Titlebar onCloseTab={handleCloseTab} onAddTab={handleAddTab} />
      <div className="app-body">
        <Sidebar onOpenProject={handleOpenProject} />
        <div className="app-main">
          {currentView === 'home' && <HomeScreen onOpenProject={handleOpenProject} />}
          {currentView === 'wizard' && <NewProjectWizard onCreateProject={handleOpenProject} />}
          {currentView === 'settings' && <ProjectSettings />}
          {Object.keys(sessions).map((sid) => (
            <div
              key={sid}
              style={{
                flex: 1,
                display: currentView === 'session' && sid === activeSessionId ? 'flex' : 'none',
                overflow: 'hidden',
              }}
            >
              <TerminalPane sessionId={sid} />
            </div>
          ))}
        </div>
      </div>
      <StatusBar />
    </div>
  )
}
