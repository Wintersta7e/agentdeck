import type { Template, TemplateCategory } from '../../shared/types'

export const CATEGORY_ORDER: readonly (TemplateCategory | 'Other')[] = [
  'Orient',
  'Review',
  'Fix',
  'Test',
  'Refactor',
  'Debug',
  'Docs',
  'Git',
  'Other',
] as const

export interface TemplateGroup {
  category: string
  templates: Template[]
}

export function groupTemplates(templates: Template[]): TemplateGroup[] {
  const groups = new Map<string, Template[]>()
  for (const t of templates) {
    const key = t.category ?? 'Other'
    const list = groups.get(key)
    if (list) {
      list.push(t)
    } else {
      groups.set(key, [t])
    }
  }
  return CATEGORY_ORDER.filter((c) => groups.has(c)).map((c) => ({
    category: c,
    templates: groups.get(c) ?? [],
  }))
}
