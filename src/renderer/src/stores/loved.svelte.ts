// The songs the user loved and when (ticket 117). Main keeps them in
// loved.json; this copy is for the hearts on the bar and the rows, and the
// Loved list. A change is made here at once and sent to main to save.
import type { IdMoves } from '../../../shared/id-moves'
import { canLove, moveLoved, setLoved, type Loved } from '../../../shared/loved'
import type { PluginId } from '../../../shared/plugins'
import type { ItemKey } from '../../../shared/plugins/items'

class LovedStore {
  // a new object on every change, so what reads it reads again
  all: Loved = $state.raw({})

  load(loved: Loved): void {
    this.all = loved
  }

  has(key: ItemKey): boolean {
    return Object.hasOwn(this.all, key)
  }

  // Loves or unloves the songs that can be; the rest are left out. Main
  // hears only of a change.
  set(keys: readonly ItemKey[], on: boolean): void {
    const mine = keys.filter((k) => canLove(k))
    const next = setLoved(this.all, mine, on, Date.now())
    if (next === this.all) return
    this.all = next
    window.lovedApi.set(mine, on)
  }

  // Returns whether the song is loved now.
  toggle(key: ItemKey): boolean {
    const on = !this.has(key)
    this.set([key], on)
    return this.has(key)
  }

  // Songs whose ids changed (see id-moves.ts); main moves its own copy.
  moveIds(plugin: PluginId, moves: IdMoves): void {
    this.all = moveLoved(this.all, plugin, moves)
  }
}

export const loved = new LovedStore()
