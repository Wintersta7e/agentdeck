import { describe, it, expect } from 'vitest'
import { buildDefaults } from './WorkflowRunDialog'
import type { WorkflowVariable } from '../../../shared/types'

describe('WorkflowRunDialog buildDefaults', () => {
  const projectPath = '/home/rooty/my-project'

  it('prefills a path variable that has no default with the selected project path', () => {
    const vars: WorkflowVariable[] = [{ name: 'TARGET_PATH', label: 'Focus path', type: 'path' }]
    expect(buildDefaults(vars, projectPath)).toEqual({ TARGET_PATH: projectPath })
  })

  it('does not override a path variable that carries an explicit default', () => {
    const vars: WorkflowVariable[] = [
      { name: 'TARGET_PATH', type: 'path', default: '/explicit/dir' },
    ]
    expect(buildDefaults(vars, projectPath)).toEqual({ TARGET_PATH: '/explicit/dir' })
  })

  it('leaves a path variable empty when no project is selected (cwd)', () => {
    const vars: WorkflowVariable[] = [{ name: 'TARGET_PATH', type: 'path' }]
    expect(buildDefaults(vars, undefined)).toEqual({ TARGET_PATH: '' })
  })

  it('never prefills non-path variables with the project path', () => {
    const vars: WorkflowVariable[] = [
      { name: 'TEST_CMD', type: 'string', default: 'npm test' },
      { name: 'BUG_DESC', type: 'text' },
    ]
    expect(buildDefaults(vars, projectPath)).toEqual({ TEST_CMD: 'npm test', BUG_DESC: '' })
  })

  it('treats an empty-string default as no default and prefills the path', () => {
    const vars: WorkflowVariable[] = [{ name: 'SPEC_PATH', type: 'path', default: '' }]
    expect(buildDefaults(vars, projectPath)).toEqual({ SPEC_PATH: projectPath })
  })
})
