// Where long songs were left (ticket 114). Main keeps them in positions.json;
// this copy lets a song start at its place without asking. A change is made
// here and sent to main to save.
import type { IdMoves } from '../../../shared/id-moves'
import type { PluginId } from '../../../shared/plugins'
import type { ItemKey } from '../../../shared/plugins/items'
import {
  isLong,
  keepsPlace,
  movePositions,
  placeOf,
  setPosition,
  startOf,
  type Positions
} from '../../../shared/positions'

class PositionsStore {
  #all: Positions = {}

  load(all: Positions): void {
    this.#all = all
  }

  // Where a song of `length` seconds starts: a little before its place, or
  // 0 for a short song or one with none.
  startOf(key: ItemKey, length: number | undefined): number {
    return isLong(length) && keepsPlace(key) ? startOf(this.#all[key]) : 0
  }

  // A long song is at `pos`: its place is kept, or forgotten at the start
  // and near the end. Main hears only of a change.
  keep(key: ItemKey, pos: number, length: number): void {
    const place = placeOf(pos, length)
    if (place !== undefined) this.#set(key, place)
  }

  // The song was heard to its end, or the listener started it over.
  forget(key: ItemKey): void {
    this.#set(key, null)
  }

  #set(key: ItemKey, pos: number | null): void {
    const next = setPosition(this.#all, key, pos, Date.now())
    if (next === this.#all) return
    this.#all = next
    window.positionsApi.set(key, pos)
  }

  // Songs whose ids changed (see id-moves.ts); main moves its own copy.
  moveIds(plugin: PluginId, moves: IdMoves): void {
    this.#all = movePositions(this.#all, plugin, moves)
  }
}

export const positions = new PositionsStore()
