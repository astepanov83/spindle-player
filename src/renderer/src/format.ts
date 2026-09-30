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

// The length of a list: 125 -> "2 min", 18440 -> "5 h 7 min". A few seconds is "1 min", not "0 min".
export function fmtLength(s: number): string {
  const m = s > 0 ? Math.max(1, Math.round(s / 60)) : 0
  const h = Math.floor(m / 60)
  if (!h) return `${m} min`
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
}
