// The stats page's period and main's answer (ticket 116).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayStats, StatsPeriod } from '../../../shared/plays'

const answer = (period: StatsPeriod, years: number[]): PlayStats => ({
  period,
  years,
  plays: 0,
  seconds: 0,
  songs: 0,
  artists: 0,
  albums: 0,
  topSongs: [],
  topArtists: [],
  topAlbums: [],
  months: [],
  days: [0, 0, 0, 0, 0, 0, 0]
})

let years: number[] = []
const playStats = vi.fn(async (period: StatsPeriod) => answer(period, years))
vi.stubGlobal('window', { playbackApi: { playStats } })

let stats: typeof import('./stats.svelte').stats

beforeEach(async () => {
  vi.resetModules()
  playStats.mockClear()
  stats = (await import('./stats.svelte')).stats
})

describe('the stats store', () => {
  it('starts at this year when the log has plays in it', async () => {
    years = [2026, 2025]
    await stats.load(2026)
    expect(playStats.mock.calls).toEqual([[2026]])
    expect(stats.shown?.period).toBe(2026)
    expect(stats.loading).toBe(false)
  })

  it('starts at all time when this year has none', async () => {
    years = [2025]
    await stats.load(2026)
    expect(playStats.mock.calls).toEqual([[2026], ['all']])
    expect(stats.shown?.period).toBe('all')
  })

  it('keeps the period picked, also with nothing in it', async () => {
    years = [2025]
    stats.pick(2026, 2026)
    await vi.waitFor(() => expect(stats.loading).toBe(false))
    expect(playStats.mock.calls).toEqual([[2026]])
    expect(stats.shown?.period).toBe(2026)
  })

  it('drops an answer a later ask overtook', async () => {
    years = [2026]
    let release: () => void = () => {}
    playStats.mockImplementationOnce(
      (period) => new Promise((done) => (release = () => done(answer(period, years))))
    )
    const first = stats.load(2026)
    stats.pick('all', 2026)
    await vi.waitFor(() => expect(stats.shown?.period).toBe('all'))
    release()
    await first
    expect(stats.shown?.period).toBe('all')
  })

  it('keeps the last answer when main fails', async () => {
    years = [2026]
    await stats.load(2026)
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    playStats.mockRejectedValueOnce(new Error('no'))
    await stats.load(2026)
    expect(stats.shown?.period).toBe(2026)
    expect(stats.loading).toBe(false)
    err.mockRestore()
  })
})
