// What the player bar draws for the item that plays, from what its plugin
// says it can do (spec "The player bar"). The plugin gives data; Controls.svelte
// (parts/) draws it in the core's style.
import type { ItemKind } from '../../../shared/plugins'
import type { Action, Can, LiveStatus } from '../plugins/types'

export type ButtonAction = Extract<Action, { kind: 'button' }>
export type ChoiceAction = Extract<Action, { kind: 'choice' }>

export interface Bar {
  // LIVE and the time listened in place of the seek bar, and Stop in place of Pause
  live: boolean
  // the seek bar and the times
  seek: boolean
  next: boolean
  previous: boolean
  // Shuffle and Repeat: the track queue's
  order: boolean
  buttons: ButtonAction[]
  choices: ChoiceAction[]
}

// Before a song's playable comes (its plugin asks first), the bar looks as
// for any song, so it doesn't jump when it comes. A live item before its
// first connection: no Next or Previous (media keys still ask its plugin).
const trackCan: Can = { seek: true, pause: true, next: true, previous: true }
const liveCan: Can = { seek: false, pause: true, next: false, previous: false }

// `now`: what the plugin says the item can do now, over the playable's.
export function barOf(
  kind: ItemKind,
  p: { length: number | 'live'; can: Can } | undefined,
  actions: Action[],
  now?: Can
): Bar {
  const live = p ? p.length === 'live' : kind === 'live'
  const can = now ?? p?.can ?? (kind === 'live' ? liveCan : trackCan)
  return {
    live,
    seek: !live && can.seek,
    next: can.next,
    previous: can.previous,
    order: kind === 'track',
    buttons: actions.filter((a): a is ButtonAction => a.kind === 'button'),
    choices: actions.filter((a): a is ChoiceAction => a.kind === 'choice')
  }
}

// How a choice shows: a menu button when there is something to pick, plain
// text for one option (room to say what it is), nothing with none.
export type ChoiceView =
  | { kind: 'menu'; text: string; picked: string | undefined }
  | { kind: 'text'; text: string }
  | undefined

// short: the bar's few letters ("320k"); else the picked option's label.
export function choiceView(a: ChoiceAction, short: boolean): ChoiceView {
  const picked = a.options.find((o) => o.id === a.picked)?.label
  if (a.options.length > 1) {
    const text = picked === undefined ? a.label : short ? a.short : picked
    return { kind: 'menu', text, picked }
  }
  return picked ? { kind: 'text', text: picked } : undefined
}

export type LiveWord = LiveStatus['state'] | 'off'

// The word next to the dot; no status is stopped.
export const liveWords: Record<LiveWord, string> = {
  off: 'STOPPED',
  connecting: 'CONNECTING',
  live: 'LIVE',
  buffering: 'BUFFERING',
  reconnecting: 'RECONNECTING'
}

export function liveWord(s: LiveStatus | undefined): LiveWord {
  return s?.state ?? 'off'
}

// The tooltip; a wait counts down with the bar's tick.
export function statusTip(s: LiveStatus | undefined, now: number): string {
  if (!s) return 'Stopped'
  if (s.until === undefined) return s.text
  return `${s.text} in ${Math.max(1, Math.ceil((s.until - now) / 1000))} s`
}
