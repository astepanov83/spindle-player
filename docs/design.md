# Design notes

## Parts, containers, slots

The window is built from three kinds of things.

**Parts** are what you see: `library`, `nowplaying`, `controls`, `queue`. A part does not know where it sits. It reads the shared state and renders itself.

**Containers** decide how a part is shown:

- Pane: always visible
- Tabs: several parts share one spot
- Drawer: hidden until opened

**Slots** are named places where containers can put buttons. Every player style must render the `player.buttons` slot.

A container that can hide a part owns its toggle button and puts it into a slot. The part never asks for it.

| Queue placement | Toggle |
|---|---|
| Column | none, always visible |
| Tab | the tab strip itself |
| Drawer | a button in `player.buttons` |

So a new player style gets the Drawer button for free, as long as it renders the slot.

## Templates

A template is plain data. One function reads it and places the parts.

```js
classic: {
  name: "Classic",
  window: { width: 1100, height: 680, minWidth: 860, minHeight: 560 },
  queueOptions: ["drawer", "col"],
  layout: { col: [
    { row: [
      { part: "library", opts: { nav: "sidebar" }, size: "1fr" },
      { queueColumn: "330px" }
    ], size: "1fr", drawerHost: true },
    { part: "controls", opts: { style: "bar" }, size: "96px" }
  ]}
}
```

- `queue: { with, label }` becomes Tabs when the queue setting is Tab, otherwise just `with`.
- `queueColumn` only appears when the queue setting is Column.
- `drawerHost` marks where the Drawer slides in.
- `queueOptions` lists what the settings screen offers for this template.

Settings only store choices:

```js
settings = { template: "studio", queue: { studio: "tab", classic: "drawer" }, visualizer: "ring" }
```

## Library styles

The library is two choices: how you move around it, and how items are shown.

- Navigation: chips on top, sidebar, folder tree, column browser
- View: cover grid, plain list, sortable table

## Player styles

`panel`, `bar`, `full`. They all use the same pieces: cover with visualizer, title, seek bar, transport, volume, and the `player.buttons` slot.

## Visualizer

Ported from webmusicmo: 56 log-spaced bands from 45 Hz to 14.5 kHz, instant attack, slow release (0.86 per frame), peak caps that hold and then fall. Bass drives a glow around the cover.

Each style is one draw function over the same levels, so adding a style means adding one function.

## Window size per template

The page cannot resize its own window. On a template switch the renderer asks the main process over IPC:

```js
ipcMain.on('apply-template', (e, { width, height, minWidth, minHeight }) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (win.isMaximized()) win.unmaximize()
  win.setMinimumSize(minWidth, minHeight)
  win.setSize(width, height, true)
})
```

Plan: remember the last size the user chose for each template, and fall back to the template size the first time.

## Keyboard

Every key is decided in `src/renderer/src/keys.ts` (plain functions with tests); `App.svelte` runs what they return. The keys below are a list there (`shortcuts`) that `keyAction` reads, and Settings, Keyboard draws its table from the same list, so the table can't drift from what the keys do.

| Key | Does |
|---|---|
| Space | play / pause, from anywhere but a text field |
| ← / → | seek 5 s |
| ↑ / ↓ | volume 5% |
| M | mute / unmute (the volume stays where it was) |
| Ctrl+← / Ctrl+→ | previous / next song |
| Ctrl+F, / | focus the search box and select its text |
| Alt+← / Alt+→, Backspace | Back / Forward through the library's history, the same as the mouse side buttons and the ‹ › buttons |
| Ctrl+, | open or close Settings |
| ? | open Settings on Keyboard (this list); again closes it |
| Esc | close the menu, then Settings, then the queue drawer; in the search box: clear, then leave |
| V | next visualizer style |
| Q | switch to the queue tab, or open / close the drawer |

- A text field keeps its keys. Only Ctrl+F and Ctrl+, work there.
- Ctrl+F and Ctrl+, go by the key's place, so they work on any keyboard layout.
- A held arrow keeps seeking; a held Backspace or Alt+← goes back once.
- While a menu is open, it gets every key but Esc.

Lists (song table, queue, album page, search results songs, radio stations) are one Tab stop. Inside a list:

| Key | Does |
|---|---|
| ↑ / ↓ | previous / next row |
| Page Up / Page Down | a screen of rows |
| Home / End | first / last row |
| Enter | play the row |
| → / ← | on a station: to its star and back |
| Alt+↑ / Alt+↓ | on a queue row: move the song |
| Delete | on a queue row: remove the song from the queue; on a playlist row: remove it from the playlist. Focus goes to the row that takes its place. The notice offers Undo |

Tab into a list lands on the row last focused, else the playing song, else the first row on screen. A new sort or search forgets the row last focused, since its place now holds another song. When a scroll takes the focused row off the page (the song table and queue draw only the rows near the screen), the focus moves to the nearest row still drawn, so the arrows keep working in the list. Arrows in a list (or on the volume slider) move there, not the song; Shift+arrows seek and set the volume from anywhere.

Settings' segmented choices (Layout, Queue, Visualizer, Theme) are radio groups: one Tab stop each, and the arrows, Home and End pick the next choice. Its switches (plugins, Fix artist names, covers) are buttons with `role="switch"`: Enter or a click flips one, and Space plays and pauses as on any button.

The Now playing / Queue tabs are a tab row: one Tab stop, and ← / →, Home and End pick the next tab. ↑ / ↓ still set the volume there.

The seek bar is a slider: ← / ↓ and → / ↑ move 5 s, Page Up / Page Down 30 s, Home / End go to the start and end.

Focus:

- The focus mark is a 2px ring in `--focus`, the album accent `--c2`, with a 2px band of `--bg` on each side. So the ring only ever touches `--bg`, and the accent is fitted to at least 3:1 on `--bg` in both themes. That holds on any ground: a tint, a tab strip, the playing row's own tint. Most controls draw the ring as an outline 2px outside, with the bands as a shadow under it. List rows draw all three bands inside the row, since the scroll box would cut them off outside. The search box draws them around the box.
- In a menu, the focused item gets the same fill as a hovered one.
- Settings takes the focus when it opens (its × button) and gives it back to the gear when it closes. The drawer gives it to the queue button when it closes with focus inside. A menu gives it back to what opened it.
- The title bar's gear is the first Tab stop. The minimize, maximize and close buttons are left out of Tab order; the window manager has keys for them.
