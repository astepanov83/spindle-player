import { describe, expect, it } from 'vitest'
import { pathEnds } from './path-ends'

describe('pathEnds', () => {
  it('splits off the last folder, so the middle can be cut', () => {
    // the slash goes with the name, so a cut reads "/home/al…/music"
    expect(pathEnds('/home/alex/music')).toEqual(['/home/alex', '/music'])
    expect(pathEnds('/home/alex/music/')).toEqual(['/home/alex', '/music/'])
    expect(pathEnds('C:\\Users\\me\\Music')).toEqual(['C:\\Users\\me', '\\Music'])
    expect(pathEnds('/')).toEqual(['', '/'])
    expect(pathEnds('music')).toEqual(['', 'music'])
  })
})
