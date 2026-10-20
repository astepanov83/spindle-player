import { describe, expect, it } from 'vitest'
import { browserAgent, isWebPage, StreamAgents } from './stream-agents'

describe('stream User-Agents', () => {
  it('looks like the Chrome that Electron is built on, on this system', () => {
    expect(browserAgent('140.0.7339.80', 'linux')).toBe(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
    )
    expect(browserAgent('141.0.1', 'win32')).toContain('(Windows NT 10.0; Win64; x64)')
    expect(browserAgent('141.0.1', 'win32')).toContain('Chrome/141.0.0.0')
    // never "spindle": SomaFM sends those its outage message
    expect(browserAgent('140.0', 'linux').toLowerCase()).not.toContain('spindle')
  })

  it('knows a web page from a stream', () => {
    expect(isWebPage('text/html')).toBe(true)
    expect(isWebPage('text/html; charset=utf-8')).toBe(true)
    for (const t of ['audio/mpeg', 'audio/aac', null, undefined, ''])
      expect(isWebPage(t)).toBe(false)
  })

  it('tries the browser first, and Spindle first on a server that wanted it', () => {
    const a = new StreamAgents('B', 'S')
    expect(a.forUrl('http://v1.example:8000/')).toEqual(['B', 'S'])
    a.worked('http://v1.example:8000/', 'S')
    expect(a.forUrl('http://v1.example:8000/;stream')).toEqual(['S', 'B'])
    expect(a.forUrl('http://v1.example:8001/')).toEqual(['B', 'S'])
    a.worked('http://v1.example:8000/', 'B')
    expect(a.forUrl('http://v1.example:8000/')).toEqual(['B', 'S'])
  })
})
