// The slider is linear; ears are not. A square curve makes the low half of the slider useful.
export function gain(volume: number): number {
  const v = Math.min(100, Math.max(0, volume)) / 100
  return v * v
}
