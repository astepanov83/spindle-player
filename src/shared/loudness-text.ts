// A song's loudness curve as the page gets it (ticket 106): one character per
// value, 64 levels, so 32 values are 32 characters in the library JSON
// instead of about 160 as numbers. The library process encodes, the sound
// picture (ticket 107) decodes.

const digits = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const levels = digits.length - 1

// values 0-1; out of range is clamped
export function encodeCurve(values: number[]): string {
  let out = ''
  for (const v of values) out += digits[Math.round(Math.min(1, Math.max(0, v || 0)) * levels)]
  return out
}

// values 0-1 in steps of 1/63; a character that is not a digit reads as 0
export function decodeCurve(text: string): number[] {
  const out: number[] = []
  for (const c of text) out.push(Math.max(0, digits.indexOf(c)) / levels)
  return out
}
