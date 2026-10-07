import { describe, expect, it } from 'vitest'
import { folderParts } from './path-ends'

describe('folderParts', () => {
  it('splits off the last folder from the folder it is in', () => {
    expect(folderParts('/home/alex/music')).toEqual({ name: 'music', dir: '/home/alex' })
    expect(folderParts('/home/alex/music/')).toEqual({ name: 'music', dir: '/home/alex' })
    expect(folderParts('C:\\Users\\me\\Music')).toEqual({ name: 'Music', dir: 'C:\\Users\\me' })
    expect(folderParts('/music')).toEqual({ name: 'music', dir: '/' })
    expect(folderParts('music')).toEqual({ name: 'music', dir: '' })
  })
  it('keeps a root whole', () => {
    expect(folderParts('/')).toEqual({ name: '/', dir: '' })
    expect(folderParts('')).toEqual({ name: '', dir: '' })
  })
})
