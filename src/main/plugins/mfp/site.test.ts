import { describe, expect, it } from 'vitest'
import { parseDuration, parseEpisode, parseSlugs, parseTracklist, readEntry } from './site'

const site = 'https://musicforprogramming.net'

// The site's page as it comes: the data is a JS object literal in a script,
// with "/" written as / and tags as <...>.
function page(entry: string): string {
  return (
    '<!doctype html><html><body><div id=sapper></div><script>' +
    `__SAPPER__={baseUrl:"",preloaded:[void 0,{entry:{${entry}}}]};` +
    "if('serviceWorker' in navigator)navigator.serviceWorker.register('/service-worker.js');" +
    '</script></body></html>'
  )
}

const one = page(
  'slug:"one",type:"episode",order:1,title:"01: Datassette",' +
    'file:"https:\\u002F\\u002Fdatashat.net\\u002Fmusic_for_programming_1-datassette.mp3",' +
    'filesize:"88368647",duration:"1:02:16",timestamp:"2011-02-22 17:17:58",body:"",' +
    'tracklist:"\\n\\t\\t\\tAlpha - First\\u003Cbr\\u003E\\n\\t\\t\\tBeta &amp; Gamma - Second Song\\u003Cbr\\u003E\\n\\t\\t",' +
    'links:"\\u003Ca href=\\"http:\\u002F\\u002Fexample.net\\u002F\\"\\u003Eexample\\u003C\\u002Fa\\u003E"'
)

describe('parseSlugs', () => {
  it('lists the episodes in page order, each once', () => {
    const html =
      '<a href=seventynine>79: Corticyte</a><a href=seventyeight>78: Datassette</a>' +
      '<a href=about>About</a><a href=seventynine>79: Corticyte</a><a href=credits>Credits</a>'
    expect(parseSlugs(html)).toEqual(['seventynine', 'seventyeight'])
  })
})

describe('parseDuration', () => {
  it('reads h:mm:ss and m:ss', () => {
    expect(parseDuration('4:00:00')).toBe(14400)
    expect(parseDuration('1:02:16')).toBe(3736)
    expect(parseDuration('59:30')).toBe(3570)
  })

  it('gives 0 for empty or broken text', () => {
    expect(parseDuration('')).toBe(0)
    expect(parseDuration('about an hour')).toBe(0)
  })
})

describe('parseTracklist', () => {
  it('splits rows on <br>, and each row on the first " - "', () => {
    expect(parseTracklist('\n\tA - One<br>B - Two - Remix<br />\n')).toEqual([
      { artist: 'A', title: 'One' },
      { artist: 'B', title: 'Two - Remix' }
    ])
  })

  it('drops tags, decodes entities and folds spaces', () => {
    expect(parseTracklist('<i>Mücha</i>  -  een&deg;dag &amp; more<br>')).toEqual([
      { artist: 'Mücha', title: 'een°dag & more' }
    ])
  })

  it('keeps a row with no " - " as a title with no artist', () => {
    expect(parseTracklist('Untitled field recording<br>')).toEqual([
      { artist: '', title: 'Untitled field recording' }
    ])
  })
})

describe('readEntry', () => {
  it('reads the entry object without running the page', () => {
    const e = readEntry(one)
    expect(e?.slug).toBe('one')
    expect(e?.order).toBe(1)
    expect(e?.file).toBe('https://datashat.net/music_for_programming_1-datassette.mp3')
  })

  it('reads string escapes, numbers, true, false, null and void 0', () => {
    const e = readEntry(
      page('a:"x\\"y\\\\z\\/\\x41\\u00e9",b:-1.5e2,c:true,d:false,e:null,f:void 0,"g h":[1,"2"]')
    )
    expect(e).toEqual({
      a: 'x"y\\z/Aé',
      b: -150,
      c: true,
      d: false,
      e: null,
      f: undefined,
      'g h': [1, '2']
    })
  })

  it('gives none for code it does not read (a function, a name)', () => {
    const iife =
      '<script>__SAPPER__={baseUrl:"",preloaded:[void 0,(function(a){return {entry:{slug:a}}}("x"))]};</script>'
    expect(readEntry(iife)).toBeUndefined()
    expect(readEntry(page('slug:someName'))).toBeUndefined()
  })

  it('gives none for a page with no data or cut short', () => {
    expect(readEntry('<html>nothing here</html>')).toBeUndefined()
    expect(readEntry(page('slug:"one"').slice(0, 80))).toBeUndefined()
  })
})

describe('parseEpisode', () => {
  it('makes an episode from the page', () => {
    expect(parseEpisode(one, site)).toEqual({
      slug: 'one',
      number: 1,
      title: '01: Datassette',
      artist: 'Datassette',
      url: 'https://datashat.net/music_for_programming_1-datassette.mp3',
      bytes: 88368647,
      duration: 3736,
      date: '2011-02-22T17:17:58Z',
      tracks: [
        { artist: 'Alpha', title: 'First' },
        { artist: 'Beta & Gamma', title: 'Second Song' }
      ],
      link: 'https://musicforprogramming.net/one'
    })
  })

  it('gives none for a page that is not an episode', () => {
    expect(parseEpisode(page('slug:"about",type:"info",title:"About"'), site)).toBeUndefined()
  })

  it('gives none when the mp3 is not an https URL', () => {
    const http = page(
      'slug:"two",type:"episode",order:2,title:"02: X",file:"http:\\u002F\\u002Fa.net\\u002Fx.mp3"'
    )
    expect(parseEpisode(http, site)).toBeUndefined()
  })

  it('keeps an episode with no tracklist, date or length', () => {
    const bare = page(
      'slug:"two",type:"episode",order:2,title:"02: Sunjammer",file:"https:\\u002F\\u002Fa.net\\u002Fx.mp3"'
    )
    expect(parseEpisode(bare, site)).toMatchObject({
      number: 2,
      artist: 'Sunjammer',
      duration: 0,
      date: null,
      tracks: []
    })
  })
})
