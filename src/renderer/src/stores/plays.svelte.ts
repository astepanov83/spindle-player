// Every song's play count and when it was last played (ticket 085). Main
// keeps them in plays.json; this copy is for sorting and the Songs table.
// A play is counted here and in main by the same rule (shared/plays.ts).
import type { IdMoves } from '../../../shared/id-moves'
import { addPlay, countsPlays, movePlays, type Play, type Plays } from '../../../shared/plays'
import type { PluginId } from '../../../shared/plugins'
import type { ItemKey } from '../../../shared/plugins/items'
import { PlayCounter } from '../library/plays'

class PlaysStore {
  // a new object on every play, so what sorts by it sorts again
  all: Plays = $state.raw({})

  #counter = new PlayCounter((key) => this.#played(key))

  load(plays: Plays): void {
    this.all = plays
  }

  of(key: ItemKey): Play | undefined {
    return this.all[key]
  }

  // What the player shows now (App.svelte feeds it). Only the track queue's
  // songs of plugins that count plays: radio and MFP are left out.
  hear(key: ItemKey | undefined, pos: number, duration: number, sounding: boolean): void {
    this.#counter.hear(countsPlays(key) ? key : undefined, pos, duration, sounding, Date.now())
  }

  #played(key: ItemKey): void {
    this.all = addPlay(this.all, key, Date.now())
    window.playbackApi.played(key)
  }

  // Songs whose ids changed (see id-moves.ts); main moves its own copy.
  moveIds(plugin: PluginId, moves: IdMoves): void {
    this.all = movePlays(this.all, plugin, moves)
  }
}

export const plays = new PlaysStore()
