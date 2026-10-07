// The `ai` block of Settings as plain blocks (spec "Settings"): the task's
// switch, and only while it is on, the service choice, what the chosen
// service is (its about line, which says what may cost money), its blocks and
// what the task sends. Kept as data so it is tested without a page.
// Each id says where its act goes, so one list of blocks serves all views.
import type { AiState } from '../../shared/ai'
import type { SettingBlock } from '../../shared/setting-blocks'

export type AiTarget =
  { to: 'task'; task: string } | { to: 'provider-choice' } | { to: 'provider'; id: string }

// A task id or a provider's block id may hold any text, so the task is escaped
// and the block id is the rest.
const prefix = 'ai/'

const aiId = (kind: 'task' | 'choice' | 'block', task: string, id = ''): string =>
  `${prefix}${kind}/${encodeURIComponent(task)}/${id}`

// Where an act on a block made by aiBlocks goes, or undefined for any other id.
export function aiTarget(blockId: string): AiTarget | undefined {
  if (!blockId.startsWith(prefix)) return undefined
  const [kind, task, ...rest] = blockId.slice(prefix.length).split('/')
  if (kind === 'task') return { to: 'task', task: decodeURIComponent(task) }
  if (kind === 'choice') return { to: 'provider-choice' }
  if (kind === 'block') return { to: 'provider', id: rest.join('/') }
  return undefined
}

export function aiBlocks(task: string, state: AiState | undefined): SettingBlock[] {
  const t = state?.tasks[task]
  if (!state || !t) return []
  const out: SettingBlock[] = [
    { kind: 'switch', id: aiId('task', task), label: t.info.name, on: t.on, about: t.info.about }
  ]
  if (!t.on) return out
  if (state.providers.length > 1)
    out.push({
      kind: 'choice',
      id: aiId('choice', task),
      label: 'Service',
      value: state.provider,
      options: state.providers.map((p) => ({ id: p.id, label: p.name }))
    })
  const about = state.providers.find((p) => p.id === state.provider)?.about
  if (about) out.push({ kind: 'status', text: about })
  for (const b of state.blocks) out.push('id' in b ? { ...b, id: aiId('block', task, b.id) } : b)
  if (t.info.sends) out.push({ kind: 'status', text: t.info.sends })
  return out
}
