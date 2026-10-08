// The column look of an artist's page (ticket 101, blocks/Column.svelte): the
// artist in a 220px column on the left that stays in view, their songs and
// releases on the right. No DOM.

// Under this width of page the column goes back on top, as the sections
// look's head: the right side would be too narrow for its columns.
export const sideMin = 640

export function columnSide(width: number): boolean {
  // not measured yet: beside, so a kept place lands where it was
  return width <= 0 || width >= sideMin
}

// Where the column sticks, from the top of the view. One taller than the
// view sticks by its bottom instead, so all of it can still be read.
export const stickTop = (view: number, column: number): number => Math.min(0, view - column)
