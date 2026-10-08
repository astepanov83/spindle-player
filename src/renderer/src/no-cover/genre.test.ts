import { describe, expect, it } from 'vitest'
import { commonGenre } from '../../../shared/genre'
import { familyOf, type Family } from './genre'

describe('genre families', () => {
  const cases: [string | undefined, Family][] = [
    ['Alternative Rock', 'rock'],
    ['Indie / Post-Rock', 'rock'],
    ['Classic Rock', 'rock'],
    ['Folk Rock', 'rock'],
    ['Heavy Metal', 'rock'],
    ['J-Pop', 'pop'],
    ['K-Pop', 'pop'],
    ['Hip-Hop', 'pop'],
    ['Электроника', 'electronic'],
    ['Drum & Bass', 'electronic'],
    ['Drum and Bass', 'electronic'],
    ['Drum n Bass', 'electronic'],
    ['Deep House', 'electronic'],
    ['Synthpop', 'electronic'],
    ['Ambient', 'ambient'],
    ['Dark Ambient, Drone', 'ambient'],
    ['New Age', 'ambient'],
    ['Folk', 'folk'],
    ['Country', 'folk'],
    ['Classical', 'classical'],
    ['Baroque', 'classical'],
    ['Jazz', 'jazz'],
    ['Blues', 'jazz'],
    ['Soundtrack', 'none'],
    ['Podcast', 'none'],
    ['Other', 'none'],
    ['', 'none'],
    [undefined, 'none'],
    ['Rock, Pop', 'rock'],
    ['Pop, Rock', 'rock'],
    ['РОК', 'rock'],
    ['Джаз', 'jazz'],
    ['Классика', 'classical'],
    ['Поп', 'pop'],
    ['Эмбиент', 'ambient'],
    ['ロック', 'rock'],
    ['ジャズ', 'jazz'],
    ['クラシック', 'classical'],
    ['ポップス', 'pop'],
    ['アンビエント', 'ambient'],
    ['テクノ', 'electronic']
  ]
  for (const [tag, family] of cases)
    it(`${JSON.stringify(tag)} is ${family}`, () => expect(familyOf(tag)).toBe(family))
})

describe('the genre of a group', () => {
  const g = (...genres: (string | undefined)[]): { genre?: string }[] =>
    genres.map((genre) => ({ genre }))

  it('is the one most tracks have', () => {
    expect(commonGenre(g('Jazz', 'Rock', 'Rock'))).toBe('Rock')
  })
  it('goes to the first track when two are tied', () => {
    expect(commonGenre(g('Jazz', 'Rock', 'Rock', 'Jazz'))).toBe('Jazz')
  })
  it('skips tracks with no tag, and the first track may have none', () => {
    expect(commonGenre(g(undefined, 'Folk', '', ' ', 'Folk', 'Pop'))).toBe('Folk')
    expect(commonGenre(g(undefined, 'Pop', 'Folk'))).toBe('Pop')
  })
  it('counts spellings that differ only by case as one', () => {
    expect(commonGenre(g('rock', 'Jazz', 'Rock'))).toBe('rock')
  })
  it('is nothing when no track has a tag', () => {
    expect(commonGenre(g(undefined, ''))).toBeUndefined()
    expect(commonGenre([])).toBeUndefined()
  })
})
