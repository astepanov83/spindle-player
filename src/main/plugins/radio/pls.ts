// Reads a PLS playlist file into its entries, in order.

export interface PlsEntry {
  url: string
  title: string
}

export function parsePls(text: string): PlsEntry[] {
  const files = new Map<number, string>()
  const titles = new Map<number, string>()
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    const file = /^File(\d+)$/i.exec(key)
    const title = /^Title(\d+)$/i.exec(key)
    if (file) files.set(Number(file[1]), value)
    else if (title) titles.set(Number(title[1]), value)
  }
  return [...files.keys()]
    .sort((a, b) => a - b)
    .filter((n) => files.get(n))
    .map((n) => ({ url: files.get(n)!, title: titles.get(n) ?? '' }))
}
