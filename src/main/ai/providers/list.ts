// The AI providers, best first. The only core file that names them.
import type { Provider } from '../types'
import { FakeProvider } from './fake/provider'

export function createProviders(env: Record<string, string | undefined> = process.env): Provider[] {
  const list: Provider[] = []
  // for tests and app checks only
  if (env.SPINDLE_FAKE_AI === '1') list.push(new FakeProvider())
  return list
}
