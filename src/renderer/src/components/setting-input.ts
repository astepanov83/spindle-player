// Small rules of the text and choice views in SettingBlocks.svelte, kept
// here so they can be tested without a page.

// The text to send when a box is left or Enter is pressed, or undefined when
// there is nothing new: the draft is what is shown, `known` is what the block
// had or what was sent last.
export function textToSend(draft: string | undefined, known: string): string | undefined {
  return draft === undefined || draft === known ? undefined : draft
}

// A native option holds only text, so the note goes after the label.
export const optionText = (o: { label: string; note?: string }): string =>
  o.note ? `${o.label} - ${o.note}` : o.label
