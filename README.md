# Spindle

A desktop music player for local files, built with Electron.

The window takes its colors from the album cover, a visualizer plays around the cover, and the layout comes from a template you choose in settings.

## Status

Design stage. There is no app code yet, only a clickable prototype.

## Prototype

Open `prototype/index.html` in a browser. It has no build step and no dependencies.

- Three layout templates: **Studio**, **Classic** and **Focus**
- Queue placement per template: Tab, Drawer or Column
- Visualizer styles: Ring, Spectrum, Wave, Off
- "Play a song from your computer" runs the visualizer on real sound
- "Show parts" outlines each part, container and button slot

The albums are made up and the covers are generated.

## Design notes

See [docs/design.md](docs/design.md) for how templates, parts and slots fit together.
