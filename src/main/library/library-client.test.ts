import { describe, expect, it } from 'vitest'
import type { ScanStatus } from '../../shared/library'
import { emptyLibrary, LibraryClient } from './library-client'
import type { WorkerIn } from './types'

// A client with a fake process that is up until `down` is set.
function setup(canScan = true): {
  client: LibraryClient
  events: string[]
  sent: WorkerIn[]
  statuses: ScanStatus[]
  logs: string[]
  proc: { up: boolean }
  scans: () => Extract<WorkerIn, { type: 'scan' }>[]
} {
  const sent: WorkerIn[] = []
  const statuses: ScanStatus[] = []
  const logs: string[] = []
  const proc = { up: true }
  const events: string[] = []
  const client = new LibraryClient({
    post: (m) => {
      if (!proc.up) return false
      sent.push(m)
      events.push(`post ${m.type}`)
      return true
    },
    idsMoved: (moves) => events.push(`files ${JSON.stringify(moves)}`),
    send: (s) => statuses.push(s),
    folders: () => ['/m'],
    canScan,
    log: (t) => logs.push(t)
  })
  const scans = (): Extract<WorkerIn, { type: 'scan' }>[] =>
    sent.filter((m): m is Extract<WorkerIn, { type: 'scan' }> => m.type === 'scan')
  return { client, events, sent, statuses, logs, proc, scans }
}

const bytes = new Uint8Array([1, 2])
const workerStatus = (s: Partial<ScanStatus> = {}): ScanStatus => ({
  folders: ['/m'],
  phase: 'idle',
  done: 0,
  total: 0,
  tracks: 5,
  albums: 1,
  failed: 0,
  missing: [],
  ...s
})

describe('LibraryClient requests', () => {
  it('passes the answer on', async () => {
    const { client, sent } = setup()
    const r = client.ask({ type: 'find-track', id: 'x' })
    const req = (sent[0] as { req: number }).req
    client.onMessage({ type: 'reply', req, media: { path: '/m/a.mp3', duration: 1 } })
    expect((await r).media?.path).toBe('/m/a.mp3')
  })

  it('answers empty at once when there is no process', async () => {
    const { client, proc } = setup()
    proc.up = false
    expect(await client.ask({ type: 'cover-source', hash: 'h' })).toEqual({
      type: 'reply',
      req: 1
    })
  })

  it('answers empty when the process dies first', async () => {
    const { client } = setup()
    const r = client.ask({ type: 'get-library' })
    client.onExit(1, true)
    expect((await r).data).toBeUndefined()
  })

  it('asks for the library again after a restart', async () => {
    const { client, sent } = setup()
    const lib = client.library()
    client.onExit(1, true)
    await Promise.resolve()
    const req = (sent.at(-1) as { req: number }).req
    client.onMessage({ type: 'reply', req, data: bytes })
    expect(await lib).toBe(bytes)
  })

  it('gives an empty library when there is none to be had', async () => {
    const { client, proc } = setup()
    proc.up = false
    expect(await client.library()).toEqual(emptyLibrary())
  })
})

describe('LibraryClient scans', () => {
  it('starts a scan cut short by a crash again, with the folders as they are', () => {
    const { client, scans } = setup()
    client.scan(true)
    expect(scans()).toEqual([{ type: 'scan', id: 1, folders: ['/m'], retryFailed: true }])
    client.onExit(1, true)
    client.onStarted()
    expect(scans()).toHaveLength(2)
    expect(scans()[1]).toEqual(scans()[0])
  })

  it('does not start a scan again that ended', () => {
    const { client, scans } = setup()
    client.scan(false)
    client.onMessage({ type: 'scanned', id: 1 })
    client.onExit(1, true)
    client.onStarted()
    expect(scans()).toHaveLength(1)
  })

  it('keeps waiting for the newest scan, not an older one', () => {
    const { client, scans } = setup()
    client.scan(false)
    client.scan(true)
    // the first one was replaced; its end is not the second one's
    client.onMessage({ type: 'scanned', id: 1 })
    client.onExit(1, true)
    client.onStarted()
    expect(scans().at(-1)).toMatchObject({ id: 2, retryFailed: true })
  })

  it('drops a scan that crashes the process twice, and says the scan failed', () => {
    const { client, scans, statuses, logs } = setup()
    client.scan(false)
    client.onExit(1, true)
    client.onStarted()
    client.onExit(1, true)
    client.onStarted()
    expect(scans()).toHaveLength(2)
    expect(statuses.at(-1)?.scanFailed).toBe(true)
    expect(logs.some((l) => l.includes('twice'))).toBe(true)
    // the new process's status doesn't hide it
    client.onMessage({ type: 'status', status: workerStatus() })
    expect(client.status.scanFailed).toBe(true)
    // a new scan clears it
    client.scan(true)
    client.onMessage({ type: 'status', status: workerStatus({ phase: 'walk' }) })
    expect(client.status.scanFailed).toBeUndefined()
  })

  it('does not start the scan again after the app window closed', () => {
    const { client, sent, scans } = setup()
    client.scan(false)
    client.stop()
    expect(sent.at(-1)).toEqual({ type: 'stop' })
    client.onExit(1, true)
    client.onStarted()
    expect(scans()).toHaveLength(1)
  })

  it('never scans with settings it could not read', () => {
    const { client, scans, logs } = setup(false)
    expect(client.status.settingsUnreadable).toBe(true)
    client.scan(true)
    expect(scans()).toHaveLength(0)
    expect(logs).toHaveLength(1)
  })

  it('does nothing after quitting', () => {
    const { client, statuses, scans } = setup()
    client.scan(false)
    client.quitting()
    client.onExit(0, false)
    client.onStarted()
    expect(statuses).toHaveLength(0)
    expect(scans()).toHaveLength(1)
  })
})

describe('LibraryClient status', () => {
  it('says the library never loaded when the process gives up before a library', () => {
    const { client } = setup()
    client.onExit(1, false)
    expect(client.status.unavailable).toBe('not-loaded')
  })

  it('says the library stopped when the process gives up after a good load', async () => {
    const { client, sent } = setup()
    const lib = client.library()
    client.onMessage({ type: 'reply', req: (sent[0] as { req: number }).req, data: bytes })
    await lib
    client.onExit(1, false)
    expect(client.status.unavailable).toBe('stopped')
  })

  it('counts a library the process pushed as a good load', () => {
    const { client } = setup()
    expect(client.onMessage({ type: 'library', bytes })).toBe(false)
    client.onExit(1, false)
    expect(client.status.unavailable).toBe('stopped')
  })

  it("keeps main's own fields when the process sends its status", () => {
    const { client, statuses } = setup(false)
    client.onMessage({ type: 'status', status: workerStatus({ tracks: 9 }) })
    expect(client.status).toMatchObject({ tracks: 9, settingsUnreadable: true })
    expect(statuses.at(-1)).toBe(client.status)
    expect('unavailable' in client.status).toBe(false)
  })

  it('shows a scan failure the process reports', () => {
    const { client } = setup()
    client.onMessage({ type: 'status', status: workerStatus({ scanFailed: true }) })
    expect(client.status.scanFailed).toBe(true)
  })
})

describe('LibraryClient id moves', () => {
  it('writes the files before it tells the process they are saved', () => {
    const { client, events, sent } = setup()
    expect(client.onMessage({ type: 'ids-moved', moves: { a: 'b' } })).toBe(true)
    expect(events).toEqual(['files {"a":"b"}', 'post ids-saved'])
    expect(sent.at(-1)).toEqual({ type: 'ids-saved', moves: { a: 'b' } })
  })

  it('keeps every map of the run for a restarted process', () => {
    const { client } = setup()
    client.onMessage({ type: 'ids-moved', moves: { a: 'b' } })
    client.onMessage({ type: 'ids-moved', moves: { b: 'c', x: 'y' } })
    expect(client.aliases).toEqual({ a: 'c', b: 'c', x: 'y' })
  })
})
