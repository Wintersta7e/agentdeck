import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'

const REFRESH_MS = 30_000

export function useGitStatus(projectId: string): void {
  const setGitStatus = useAppStore((s) => s.setGitStatus)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetch(): Promise<void> {
      try {
        const status = await window.agentDeck.home.gitStatus(projectId)
        if (!cancelled) setGitStatus(projectId, status)
      } catch {
        // IPC error — silently ignore, git status is best-effort
      }
    }

    void fetch()
    intervalRef.current = setInterval(() => void fetch(), REFRESH_MS)

    return () => {
      cancelled = true
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [projectId, setGitStatus])
}
