import { useCallback, useEffect } from 'react'
import { Titlebar } from './components/Titlebar/Titlebar'
import { Sidebar } from './components/Sidebar/Sidebar'
import { StatusBar } from './components/StatusBar/StatusBar'
import { HomeScreen } from './components/HomeScreen/HomeScreen'
import { SplitView } from './components/SplitView/SplitView'
import { RightPanel } from './components/RightPanel/RightPanel'
import { NewProjectWizard } from './components/NewProjectWizard/NewProjectWizard'
import { ProjectSettings } from './components/ProjectSettings/ProjectSettings'
import { useAppStore } from './store/appStore'
import { useProjects } from './hooks/useProjects'
import type { Project } from '../shared/types'
import './App.css'

export function App(): React.JSX.Element {
  const currentView = useAppStore((s) => s.currentView)
  const addSession = useAppStore((s) => s.addSession)
  const removeSession = useAppStore((s) => s.removeSession)
  const getSessionForProject = useAppStore((s) => s.getSessionForProject)

  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen)

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

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        useAppStore.getState().openWizard()
      }
      if (e.key === 'Escape') {
        const state = useAppStore.getState()
        if (state.currentView === 'wizard') {
          state.closeWizard()
        } else if (state.currentView === 'settings') {
          state.closeSettings()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
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
          <div
            style={{
              display: currentView === 'session' ? 'flex' : 'none',
              flex: 1,
              overflow: 'hidden',
            }}
          >
            <SplitView />
            {rightPanelOpen && <RightPanel />}
          </div>
        </div>
      </div>
      <StatusBar />
    </div>
  )
}
