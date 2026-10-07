// What is shown in Settings: data again, drawn by the core
// (components/SettingBlocks.svelte). Plugins build blocks in the page, and
// the AI service builds a provider's blocks in main. Spec "Setting blocks".
export type SettingBlock =
  // a small heading over the blocks of a section
  | { kind: 'title'; text: string }
  // a line of text; `busy`: with a spinner; `error`: in the error color
  | { kind: 'status'; text: string; busy?: boolean; error?: boolean }
  // `remove` is the button's label on each row; `confirm`, when there, asks
  // first with that label. `paths`: the titles are paths, cut in the middle.
  // act: `remove` with the row's id.
  | {
      kind: 'list'
      id: string
      rows: { id: string; title: string; note?: string }[]
      remove?: string
      confirm?: string
      paths?: boolean
      disabled?: boolean
    }
  // buttons side by side when they follow each other. act: `press`
  | { kind: 'button'; id: string; label: string; disabled?: boolean }
  // `about`: a line of help under the label. act: `set` with 'true' or 'false'
  | { kind: 'switch'; id: string; label: string; on: boolean; about?: string }
  // One line of text. act: `set` with the text, on Enter or when the box loses
  // focus with a new value. `secret`: a password box, and the page never gets
  // the value; `saved` says one is stored, and the box gives way to "Saved"
  // with Remove (act `remove`) and Change (no act: shows the empty box).
  | {
      kind: 'text'
      id: string
      label: string
      value?: string
      placeholder?: string
      secret?: boolean
      saved?: boolean
      disabled?: boolean
    }
  // A dropdown. act: `set` with the option's id. `note` shows after the label.
  | {
      kind: 'choice'
      id: string
      label: string
      value: string
      options: { id: string; label: string; note?: string }[]
      disabled?: boolean
    }
  // A plugin's place for a task: the core draws the task's switch here, and
  // while it is on, the AI setup blocks under it, then `blocks`: the task's
  // own lines and buttons from the plugin. All in one box, so it reads as a
  // part of the plugin.
  | { kind: 'ai'; task: string; blocks?: SettingBlock[] }
