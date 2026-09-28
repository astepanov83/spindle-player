// A message channel the page subscribes to late. A value that comes before the
// page listens is kept for it, so a scan that ends early is not lost. Once the
// page listens, nothing is kept, since a library can be tens of MB. With
// `merge`, early values are joined instead of the last one replacing the rest.
// Plain TS (no ipcRenderer), so it is tested.
export function keepEarly<T>(
  listen: (onValue: (value: T) => void) => void,
  merge?: (early: T, next: T) => T
): (listener: (value: T) => void) => () => void {
  let early: { value: T } | undefined
  const listeners = new Set<(value: T) => void>()
  listen((value) => {
    if (!listeners.size) early = { value: early && merge ? merge(early.value, value) : value }
    for (const l of listeners) l(value)
  })
  return (listener) => {
    listeners.add(listener)
    if (early) listener(early.value)
    early = undefined
    return () => void listeners.delete(listener)
  }
}
