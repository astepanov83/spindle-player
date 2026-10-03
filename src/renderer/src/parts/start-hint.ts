// What the player says under "Nothing playing", and whether it offers Settings.
export function startHint(o: { anyPluginOn: boolean; hasLibrary: boolean }): {
  text: string
  settings: boolean
} {
  // with every plugin off there is nothing to pick from
  if (!o.anyPluginOn) return { text: 'Turn on a plugin in Settings', settings: true }
  // Focus has no library to pick from
  if (!o.hasLibrary) return { text: 'Switch to Studio or Classic to pick music', settings: true }
  return { text: 'Pick an album or a song to start', settings: false }
}
