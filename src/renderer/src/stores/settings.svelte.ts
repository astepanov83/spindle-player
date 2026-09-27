// In memory for now. Ticket 005 loads and saves it through IPC.
import { defaultSettings, type Settings } from '../../../shared/settings'

export const settings: Settings = $state(defaultSettings())
