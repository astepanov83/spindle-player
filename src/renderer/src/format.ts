// 125 -> "2:05"
export function fmtTime(s: number): string {
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0')
}

// The time listened to a station: 754 -> "12:34", 4360 -> "1:12:40"
export function fmtClock(s: number): string {
  const h = Math.floor(s / 3600)
  if (!h) return fmtTime(s)
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  return `${h}:${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}
