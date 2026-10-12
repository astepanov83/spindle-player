// The sound outputs Settings offers (ticket 112), from Chromium's device list.

export interface OutputDevice {
  // '' is the system default
  id: string
  name: string
}

// Chromium's own entries that follow the system's choice: "System default"
// is that already.
const followers = ['', 'default', 'communications']

// The output devices, each once, in Chromium's order. A device with no name
// (no permission to see names) is numbered.
export function outputDevices(
  list: Pick<MediaDeviceInfo, 'kind' | 'deviceId' | 'label'>[]
): OutputDevice[] {
  const out: OutputDevice[] = []
  for (const d of list) {
    if (d.kind !== 'audiooutput' || followers.includes(d.deviceId)) continue
    if (out.some((o) => o.id === d.deviceId)) continue
    out.push({ id: d.deviceId, name: d.label.trim() || `Output ${out.length + 1}` })
  }
  return out
}

export const notFoundText = 'Sound output not found, using the default'

// Settings' choices: System default, each device, and the saved device when
// it is not there, so the choice shows and stays.
export function outputChoices(
  devices: OutputDevice[] | null,
  saved: string,
  savedName: string
): OutputDevice[] {
  const out = [{ id: '', name: 'System default' }, ...(devices ?? [])]
  if (saved && !out.some((d) => d.id === saved))
    out.push({ id: saved, name: `${savedName || 'Saved device'} (not connected)` })
  return out
}
