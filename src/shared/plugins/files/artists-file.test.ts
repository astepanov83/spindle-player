import { describe, expect, it } from 'vitest'
import {
  addAiGroup,
  addAsked,
  aiKeys,
  applyChanges,
  convertOld,
  creditOf,
  knownArtists,
  knownCache,
  noArtists,
  noCache,
  parseArtists,
  parseCache,
  parseOldGroups,
  parseOldOverrides,
  prune,
  pruneCache,
  resolve,
  serializeArtists,
  serializeCache,
  tagSpellings,
  usedKeys,
  yourKeys,
  type ArtistEntry,
  type ArtistsFile,
  type By
} from './artists-file'
import { maxNames } from './artist-edit'

// an artist: tags as [tag, by]
const artist = (name: string, nameBy: By, ...tags: [string, By][]): ArtistEntry => ({
  name,
  nameBy,
  tags: tags.map(([tag, by]) => ({ tag, by }))
})
const file = (...artists: ArtistEntry[]): ArtistsFile => ({ artists })
// the tags as the library has them, by key
const spell =
  (...tags: string[]) =>
  (key: string): string | undefined =>
    tags.find((t) => t.toLowerCase().replace(/\s+/g, '') === key)
const shown = (f: ArtistsFile, aiOn = true): Record<string, unknown> =>
  Object.fromEntries(resolve(f, aiOn))

describe('the file', () => {
  it('reads back what it wrote', () => {
    const f = file(
      artist('Björk', 'you', ['Bjork', 'ai'], ['bjork (live)', 'you']),
      artist('Magogaio', 'you', ['Magogaio/Sadness', 'you']),
      artist('Sadness', 'ai', ['Magogaio/Sadness', 'you'])
    )
    expect(parseArtists(JSON.parse(JSON.stringify(serializeArtists(f))))).toEqual(f)
  })

  it('reads the example from the spec', () => {
    const f = parseArtists({
      version: 1,
      artists: [
        {
          name: 'Björk',
          nameBy: 'you',
          tags: [
            { tag: 'Bjork', by: 'ai' },
            { tag: 'bjork (live)', by: 'you' }
          ]
        },
        { name: 'Кино', nameBy: 'you', tags: [{ tag: 'kino', by: 'you' }] }
      ]
    })
    expect(f.artists.map((a) => a.name)).toEqual(['Björk', 'Кино'])
  })

  it('drops bad entries and cleans names', () => {
    const f = parseArtists({
      version: 1,
      artists: [
        { name: '  Queen ', nameBy: 'you', tags: [{ tag: ' Queen  ', by: 'you' }, { tag: 3 }] },
        { name: 'No who', tags: [{ tag: 'x', by: 'you' }] },
        { name: '   ', nameBy: 'you', tags: [{ tag: 'x', by: 'you' }] },
        {
          name: 'Bad by',
          nameBy: 'you',
          tags: [
            { tag: 'x', by: 'them' },
            { tag: '  ', by: 'ai' }
          ]
        },
        { name: 'No tags', nameBy: 'ai' },
        'Kino'
      ]
    })
    expect(f).toEqual(file(artist('Queen', 'you', ['Queen', 'you'])))
  })

  it('keeps one link per tag key in an artist, yours over the AI', () => {
    const f = parseArtists({
      version: 1,
      artists: [
        {
          name: 'Björk',
          nameBy: 'ai',
          tags: [
            { tag: 'Bjork', by: 'ai' },
            { tag: 'BJORK ', by: 'you' },
            { tag: 'B jork', by: 'ai' }
          ]
        }
      ]
    })
    expect(f).toEqual(file(artist('Björk', 'ai', ['Bjork', 'you'])))
  })

  it('joins two artists with one name key, your spelling first', () => {
    const f = parseArtists({
      version: 1,
      artists: [
        { name: 'bjork', nameBy: 'ai', tags: [{ tag: 'Bjork', by: 'ai' }] },
        { name: 'Bjork', nameBy: 'you', tags: [{ tag: 'bjork!', by: 'you' }] }
      ]
    })
    expect(f).toEqual(file(artist('Bjork', 'you', ['Bjork', 'ai'], ['bjork!', 'you'])))
  })

  it('keeps a few artists per tag at most', () => {
    const artists = Array.from({ length: 30 }, (_, i) => ({
      name: `Band ${i}`,
      nameBy: 'you',
      tags: [{ tag: 'Everyone', by: 'you' }]
    }))
    expect(parseArtists({ version: 1, artists }).artists).toHaveLength(maxNames)
  })

  it('is empty for another version, a wrong shape or no file', () => {
    expect(knownArtists({ version: 2, artists: [] })).toBe(false)
    expect(knownArtists({ version: 1, artists: {} })).toBe(false)
    expect(knownArtists({ version: 1, artists: [] })).toBe(true)
    expect(parseArtists({ version: 2, artists: [artist('A', 'you', ['a', 'you'])] })).toEqual(
      noArtists()
    )
    expect(parseArtists(undefined)).toEqual(noArtists())
  })
})

describe('resolve', () => {
  it('leaves out tags the file does not have', () => {
    expect(shown(noArtists())).toEqual({})
  })

  it('shows a rename, and a tag joined with other spellings', () => {
    const f = file(artist('Björk', 'you', ['Bjork', 'ai'], ['bjork (live)', 'you']))
    expect(shown(f)).toEqual({
      bjork: { names: ['Björk'], byAi: true },
      'bjork(live)': { names: ['Björk'], byAi: false }
    })
  })

  it('shows a split in file order', () => {
    const f = file(
      artist('Sadness', 'you', ['Magogaio/Sadness', 'you']),
      artist('Magogaio', 'you', ['Magogaio/Sadness', 'you'])
    )
    expect(shown(f)).toEqual({
      'magogaio/sadness': { names: ['Sadness', 'Magogaio'], byAi: false }
    })
  })

  it('ignores AI links of a tag that has one by you', () => {
    const f = file(
      artist('Björk', 'ai', ['Bjork', 'ai']),
      artist('Bjork Gudmundsdottir', 'you', ['Bjork', 'you'])
    )
    expect(shown(f)).toEqual({ bjork: { names: ['Bjork Gudmundsdottir'], byAi: false } })
  })

  it('uses no AI links while the task is off', () => {
    const f = file(artist('Björk', 'you', ['Bjork', 'ai'], ['bjork (live)', 'you']))
    expect(shown(f, false)).toEqual({ 'bjork(live)': { names: ['Björk'], byAi: false } })
  })

  it('shows a tag that is its own name by you as written, and its AI links not at all', () => {
    const f = file(artist('Björk', 'ai', ['Bjork', 'ai']), artist('Bjork', 'you', ['Bjork', 'you']))
    expect(shown(f)).toEqual({})
  })

  it('shows a rename that only fixes case', () => {
    const f = file(artist('Bjork', 'you', ['bjork', 'you']))
    expect(shown(f)).toEqual({ bjork: { names: ['Bjork'], byAi: false } })
  })

  it('matches tags by key: case and spaces do not count', () => {
    const f = file(artist('Кино', 'you', ['K I N O', 'you']))
    expect(resolve(f, true).get('kino')).toEqual({ names: ['Кино'], byAi: false })
  })
})

describe('applyChanges', () => {
  const tags = spell('Bjork', 'bjork (live)', 'Magogaio/Sadness', 'Sadness', 'Kino')

  it('renames: a link by you to an artist made with that name', () => {
    const f = noArtists()
    expect(applyChanges(f, { kino: ['Кино'] }, tags)).toBe(true)
    expect(f).toEqual(file(artist('Кино', 'you', ['Kino', 'you'])))
    expect(applyChanges(f, { kino: ['Кино'] }, tags)).toBe(false)
  })

  it('renames an artist: links by you move to the new name, the old artist goes', () => {
    const f = file(artist('Björk', 'you', ['Bjork', 'you'], ['bjork (live)', 'you']))
    applyChanges(f, { bjork: ['Björk G'], 'bjork(live)': ['Björk G'] }, tags)
    expect(f).toEqual(file(artist('Björk G', 'you', ['Bjork', 'you'], ['bjork (live)', 'you'])))
  })

  it('removes the AI links of the tags it changes, and takes over an AI name', () => {
    const f = file(artist('björk', 'ai', ['Bjork', 'ai']))
    applyChanges(f, { bjork: ['Björk'] }, tags)
    expect(f).toEqual(file(artist('Björk', 'you', ['Bjork', 'you'])))
  })

  it('splits in the order typed', () => {
    const f = file(artist('Sadness', 'you', ['Sadness', 'you']))
    applyChanges(f, { 'magogaio/sadness': ['Magogaio', 'Sadness'] }, tags)
    expect(f).toEqual(
      file(
        artist('Magogaio', 'you', ['Magogaio/Sadness', 'you']),
        artist('Sadness', 'you', ['Sadness', 'you'], ['Magogaio/Sadness', 'you'])
      )
    )
    expect(shown(f)['magogaio/sadness']).toEqual({ names: ['Magogaio', 'Sadness'], byAi: false })
  })

  it('renames one part of a split', () => {
    const f = file(
      artist('Magogaio', 'you', ['Magogaio/Sadness', 'you']),
      artist('Sadness', 'you', ['Magogaio/Sadness', 'you'])
    )
    applyChanges(f, { 'magogaio/sadness': ['Magogaio', 'Sadness (UA)'] }, tags)
    expect(f).toEqual(
      file(
        artist('Magogaio', 'you', ['Magogaio/Sadness', 'you']),
        artist('Sadness (UA)', 'you', ['Magogaio/Sadness', 'you'])
      )
    )
  })

  it('Use tag on a link by you saves the tag as its own name', () => {
    const f = file(artist('Кино', 'you', ['Kino', 'you']))
    expect(applyChanges(f, { kino: null }, tags)).toBe(true)
    expect(f).toEqual(file(artist('Kino', 'you', ['Kino', 'you'])))
    expect(shown(f)).toEqual({})
  })

  it('Use tag on an AI link makes it a link by you that a later AI group skips', () => {
    const f = file(artist('Björk', 'ai', ['Bjork', 'ai'], ['bjork (live)', 'ai']))
    applyChanges(f, { bjork: null }, tags)
    expect(f).toEqual(
      file(artist('Björk', 'ai', ['bjork (live)', 'ai']), artist('Bjork', 'you', ['Bjork', 'you']))
    )
    // the tag is yours, so it stays as written; the other joins the name you kept
    addAiGroup(f, ['bjork(live)', 'bjork'], 'Björk', tags)
    expect(f).toEqual(file(artist('Bjork', 'you', ['Bjork', 'you'], ['bjork (live)', 'ai'])))
    expect(shown(f)).toEqual({ 'bjork(live)': { names: ['Bjork'], byAi: true } })
  })

  it('Use tag undoes a rename that only changed case', () => {
    const f = file(artist('BJORK', 'you', ['bjork', 'you']))
    expect(shown(f)).toEqual({ bjork: { names: ['BJORK'], byAi: false } })
    expect(applyChanges(f, { bjork: null }, spell('bjork'))).toBe(true)
    expect(f).toEqual(file(artist('bjork', 'you', ['bjork', 'you'])))
    expect(shown(f)).toEqual({})
  })

  it('a new spelling of a pinned tag name respells that artist', () => {
    // one artist per name key: the tag pinned with Use tag follows the new
    // spelling, so "Kino" now shows as "KINO"
    const f = file(artist('Kino', 'you', ['Kino', 'you']))
    applyChanges(f, { 'kino!': ['KINO'] }, spell('Kino', 'Kino!'))
    expect(f).toEqual(file(artist('KINO', 'you', ['Kino', 'you'], ['Kino!', 'you'])))
    expect(shown(f)).toEqual({
      kino: { names: ['KINO'], byAi: false },
      'kino!': { names: ['KINO'], byAi: false }
    })
  })

  it('a name equal to the tag is the same as Use tag', () => {
    const f = file(artist('Кино', 'you', ['Kino', 'you']))
    applyChanges(f, { kino: ['Kino'] }, tags)
    expect(f).toEqual(file(artist('Kino', 'you', ['Kino', 'you'])))
  })

  it('takes the key as the tag when no album or song has it', () => {
    const f = noArtists()
    applyChanges(f, { gone: ['Gone'] }, tags)
    expect(f).toEqual(file(artist('Gone', 'you', ['gone', 'you'])))
  })

  it('matches a new name to an artist by key, and your new spelling wins', () => {
    const f = file(artist('Björk', 'you', ['Bjork', 'you']))
    applyChanges(f, { 'bjork(live)': ['björk'] }, tags)
    expect(f).toEqual(file(artist('björk', 'you', ['Bjork', 'you'], ['bjork (live)', 'you'])))
  })
})

describe('addAiGroup', () => {
  const tags = spell('Bjork', 'Björk', 'BJORK', 'bjork (live)', 'Beatles', 'The Beatles', 'Kino')

  it('makes a new artist named by the AI', () => {
    const f = noArtists()
    expect(addAiGroup(f, ['bjork', 'björk'], 'Björk', tags)).toBe(true)
    expect(f).toEqual(file(artist('Björk', 'ai', ['Bjork', 'ai'], ['Björk', 'ai'])))
    expect(addAiGroup(f, ['bjork', 'björk'], 'Björk', tags)).toBe(false)
    // a link to its own name shows nothing new, as a group did
    expect(shown(f)).toEqual({
      bjork: { names: ['Björk'], byAi: true },
      björk: { names: ['Björk'], byAi: true }
    })
  })

  it('joins an artist you made and keeps your name', () => {
    const f = file(artist('Björk G', 'you', ['bjork (live)', 'you']))
    addAiGroup(f, ['björkg', 'bjork'], 'Bjork', tags)
    expect(f).toEqual(file(artist('Björk G', 'you', ['bjork (live)', 'you'], ['Bjork', 'ai'])))
  })

  it('skips tags linked by you and never removes your links', () => {
    const f = file(
      artist('Björk', 'you', ['Björk', 'you']),
      artist('Bjork Gudmundsdottir', 'you', ['Bjork', 'you'])
    )
    const before = structuredClone(f)
    addAiGroup(f, ['bjork', 'björk'], 'Bjork', tags)
    expect(f).toEqual(before)
  })

  it('joins an artist a key was linked to by the AI, keeping its name', () => {
    const f = file(artist('Björk', 'ai', ['Bjork', 'ai'], ['Björk', 'ai']))
    addAiGroup(f, ['björk', 'bjork(live)'], 'bjork (live)', tags)
    expect(f).toEqual(
      file(artist('Björk', 'ai', ['Bjork', 'ai'], ['Björk', 'ai'], ['bjork (live)', 'ai']))
    )
  })

  it("makes one artist of two AI artists it joins, under the first one's name", () => {
    const f = file(
      artist('The Beatles', 'ai', ['The Beatles', 'ai'], ['Beatles', 'ai']),
      artist('Bjork', 'ai', ['Bjork', 'ai'], ['BJORK', 'ai'])
    )
    addAiGroup(f, ['beatles', 'bjork'], 'Beatles', tags)
    expect(f).toEqual(
      file(artist('The Beatles', 'ai', ['The Beatles', 'ai'], ['Beatles', 'ai'], ['Bjork', 'ai']))
    )
  })

  it('does not link a name you typed that no album or song has as a tag', () => {
    const f = file(artist('Кино', 'you', ['Kino', 'you']))
    addAiGroup(f, ['кино', 'kino!'], 'Кино', spell('Kino', 'Kino!'))
    expect(f).toEqual(file(artist('Кино', 'you', ['Kino', 'you'], ['Kino!', 'ai'])))
  })

  it('joins the artist with its name when no key touches one', () => {
    const f = file(artist('Björk', 'you', ['bjork (live)', 'you']))
    addAiGroup(f, ['bjork', 'bjork!'], 'Björk', spell('Bjork', 'Bjork!', 'bjork (live)'))
    expect(f).toEqual(
      file(artist('Björk', 'you', ['bjork (live)', 'you'], ['Bjork', 'ai'], ['Bjork!', 'ai']))
    )
  })

  it('does nothing without a name or a key', () => {
    const f = noArtists()
    expect(addAiGroup(f, ['bjork'], '  ', tags)).toBe(false)
    expect(addAiGroup(f, ['Not A Key'], 'Bjork', tags)).toBe(false)
    expect(f).toEqual(noArtists())
  })
})

describe('prune', () => {
  it('drops links to tags gone, then artists with no links left', () => {
    const f = file(
      artist('Björk', 'you', ['Bjork', 'ai'], ['bjork (live)', 'you']),
      artist('Кино', 'you', ['Kino', 'you'])
    )
    expect(prune(f, new Set(['bjork(live)']))).toBe(true)
    expect(f).toEqual(file(artist('Björk', 'you', ['bjork (live)', 'you'])))
    expect(prune(f, new Set(['bjork(live)']))).toBe(false)
  })
})

describe('the cache', () => {
  it('reads back what it wrote, keys only', () => {
    const c = parseCache({ version: 1, asked: ['bjork', 'Not A Key', 7, 'kino'] })
    expect(c).toEqual({ asked: new Set(['bjork', 'kino']) })
    expect(parseCache(JSON.parse(JSON.stringify(serializeCache(c))))).toEqual(c)
  })

  it('is empty for another version or no file', () => {
    expect(knownCache({ version: 2, asked: [] })).toBe(false)
    expect(parseCache({ version: 2, asked: ['a'] })).toEqual(noCache())
    expect(parseCache(undefined)).toEqual(noCache())
  })

  it('adds asked keys and drops ones gone', () => {
    const c = noCache()
    expect(addAsked(c, ['bjork', 'kino', 'Bad Key'])).toBe(true)
    expect(addAsked(c, ['bjork'])).toBe(false)
    expect(pruneCache(c, new Set(['kino']))).toBe(true)
    expect(c.asked).toEqual(new Set(['kino']))
    expect(pruneCache(c, new Set(['kino']))).toBe(false)
  })
})

describe('convertOld', () => {
  it("moves the user's artist-overrides.json and a sample of artist-groups.json", () => {
    // the user's real file
    const overrides = new Map(
      Object.entries({
        'sadness,alongmemories': ['Sadness'],
        'sadness,thelightisfadingaway': ['Sadness'],
        'sadness,dismalimerence': ['Sadness'],
        'magogaio/sadness': ['Magogaio', 'Sadness']
      })
    )
    const groups = {
      groups: new Map(
        Object.entries({
          bjork: 'Björk',
          björk: 'Björk',
          // an override wins
          'magogaio/sadness': 'Magogaio',
          // not in the library any more
          gunsnroses: 'Guns N’ Roses'
        })
      ),
      asked: new Set(['bjork', 'björk', 'magogaio/sadness', 'Not A Key'])
    }
    const tags = spell(
      'Sadness, Along Memories',
      'Sadness, The Light Is Fading Away',
      'Sadness, Dismal Imerence',
      'Magogaio/Sadness',
      'Bjork',
      'Björk'
    )
    const { artists, cache } = convertOld(overrides, groups, tags)
    expect(serializeArtists(artists)).toEqual({
      version: 1,
      artists: [
        artist('Magogaio', 'you', ['Magogaio/Sadness', 'you']),
        artist(
          'Sadness',
          'you',
          ['Sadness, Along Memories', 'you'],
          ['Sadness, The Light Is Fading Away', 'you'],
          ['Sadness, Dismal Imerence', 'you'],
          ['Magogaio/Sadness', 'you']
        ),
        artist('Björk', 'ai', ['Bjork', 'ai'], ['Björk', 'ai']),
        artist('Guns N’ Roses', 'ai', ['gunsnroses', 'ai'])
      ]
    })
    expect(cache).toEqual({ asked: new Set(['bjork', 'björk', 'magogaio/sadness']) })
    const s = shown(artists)
    expect(s['sadness,alongmemories']).toEqual({ names: ['Sadness'], byAi: false })
    expect(s['magogaio/sadness']).toEqual({ names: ['Magogaio', 'Sadness'], byAi: false })
  })

  it('does not link a group key that is only an override name', () => {
    // old usedKeys put override names in the groups too
    const overrides = new Map(Object.entries({ kino: ['Кино'] }))
    const groups = {
      groups: new Map(Object.entries({ кино: 'Кино', 'kino!': 'Кино' })),
      asked: new Set<string>()
    }
    const { artists } = convertOld(overrides, groups, spell('Kino', 'Kino!'))
    expect(artists).toEqual(file(artist('Кино', 'you', ['Kino', 'you'], ['Kino!', 'ai'])))
  })

  it('makes one artist of override names that differ only by case', () => {
    const overrides = new Map(Object.entries({ a: ['Foo'], b: ['FOO'] }))
    const { artists } = convertOld(
      overrides,
      { groups: new Map(), asked: new Set() },
      spell('A', 'B')
    )
    expect(artists).toEqual(file(artist('Foo', 'you', ['A', 'you'], ['B', 'you'])))
  })

  it('keeps a key no album or song has as its tag, and a Use tag override as one', () => {
    const overrides = new Map(Object.entries({ gone: ['Gone Band'], kino: ['Kino'] }))
    const groups = {
      groups: new Map(Object.entries({ kino: 'Кино', old: 'Old' })),
      asked: new Set<string>()
    }
    const { artists } = convertOld(overrides, groups, spell('Kino'))
    expect(artists).toEqual(
      file(
        artist('Gone Band', 'you', ['gone', 'you']),
        artist('Kino', 'you', ['Kino', 'you']),
        artist('Old', 'ai', ['old', 'ai'])
      )
    )
    expect(shown(artists)).toEqual({
      gone: { names: ['Gone Band'], byAi: false },
      old: { names: ['Old'], byAi: true }
    })
  })
})

describe('creditOf', () => {
  const f = file(
    artist('Кино', 'you', ['kino', 'you']),
    artist('Sadness', 'you', ['Sadness, Stellafera', 'you']),
    artist('Stellafera', 'you', ['Sadness, Stellafera', 'you']),
    artist('Björk', 'ai', ['Bjork', 'ai'], ['Björk', 'ai']),
    artist('Bjork', 'you', ['Bjork!', 'you'])
  )
  const on = resolve(f, true)

  it('keeps a tag with no link as it is', () => {
    expect(creditOf('Queen', on)).toEqual({ artist: 'Queen' })
    expect(creditOf('Queen', new Map())).toEqual({ artist: 'Queen' })
  })

  it('renames, matching the tag by key', () => {
    expect(creditOf('KINO', on)).toEqual({ artist: 'Кино', artistTag: 'KINO' })
  })

  it('splits, showing the names joined in file order', () => {
    expect(creditOf('Sadness, Stellafera', on)).toEqual({
      artist: 'Sadness, Stellafera',
      artists: ['Sadness', 'Stellafera'],
      artistTag: 'Sadness, Stellafera'
    })
  })

  it('does not look the new names up again', () => {
    // "Bjork!" shows as "Bjork", which is not then grouped as "Björk"
    expect(creditOf('Bjork!', on)).toEqual({ artist: 'Bjork', artistTag: 'Bjork!' })
  })

  it("marks an AI link grouped, and leaves a tag spelled as the AI's name as it is", () => {
    expect(creditOf('Bjork', on)).toEqual({ artist: 'Björk', artistTag: 'Bjork', grouped: true })
    expect(creditOf('Björk', on)).toEqual({ artist: 'Björk' })
  })

  it('shows AI links only while the AI is on', () => {
    expect(creditOf('Bjork', resolve(f, false))).toEqual({ artist: 'Bjork' })
  })

  it('shows a tag you kept as its own name (Use tag) as the plain tag, the AI kept off', () => {
    const own = file(artist('Bjork', 'you', ['Bjork', 'you'], ['Bjork', 'ai']))
    expect(creditOf('Bjork', resolve(own, true))).toEqual({ artist: 'Bjork' })
    expect(creditOf('BJORK', resolve(own, true))).toEqual({ artist: 'BJORK' })
  })
})

describe('the keys the library process needs', () => {
  const f = file(
    artist('Björk', 'you', ['Bjork', 'ai'], ['bjork (live)', 'you']),
    artist('Kino', 'you', ['Kino', 'you'])
  )

  it('lists the tags with a link by you, and with a link by the AI', () => {
    expect(yourKeys(f)).toEqual(new Set(['bjork(live)', 'kino']))
    expect(aiKeys(f)).toEqual(new Set(['bjork']))
  })

  it('keeps the tags and the names you gave, not the names the AI gave', () => {
    expect(
      usedKeys([
        { artist: 'Queen' },
        { artist: 'Sadness, Stellafera', artists: ['Sadness', 'Stellafera'], artistTag: 's & s' },
        { artist: 'Björk', artistTag: 'Bjork', grouped: true }
      ])
    ).toEqual(new Set(['queen', 's&s', 'sadness', 'stellafera', 'bjork']))
  })

  it("spells each tag key as it was first seen, the album's tag before its songs'", () => {
    const albums = [
      { artist: 'Queen', trackIds: ['1', '2'] },
      { artist: 'Кино', artistTag: 'KINO', trackIds: ['3'] }
    ] as never[]
    const tracks: Record<string, unknown> = {
      1: { artist: 'QUEEN' },
      2: { artist: 'Freddie' },
      3: { artist: 'Кино', artistTag: 'kino' }
    }
    expect(tagSpellings(albums, (id) => tracks[id] as never)).toEqual(
      new Map([
        ['queen', 'Queen'],
        ['freddie', 'Freddie'],
        ['kino', 'KINO']
      ])
    )
  })
})

describe('the old files', () => {
  it('reads artist-overrides.json, skipping keys artistKey would not make and empty lists', () => {
    const o = parseOldOverrides({
      version: 1,
      artists: { 'Big Name': ['X'], ok: [' Y '], empty: [], bad: 'Z' }
    })
    expect(o).toEqual(new Map([['ok', ['Y']]]))
    expect(parseOldOverrides({ version: 2, artists: { a: ['A'] } }).size).toBe(0)
    expect(parseOldOverrides(undefined).size).toBe(0)
  })

  it('reads artist-groups.json, skipping bad keys and names', () => {
    const g = parseOldGroups({
      version: 1,
      groups: { 'Big Name': 'X', ok: ' Y ', empty: '  ', bad: 3 },
      asked: ['ok', 'Not A Key', 7]
    })
    expect(g).toEqual({ groups: new Map([['ok', 'Y']]), asked: new Set(['ok']) })
    expect(parseOldGroups({ version: 1, groups: {} }).groups.size).toBe(0)
  })
})
