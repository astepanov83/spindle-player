// What the stats page shows (ticket 116): the period picked and main's
// answer for it. Here, not in the page, so it stays while the app runs;
// the period is not saved.
import type { PlayStats, StatsPeriod } from '../../../shared/plays'
import { firstPeriod } from '../library/stats'

class StatsStore {
  // null until one is picked: the page then starts at firstPeriod
  picked: StatsPeriod | null = $state(null)
  // main's last answer; the page keeps showing it while the next one comes
  shown: PlayStats | undefined = $state.raw()
  loading = $state(false)
  #asked = 0

  // The period shown, asked of main. Before one is picked, this year, and
  // all time when the log has nothing this year.
  async load(thisYear: number): Promise<void> {
    const n = ++this.#asked
    this.loading = true
    try {
      let s = await window.playbackApi.playStats(this.picked ?? thisYear)
      if (n !== this.#asked) return
      if (this.picked === null && s.period !== firstPeriod(s.years, thisYear))
        s = await window.playbackApi.playStats(firstPeriod(s.years, thisYear))
      if (n !== this.#asked) return
      this.shown = s
    } catch (error) {
      console.error('Could not read the play stats', error)
    } finally {
      if (n === this.#asked) this.loading = false
    }
  }

  pick(period: StatsPeriod, thisYear: number): void {
    this.picked = period
    void this.load(thisYear)
  }
}

export const stats = new StatsStore()
