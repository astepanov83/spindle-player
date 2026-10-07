// Which rate the audio graph runs at, its FFT size, and the lead for a start
// in a graph of its own.
import { describe, expect, it } from 'vitest'
import { crossLead, fftSizeFor, firstRate, rateFor } from './rate'

describe('the graph’s rate', () => {
  it('follows a song’s own rate', () => {
    expect(rateFor(48000, firstRate)).toBe(48000)
    expect(rateFor(96000, 48000)).toBe(96000)
    expect(rateFor(44100, 44100)).toBe(44100)
  })

  it('stays as it is for a song with no rate, or one Web Audio can’t run at', () => {
    expect(rateFor(undefined, 96000)).toBe(96000)
    expect(rateFor(0, 48000)).toBe(48000)
    expect(rateFor(2000, 44100)).toBe(44100)
    expect(rateFor(1_000_000, 44100)).toBe(44100)
    expect(rateFor(44100.5, 48000)).toBe(48000)
  })
})

describe('the analyser’s FFT size', () => {
  it('keeps about as many bins per Hz at any rate', () => {
    expect(fftSizeFor(44100)).toBe(4096)
    expect(fftSizeFor(48000)).toBe(4096)
    expect(fftSizeFor(88200)).toBe(8192)
    expect(fftSizeFor(96000)).toBe(8192)
    expect(fftSizeFor(192000)).toBe(16384)
    expect(fftSizeFor(22050)).toBe(2048)
    expect(fftSizeFor(768000)).toBe(32768)
    expect(fftSizeFor(3000)).toBe(512)
  })
})

describe('the lead into a graph of its own', () => {
  it('is what play() takes, plus how much longer the new graph takes than the old', () => {
    expect(crossLead(0.005, 0.02, 0.02)).toBeCloseTo(0.005)
    expect(crossLead(0.005, 0.01, 0.03)).toBeCloseTo(0.025)
    // the new graph is quicker: it starts after the end
    expect(crossLead(0.005, 0.04, 0.01)).toBeCloseTo(-0.025)
    expect(crossLead(0.2, 0, 0)).toBe(0.1)
    expect(crossLead(0, 0.3, 0)).toBe(-0.1)
  })
})
