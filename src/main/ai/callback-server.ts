// A one-off server on this computer for a login's redirect: the browser comes
// back to http://127.0.0.1:<port>/callback?code=..., and the provider gets the query.
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import type { CallbackServer } from './types'

const page = `<!doctype html><meta charset="utf-8"><title>Spindle</title>
<p style="font: 16px system-ui; margin: 3em; text-align: center">You can close this tab and go back to Spindle.</p>`

export function callbackServer(timeoutMs = 5 * 60 * 1000): Promise<CallbackServer> {
  let answer!: (q: URLSearchParams) => void
  let fail!: (e: Error) => void
  const code = new Promise<URLSearchParams>((resolve, reject) => {
    answer = resolve
    fail = reject
  })
  // a caller that closes without waiting for the code is fine
  code.catch(() => {})

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (req.method !== 'GET' || url.pathname !== '/callback') {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page)
    answer(url.searchParams)
    close()
  })
  const timer = setTimeout(() => {
    fail(new Error('No answer from the login in time'))
    close()
  }, timeoutMs)
  function close(): void {
    clearTimeout(timer)
    fail(new Error('Closed'))
    server.close()
    server.closeIdleConnections()
  }

  return new Promise((resolve, reject) => {
    server.once('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({ url: `http://127.0.0.1:${port}/callback`, code, close })
    })
  })
}
