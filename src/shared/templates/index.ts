import type { Template, TemplateId } from '../layout'
import { studio } from './studio'
import { classic } from './classic'
import { focus } from './focus'
import { mini } from './mini'

// In the order the settings panel shows them.
export const templates: Record<TemplateId, Template> = { studio, classic, focus, mini }
export const templateIds = Object.keys(templates) as TemplateId[]

// The layouts with a title bar, the ones Mini goes back to.
export const bigTemplateIds = templateIds.filter((id) => templates[id].titleBar !== false)
