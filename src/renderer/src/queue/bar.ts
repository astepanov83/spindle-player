// What the player bar draws for the item that plays, from what its plugin
// says it can do (spec "The player bar"). The plugin gives data; Controls.svelte
// (parts/) draws it in the core's style.
import type { ItemKind } from '../../../shared/plugins'
import { chordFor } from '../keys'
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

// The core's heart for a song that can be loved (ticket 117). Its id can't
// be a plugin's: queues.act keeps it for the core.
export const loveId = 'core:love'

export function loveAction(on: boolean): ButtonAction {
  const key = chordFor('love')
  return {
    id: loveId,
    kind: 'button',
    label: 'Love',
    icon: on ? 'heartOn' : 'heart',
    hint: `${on ? 'Loved' : 'Love'} (${key})`,
    on,
    plain: true
  }
}

// The core's sleep timer (ticket 111): a moon that opens the timer's menu,
// with the time left next to it while set ("23m", "song").
export const sleepId = 'core:sleep'

const sleepHint = (text: string): string =>
  text === 'song' || text === 'album' ? `end of this ${text}` : `${text} left`

export function sleepAction(on: boolean, text: string): ButtonAction {
  return {
    id: sleepId,
    kind: 'button',
    label: 'Sleep timer',
    icon: on ? 'moonOn' : 'moon',
    hint: on ? `Sleep timer: ${sleepHint(text)}` : 'Sleep timer',
    on,
    plain: true,
    ...(on && { text })
  }
}

// What the L key did, as the bar may be out of view.
export function loveNotice(on: boolean, title: string | undefined): string {
  const word = on ? 'Loved' : 'Unloved'
  return title ? `${word}: "${title}"` : `${word} the song playing`
}

// `now`: what the plugin says the item can do now, over the playable's.
// `loved`: the song can be loved, and whether it is; none: no heart.
// `sleep`: the sleep timer's moon, whether set and its time left; none: no moon.
export function barOf(
  kind: ItemKind,
  p: { length: number | 'live'; can: Can } | undefined,
  actions: Action[],
  now?: Can,
  loved?: boolean,
  sleep?: { on: boolean; text: string }
): Bar {
  const live = p ? p.length === 'live' : kind === 'live'
  const can = now ?? p?.can ?? (kind === 'live' ? liveCan : trackCan)
  const heart = loved === undefined ? [] : [loveAction(loved)]
  const moon = sleep ? [sleepAction(sleep.on, sleep.text)] : []
  return {
    live,
    seek: !live && can.seek,
    next: can.next,
    previous: can.previous,
    order: kind === 'track',
    // the heart first: next to the song's title on a bar; the moon last, as
    // it is not about the song
    buttons: [...heart, ...actions.filter((a): a is ButtonAction => a.kind === 'button'), ...moon],
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
