// A name's initials, for small made pictures (ticket 103) and later artists'
// (105): "The Ochre Band" is OB. A name in Japanese, Chinese or Korean gives
// its first sign, since two of them would not fit and words have no spaces.
const cjk = /[぀-ヿ㐀-鿿豈-﫿가-힯]/
// small words that say little about the name
const skip = /^(the|and|of|a|an|&)$/i
const firstLetter = /[\p{L}\p{N}]/u

export function initials(name: string | undefined): string {
  const s = name?.trim() ?? ''
  if (!s) return '♪'
  if (cjk.test(s)) return [...s.replace(/\s+/g, '')][0]
  const words = s.split(/\s+/)
  const kept = words.filter((w) => !skip.test(w))
  const letters = (kept.length ? kept : words)
    .map((w) => w.match(firstLetter)?.[0])
    .filter((c) => c !== undefined)
  return letters.length ? letters.slice(0, 2).join('').toLocaleUpperCase() : [...s][0]
}
