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
