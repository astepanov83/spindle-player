// The lists that fill themselves (ticket 118), kept up to date: a new play, a
// heart or a scan makes them again. The rules are in library/smart-lists.ts.
import { createSubscriber } from 'svelte/reactivity'
import type { ItemKey } from '../../../shared/plugins/items'
import { librarySongs } from '../plugins'
import { smartItems, smartLists, type SmartId, type SmartSong } from '../library/smart-lists'
import { loved } from './loved.svelte'
import { plays } from './plays.svelte'

// Time moves the lists too (a favorite turns forgotten, an album is no
// longer new, a new day orders Never played again). Read while something
// shows them, the lists are made again every 10 minutes.
const tickMs = 10 * 60 * 1000
const clock = createSubscriber((update) => {
  const t = setInterval(update, tickMs)
  return () => clearInterval(t)
})

class SmartListsStore {
  // undefined while no plugin that is on gives songs: no lists then
  #songs: readonly SmartSong[] | undefined = $derived(librarySongs())
  #keys = $derived(new Set(this.#songs?.map((s) => s.key)))

  #all = $derived.by((): Record<SmartId, ItemKey[]> => {
    clock()
    const data = { songs: this.#songs ?? [], plays: plays.all, loved: loved.all, now: Date.now() }
    const out = {} as Record<SmartId, ItemKey[]>
    for (const l of smartLists) out[l.id] = smartItems(l.id, data)
    return out
  })

  get shown(): boolean {
    return this.#songs !== undefined
  }

  items(id: SmartId): ItemKey[] {
    return this.#all[id]
  }

  // whether the song is still in the library
  has(key: ItemKey): boolean {
    return this.#keys.has(key)
  }
}

export const smart = new SmartListsStore()
