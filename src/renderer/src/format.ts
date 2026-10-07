// 125 -> "2:05"
export function fmtTime(s: number): string {
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0')
}

// The time listened to a station: 754 -> "12:34", 4360 -> "1:12:40"
export function fmtClock(s: number): string {
  s = Math.max(0, s)
  const h = Math.floor(s / 3600)
  if (!h) return fmtTime(s)
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  return `${h}:${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

// The length of a list: 125 -> "2 min", 18440 -> "5 h 7 min". A few seconds
// is "under a minute": "0 min" reads as nothing, "1 min" as more than it is.
export function fmtLength(s: number): string {
  if (s > 0 && s < 60) return 'under a minute'
  const m = Math.round(Math.max(0, s) / 60)
  const h = Math.floor(m / 60)
  if (!h) return `${m} min`
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
}

// 1 -> "1 album", 12000 -> "12,000 albums"
export function fmtCount(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}
