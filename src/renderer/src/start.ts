// Start-up asks to main. One that fails gives a fallback, so the app still
// shows (with defaults) instead of a blank window.
export async function orFallback<T>(
  ask: () => Promise<T>,
  fallback: T,
  what: string
): Promise<{ value: T; ok: boolean }> {
  try {
    return { value: await ask(), ok: true }
  } catch (e) {
    console.error(`Could not load ${what}; using defaults`, e)
    return { value: fallback, ok: false }
  }
}
