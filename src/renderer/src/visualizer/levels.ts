// What the draw functions read. Ticket 008 fills these every frame from the
// analyser. Until then they stay at zero, which is the paused look.
export const BANDS = 56
export const WAVE_N = 256

export const levels = new Float32Array(BANDS)
export const peaks = new Float32Array(BANDS)
export const wave = new Float32Array(WAVE_N)
