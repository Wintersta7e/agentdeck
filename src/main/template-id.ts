import { randomBytes } from 'node:crypto'

export function generateTemplateId(): string {
  return `tmpl-${randomBytes(6).toString('hex')}`
}
