// 125 -> "2:05"
export function fmtTime(s: number): string {
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0')
}
