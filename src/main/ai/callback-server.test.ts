import { describe, expect, it } from 'vitest'
import { callbackServer } from './callback-server'

describe('callbackServer', () => {
  it('gives the query of one request to /callback, then closes', async () => {
    const s = await callbackServer()
    expect(s.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/)
    expect((await fetch(s.url.replace('/callback', '/other'))).status).toBe(404)
    const res = await fetch(`${s.url}?code=abc&state=x`)
    expect(await res.text()).toContain('You can close this tab')
    const q = await s.code
    expect(q.get('code')).toBe('abc')
    expect(q.get('state')).toBe('x')
    await expect(fetch(s.url)).rejects.toThrow()
  })

  it('stops waiting when closed or after the time is up', async () => {
    const closed = await callbackServer()
    closed.close()
    await expect(closed.code).rejects.toThrow('Closed')
    const late = await callbackServer(10)
    await expect(late.code).rejects.toThrow('in time')
    await expect(fetch(late.url)).rejects.toThrow()
  })
})
