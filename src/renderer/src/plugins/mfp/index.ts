// Music For Programming's page half (ticket 061). Its data comes from its
// own half in main (window.mfpApi), not from the music library.
import type { PageHalf } from '../types'
import { complete, songPlayable, songState } from './items'
import { canOpenMfp, keepMfp, mfpPath, mfpTabOf, mfpTabs } from './nav'
import { mfpPage, mfpSearch } from './page'
import { mfpActSetting, mfpSettings } from './settings'
import { mfp } from './store.svelte'

export const mfpHalf: PageHalf = {
  info: songState,
  play: songPlayable,
  tabs: mfpTabs,
  tabOf: mfpTabOf,
  canOpen: canOpenMfp,
  keep: keepMfp,
  path: mfpPath,
  page: mfpPage,
  search: mfpSearch,
  settings: () => mfpSettings(),
  actSetting: mfpActSetting,
  version: () => mfp.revision * 2 + (complete() ? 1 : 0)
}
