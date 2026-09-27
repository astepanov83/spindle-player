import type { Template, TemplateId } from '../layout'
import { studio } from './studio'
import { classic } from './classic'
import { focus } from './focus'

// In the order the settings panel shows them.
export const templates: Record<TemplateId, Template> = { studio, classic, focus }
export const templateIds = Object.keys(templates) as TemplateId[]
