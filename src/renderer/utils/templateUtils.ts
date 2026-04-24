import type { LegacyTemplate as Template, TemplateCategory } from '../../shared/types'

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
  // Start with known categories in display order
  const result: TemplateGroup[] = CATEGORY_ORDER.filter((c) => groups.has(c)).map((c) => ({
    category: c,
    templates: groups.get(c) ?? [],
  }))
  // Append any unknown categories so templates are never silently dropped
  for (const [key, tpls] of groups) {
    if (!CATEGORY_ORDER.includes(key as TemplateCategory | 'Other')) {
      result.push({ category: key, templates: tpls })
    }
  }
  return result
}
