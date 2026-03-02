import { describe, it, expect, beforeEach } from 'vitest'
import { groupTemplates, CATEGORY_ORDER } from './templateUtils'
import { makeTemplate, makeCategorizedTemplates, resetCounter } from '../../__test__/helpers'

beforeEach(() => {
  resetCounter()
})

describe('CATEGORY_ORDER', () => {
  it('has 9 entries (8 categories + Other)', () => {
    expect(CATEGORY_ORDER).toHaveLength(9)
  })

  it('starts with Orient and ends with Other', () => {
    expect(CATEGORY_ORDER[0]).toBe('Orient')
    expect(CATEGORY_ORDER[CATEGORY_ORDER.length - 1]).toBe('Other')
  })
})

describe('groupTemplates', () => {
  it('returns empty array for empty input', () => {
    expect(groupTemplates([])).toEqual([])
  })

  it('groups templates by category', () => {
    const templates = makeCategorizedTemplates(['Fix', 'Fix', 'Test'])
    const groups = groupTemplates(templates)

    expect(groups).toHaveLength(2)
    expect(groups[0]?.category).toBe('Fix')
    expect(groups[0]?.templates).toHaveLength(2)
    expect(groups[1]?.category).toBe('Test')
    expect(groups[1]?.templates).toHaveLength(1)
  })

  it('puts uncategorized templates in Other', () => {
    const templates = [makeTemplate({ category: undefined })]
    const groups = groupTemplates(templates)

    expect(groups).toHaveLength(1)
    expect(groups[0]?.category).toBe('Other')
    expect(groups[0]?.templates).toHaveLength(1)
  })

  it('respects CATEGORY_ORDER', () => {
    // Create templates in reverse order of CATEGORY_ORDER
    const templates = makeCategorizedTemplates(['Git', 'Debug', 'Orient'])
    const groups = groupTemplates(templates)

    const categories = groups.map((g) => g.category)
    expect(categories).toEqual(['Orient', 'Debug', 'Git'])
  })

  it('omits categories with no templates', () => {
    const templates = makeCategorizedTemplates(['Fix'])
    const groups = groupTemplates(templates)

    expect(groups).toHaveLength(1)
    expect(groups[0]?.category).toBe('Fix')
  })

  it('handles all categories simultaneously', () => {
    const templates = makeCategorizedTemplates([
      'Orient',
      'Review',
      'Fix',
      'Test',
      'Refactor',
      'Debug',
      'Docs',
      'Git',
      undefined,
    ])
    const groups = groupTemplates(templates)

    expect(groups).toHaveLength(9)
    const categories = groups.map((g) => g.category)
    expect(categories).toEqual([...CATEGORY_ORDER])
  })

  it('preserves template data within groups', () => {
    const tmpl = makeTemplate({ category: 'Fix', name: 'Fix lint errors', content: 'fix it' })
    const groups = groupTemplates([tmpl])

    expect(groups[0]?.templates[0]?.name).toBe('Fix lint errors')
    expect(groups[0]?.templates[0]?.content).toBe('fix it')
  })
})
