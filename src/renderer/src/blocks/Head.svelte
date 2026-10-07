<!-- A head block: the top of a page, drawn by its look: an album's page with
     a square picture, an artist's with a round one (and the names editor), a
     folder's with none, or a list's title. -->
<script lang="ts">
  import { untrack } from 'svelte'
  import type { PluginId } from '../../../shared/plugins'
  import { canOpenExternal } from '../../../shared/web-link'
  import ArtistPic from '../library/ArtistPic.svelte'
  import ViewHead from '../library/ViewHead.svelte'
  import { openPlaylistMenu, openSongMenu } from '../library/song-menu'
  import Cover from '../ui/Cover.svelte'
  import GoLink from '../ui/GoLink.svelte'
  import Icon from '../ui/Icon.svelte'
  import { actOnPage, openFrom, openPage } from '../plugins'
  import type { HeadBlock, HeadButton, NavKind } from '../plugins/types'
  import { playPage, playState as pagePlayState } from './page-play'

  let {
    block: b,
    tab,
    plugin,
    nav
  }: { block: HeadBlock; tab: string; plugin: PluginId; nav: NavKind } = $props()

  const act = (id: string, value?: string): void => actOnPage(plugin, b.id, id, value)

  // ties the name fields to their list of names
  const uid = $props.id()

  // where the search box is: over the chips, or in Classic's sidebar
  const hint = $derived(
    b.searchHint ? `${b.searchHint} ${nav === 'chips' ? 'above' : 'on the left'}.` : b.hint
  )

  // a link main would not open is not drawn
  const link = $derived(b.link && canOpenExternal(b.link.url) ? b.link : undefined)

  // in the markup it would lose its spaces next to a block
  const dot = ' · '

  type Play = Extract<HeadButton, { play: string }>

  const playState = (p: Play): 'play' | 'pause' | 'resume' =>
    p.play === 'all' ? pagePlayState(p.link, p.songs) : 'play'

  // the names in the editor: one renames, two or more split
  let draft: string[] = $state([])
  const canSave = $derived(!!b.edit?.ok(draft))

  // Starts when editing turns on. Not again while it is on: a scan's patch
  // brings a new block every few seconds.
  let wasEditing = false
  $effect.pre(() => {
    const on = !!b.edit
    if (on && !wasEditing) draft = [...untrack(() => b.edit!.names)]
    wasEditing = on
  })

  const save = (): void => act('save', JSON.stringify(draft))

  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') {
      act('cancel')
      e.stopPropagation()
    }
  }

  function focus(node: HTMLInputElement, on: boolean): void {
    if (!on) return
    node.focus()
    node.select()
    // select() shows the end of a long name; its start reads better
    node.scrollLeft = 0
  }
</script>

{#snippet back()}
  {#if b.back}
    {@const to = b.back.to}
    <button class="back" onclick={() => openFrom(tab, to)}
      ><Icon name="back" size={16} />{b.back.label}</button
    >
  {/if}
{/snippet}

{#snippet line()}
  {#if b.line || link}
    <div class="page-meta">
      {#each b.line ?? [] as p, i (i)}{#if p.to}<GoLink go={() => openPage(p.to!)}>{p.text}</GoLink
          >{:else}{p.text}{/if}{/each}{#if link}{b.line ? dot : ''}<a
          class="site"
          href={link.url}
          target="_blank"
          rel="noreferrer">{link.label}</a
        >{/if}
    </div>
  {/if}
{/snippet}

{#snippet noteItems(n: NonNullable<HeadBlock['note']>)}
  {n.text}
  {#each n.items as t, i (i)}
    {@const a = t.action}
    {#if i > 0}<span class="dot">·</span>{/if}<span>{t.text}</span>
    {#if a}
      <button class="use" aria-label={a.hint} onclick={() => act(a.id, a.value)}>{a.label}</button>
    {/if}
  {/each}
{/snippet}

{#snippet acts()}
  <div class="acts">
    {#if b.edit}
      <button class="pill" disabled={!canSave} onclick={save}>Save</button>
      <button class="pill ghost" onclick={() => act('cancel')}>Cancel</button>
    {:else}
      {#each b.buttons ?? [] as btn, i (i)}
        {#if 'play' in btn}
          <button
            class="pill"
            class:ghost={!btn.primary}
            class:play={btn.play === 'all'}
            disabled={btn.disabled}
            onclick={() => playPage(btn.play, btn.songs, btn.from, btn.link)}
            >{playState(btn) === 'pause' ? 'Pause' : btn.label}</button
          >
        {:else if 'menu' in btn && btn.menu === 'songs'}
          <button
            class="pill ghost more"
            aria-haspopup="menu"
            aria-label="More"
            title={btn.label}
            disabled={btn.disabled}
            onclick={(e) =>
              openSongMenu(e, btn.songs(), {
                from: btn.from,
                link: btn.link,
                actions: btn.actions?.map((a) => ({ label: a.label, run: () => act(a.id) }))
              })}><Icon name="more" size={18} /></button
          >
        {:else if 'menu' in btn}
          <button
            class="pill ghost"
            aria-haspopup="menu"
            disabled={btn.disabled}
            onclick={(e) => openPlaylistMenu(e, btn.songs())}>{btn.label}</button
          >
        {:else}
          <button class="pill ghost" disabled={btn.disabled} onclick={() => act(btn.id)}
            >{btn.label}</button
          >
        {/if}
      {/each}
    {/if}
  </div>
{/snippet}

{#if b.look === 'list'}
  <ViewHead
    title={b.title}
    meta={b.meta}
    count={b.count ?? ''}
    {hint}
    below={b.line ? line : undefined}
  />
{:else if b.look === 'album'}
  {@render back()}
  <div class="albhead">
    <div class="cv"><Cover src={b.art?.src} /></div>
    <div class="words">
      <div class="page-meta" title={b.metaHint}>{b.meta}</div>
      <h2 class="page-title clamp" title={b.title}>{b.title}</h2>
      {@render line()}
      {#if b.note}<div class="page-meta">{@render noteItems(b.note)}</div>{/if}
      {@render acts()}
    </div>
  </div>
{:else if b.look === 'artist'}
  {@render back()}
  <div class="arthead">
    <div class="pic"><ArtistPic photo={b.art?.src} covers={b.art?.covers ?? []} /></div>
    <div class="about">
      <div class="page-meta">{b.meta}</div>
      {#if b.edit}
        {@const e = b.edit}
        <div class="names">
          {#each draft.map((_, i) => i) as i (i)}
            <div class="name-row">
              <input
                class="page-title name"
                aria-label="{e.label} {i + 1}"
                maxlength={e.max}
                bind:value={draft[i]}
                list={e.suggest?.length ? `${uid}-names` : undefined}
                use:focus={i === draft.length - 1}
                {onkeydown}
              />
              {#if draft.length > 1}
                <button
                  class="x"
                  aria-label={e.remove}
                  onclick={() => (draft = draft.filter((_, j) => j !== i))}
                  ><Icon name="close" size={14} /></button
                >
              {/if}
            </div>
          {/each}
          <button class="add" onclick={() => (draft = [...draft, ''])}
            ><Icon name="plus" size={14} />{e.add}</button
          >
          <div class="hint">{e.hint}</div>
          {#if e.suggest?.length}
            <datalist id="{uid}-names">
              {#each e.suggest as n (n)}<option value={n}></option>{/each}
            </datalist>
          {/if}
        </div>
      {:else}
        <h2 class="page-title" title={b.title}>{b.title}</h2>
      {/if}
      {#if b.note}<div class="tags">{@render noteItems(b.note)}</div>{/if}
      {@render line()}
      {@render acts()}
    </div>
  </div>
{:else}
  <div class="foldhead">
    <div class="page-meta">{b.meta}</div>
    <h2 class="page-title clamp" title={b.title}>{b.title}</h2>
    {@render line()}
    {@render acts()}
  </div>
{/if}

<style>
  .back {
    font-size: var(--text-s);
    color: var(--ink-3);
    display: inline-flex;
    gap: 4px;
    align-items: center;
    margin-top: 4px;
  }
  .back:hover {
    color: var(--ink);
  }
  .site {
    color: inherit;
  }
  .site:hover {
    color: var(--ink);
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 16px;
  }

  /* An album's page. The cover stays beside the title at any width, so the
     songs stay in view; it and the title get smaller in a narrow library. */
  .albhead {
    container-type: inline-size;
    display: flex;
    gap: 22px;
    align-items: flex-end;
    padding: 8px 0 22px;
  }
  .cv {
    width: 160px;
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 14px 30px -12px var(--shadow);
    flex: none;
  }
  .words {
    flex: 1;
    min-width: 0;
  }
  @container (max-width: 560px) {
    .albhead .cv {
      width: 112px;
    }
    .albhead .page-title {
      font-size: var(--title-l);
    }
    .albhead .acts {
      margin-top: 12px;
    }
  }
  /* smaller pills, so they stay on one line beside the cover in Studio's
     narrowest library */
  @container (max-width: 480px) {
    .albhead .acts {
      gap: 6px;
    }
    .albhead .acts .pill {
      padding: 7px 12px;
      font-size: var(--text-s);
    }
    .albhead .acts .pill.more {
      padding: 7px 8px;
    }
  }
  @container (max-width: 400px) {
    .albhead .cv {
      width: 88px;
    }
  }
  /* as wide for Pause as for Play, so the pills beside it stay put */
  .play {
    min-width: 5.6em;
  }

  /* An artist's page */
  .arthead {
    display: flex;
    gap: 22px;
    align-items: flex-end;
    padding: 8px 0 22px;
    flex-wrap: wrap;
  }
  .about {
    min-width: 0;
    flex: 1 1 200px;
  }
  .arthead .page-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pic {
    width: 160px;
    aspect-ratio: 1;
    border-radius: 50%;
    box-shadow: 0 14px 30px -12px var(--shadow);
    flex: none;
  }
  .names {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
    margin-bottom: 12px;
  }
  .name-row {
    display: flex;
    gap: 6px;
    align-items: center;
    width: min(100%, 520px);
  }
  .name {
    flex: 1;
    min-width: 0;
    padding: 2px 6px;
    margin-left: -7px;
    color: var(--ink);
    background: var(--field);
    border: 1px solid var(--ring);
    border-radius: 8px;
    outline: none;
    box-shadow: none;
  }
  /* the names list opens as you type; its arrow would sit in the big title */
  .name::-webkit-calendar-picker-indicator {
    display: none !important;
  }
  .x {
    color: var(--ink-3);
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    flex: none;
  }
  .x:hover {
    color: var(--ink);
    background: var(--field);
  }
  .add {
    font-size: var(--text-s);
    color: var(--ink-2);
    display: inline-flex;
    gap: 4px;
    align-items: center;
  }
  .add:hover {
    color: var(--ink);
  }
  .hint {
    font-size: var(--text-xs);
    color: var(--ink-3);
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    column-gap: 5px;
    font-size: var(--text-s);
    color: var(--ink-3);
    margin: 2px 0 4px;
  }
  .use {
    font-size: var(--text-s);
    color: var(--ink-2);
    text-decoration: underline;
  }
  .use:hover {
    color: var(--ink);
  }

  /* A folder's page */
  .foldhead {
    padding: 8px 0 18px;
    margin-top: 4px;
    min-width: 0;
  }
  .foldhead .acts {
    margin-top: 14px;
  }
</style>
