// SVG paths on a 24x24 grid, from the prototype.
export const icons = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zm8 0h4v14h-4z',
  stop: 'M6 6h12v12H6z',
  star: 'M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28z',
  // a saved station
  starOn:
    'M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  radio:
    'M3.24 6.15C2.51 6.43 2 7.17 2 8v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H8.3l8.26-3.34L15.88 1 3.24 6.15zM7 20a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm13-8h-2v-2h-2v2H4V8h16v4z',
  shuffle:
    'M17 3l4 4-4 4V8h-2.6l-3 3.5-1.3-1.5 3.2-3.9c.2-.2.5-.4.8-.4H17V3zM3 7h4c.3 0 .6.2.8.4l8.2 9.6H17v-3l4 4-4 4v-3h-1.5c-.3 0-.6-.1-.8-.4L6.5 9H3V7zm0 10h3.5l2.2-2.6 1.3 1.5-2.5 3c-.2.2-.5.4-.8.4H3v-2.3z',
  prev: 'M6 5h2v14H6zM20 5v14L9.5 12z',
  next: 'M16 5h2v14h-2zM4 5v14l10.5-7z',
  repeat: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z',
  vol: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z',
  viz: 'M3 13h2v7H3zm4-5h2v12H7zm4-4h2v16h-2zm4 7h2v9h-2zm4-3h2v12h-2z',
  // the same bars, crossed out, with a gap each side of the line
  vizOff:
    'M3 13h2v7H3zm4-3.2 2 2V20H7zm4-5.8h2v6.2l-2-2zm0 9.8 2 2V20h-2zm4-2.8h2v3.2l-2-2zm0 6.8 2 2v.2h-2zm4-9.8h2v10.2l-2-2zM3.4 2 22 20.6 20.6 22 2 3.4z',
  queue: 'M3 6h13v2H3zm0 5h13v2H3zm0 5h9v2H3zm14-1V9l5 4z',
  close:
    'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z',
  search:
    'M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  back: 'M15.4 6 9.4 12l6 6-1.4 1.4L6.6 12 14 4.6z',
  forward: 'M8.6 6l6 6-6 6 1.4 1.4 7.4-7.4L10 4.6z',
  note: 'M9 3v10.6A4 4 0 1 0 11 17V7h8V3H9z',
  disc: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 7a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
  person: 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-4 0-8 2-8 5v2h16v-2c0-3-4-5-8-5z',
  folder: 'M3 5h7l2 2h9v12H3z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
  more: 'M5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  list: 'M3 5h14v2H3zm0 6h14v2H3zm0 6h10v2H3zm16-4v6.5a2.5 2.5 0 1 1-2-2.45V11h4v2z',
  // the window buttons: thin lines, drawn at 12px
  minimize: 'M3 10.6h18v2.8H3z',
  maximize: 'M3 3h18v18H3zm2.8 2.8v12.4h12.4V5.8z',
  restore: 'M3 7h14v14H3zm2.8 2.8v8.4h8.4V9.8zM7 3h14v14h-4v-2.8h1.2V5.8H9.8V7H7z',
  winClose: 'M5 3l7 7 7-7 2 2-7 7 7 7-2 2-7-7-7 7-2-2 7-7-7-7z',
  gear: 'M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1c.5.4 1.1.7 1.7 1l.4 2.5h4l.4-2.5c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.4-2-1.6zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z'
} as const

export type IconName = keyof typeof icons
