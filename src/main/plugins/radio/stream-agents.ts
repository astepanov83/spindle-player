// Which User-Agent a station's server gets. A browser's first: some servers
// refuse players they don't know (SomaFM sends every User-Agent with
// "spindle" in it a recorded outage message). A Shoutcast v1 server sends a
// browser its HTML page, not the stream, so then Spindle's own is tried, and
// that server gets it first for the rest of the run.

// The User-Agent of the Chrome that Electron is built on, as Chrome sends it
// (with only the major version).
export function browserAgent(chrome: string, platform: string): string {
  const major = chrome.split('.')[0] || '140'
  const os =
    platform === 'win32'
      ? 'Windows NT 10.0; Win64; x64'
      : platform === 'darwin'
        ? 'Macintosh; Intel Mac OS X 10_15_7'
        : 'X11; Linux x86_64'
  return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
}

// An answer that is a web page: a Shoutcast v1 server's page for browsers.
export function isWebPage(type: string | null | undefined): boolean {
  return (type ?? '').split(';')[0].trim().toLowerCase() === 'text/html'
}

export class StreamAgents {
  // hosts that sent their web page to the browser's User-Agent
  #player = new Set<string>()

  constructor(
    readonly browser: string,
    readonly player: string
  ) {}

  // The User-Agents to try for this address, in order.
  forUrl(url: string): string[] {
    return this.#player.has(hostOf(url)) ? [this.player, this.browser] : [this.browser, this.player]
  }

  // The server sent a stream to this User-Agent.
  worked(url: string, agent: string): void {
    const host = hostOf(url)
    if (agent === this.player) this.#player.add(host)
    else this.#player.delete(host)
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase()
  } catch {
    return url
  }
}
