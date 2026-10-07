<!-- Settings, Keyboard: every shortcut, read from the lists in keys.ts that
     keyAction and the lists use, so this can't drift from what the keys do. -->
<script lang="ts">
  import { keyText, listShortcuts, shortcutKeys, shortcuts } from '../keys'

  const uid = $props.id()

  const anywhere = shortcuts.map((s) => ({ keys: shortcutKeys(s), does: s.does }))
  const inList = listShortcuts.map((s) => ({
    keys: [s.keys.map(keyText).join(' / ')],
    does: s.does
  }))
  // the keys that work in a text field, a line's together: "Ctrl+F",
  // "Ctrl+,", "Ctrl+1 / Ctrl+2 / Ctrl+3"
  const inText = shortcuts
    .map((s) => s.chords.filter((c) => c.inText))
    .filter((cs) => cs.length)
    .flatMap((chords) => shortcutKeys({ chords }))
  const groups = [
    { label: 'Anywhere', rows: anywhere },
    { label: 'In a list', rows: inList }
  ]
</script>

{#each groups as g, gi (g.label)}
  <div class="set">
    <span class="section-label" id="{uid}-{gi}">{g.label}</span>
    <table aria-labelledby="{uid}-{gi}">
      <tbody>
        {#each g.rows as r (r.does)}
          <tr>
            <th scope="row">
              {#each r.keys as k, i (k)}{#if i}<span class="or">or</span
                  >{/if}{#each k.split(' / ') as half, j (j)}{#if j}<span class="pair">/</span
                    >{/if}<kbd>{half}</kbd>{/each}{/each}
            </th>
            <td>{r.does}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/each}
<p class="hint">
  A text field keeps its keys: only {#each inText as k, i (k)}{#if i}{i === inText.length - 1
        ? ' and '
        : ', '}{/if}{#each k.split(' / ') as half, j (j)}{#if j}<span class="pair">/</span>{/if}<kbd
        >{half}</kbd
      >{/each}{/each} work there. Inside a list or on a slider the arrows move there; hold Shift to seek
  and set the volume instead. In a song list, Shift+↑ and Shift+↓ select songs, so the volume needs the
  focus out of the list.
</p>

<style>
  .set {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    font-size: var(--text-s);
    border-radius: 10px;
    background: var(--well);
    overflow: hidden;
  }
  tr + tr {
    box-shadow: 0 -1px 0 var(--edge);
  }
  th,
  td {
    padding: 8px 12px;
    text-align: left;
    vertical-align: baseline;
  }
  th {
    width: 42%;
    font-weight: 400;
  }
  td {
    color: var(--ink-2);
    line-height: 1.4;
  }
  kbd {
    display: inline-block;
    padding: 1px 7px;
    border-radius: 6px;
    background: var(--field);
    box-shadow: inset 0 -1px 0 var(--edge);
    font: 500 var(--text-xs) var(--mono);
    color: var(--ink);
  }
  .pair {
    margin: 0 4px;
    color: var(--ink-3);
  }
  .or {
    margin: 0 6px;
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .hint {
    margin: 0;
    font-size: var(--text-s);
    line-height: 1.45;
    color: var(--ink-2);
  }
  /* a narrow window: the keys over what they do */
  @media (max-width: 439px) {
    tr {
      display: flex;
      flex-direction: column;
      padding: 8px 12px;
      gap: 4px;
    }
    th,
    td {
      padding: 0;
      width: auto;
    }
  }
</style>
