// Small rules of the text and choice views in SettingBlocks.svelte, kept
// here so they can be tested without a page.

// Typed text, with the block's value when it was typed. A draft made on an
// older value is dropped, so a value that main changed shows through.
export type Draft = { text: string; base: string }

export const shownText = (draft: Draft | undefined, value: string): string =>
  draft && draft.base === value ? draft.text : value

// The text to send when a box is left or Enter is pressed, or undefined when
// there is nothing new. `sent` is the last send: while the value has not
// moved since, Enter and then blur send once.
export function textToSend(
  draft: Draft | undefined,
  value: string,
  sent?: Draft
): string | undefined {
  if (!draft || draft.base !== value || draft.text === value) return undefined
  if (sent && sent.base === value && sent.text === draft.text) return undefined
  return draft.text
}

// A native option holds only text, so the note goes after the label.
export const optionText = (o: { label: string; note?: string }): string =>
  o.note ? `${o.label} - ${o.note}` : o.label
