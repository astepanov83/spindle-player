// The looks of the files plugin's views (ticket 095): their names, icons
// and the line Settings shows for each. The switch in a view's title row and
// Settings both use these, so they read the same.
import { viewLookChoices, type LookView, type ViewLooks } from '../../../../shared/settings'
import { setViewLook, viewLook } from '../../stores/settings.svelte'
import type { IconName } from '../../ui/icons'
import type { HeadBlock } from '../types'

interface LookInfo {
  label: string
  icon: IconName
  // Settings' line under the choice, while it is picked
  about: string
}

export const looks: { [V in LookView]: Record<ViewLooks[V], LookInfo> } = {
  albums: {
    grid: {
      label: 'Grid',
      icon: 'lookGrid',
      about:
        'Covers in a grid, with a heading for each artist, letter, decade or time added, by the sort.'
    },
    list: {
      label: 'List',
      icon: 'lookList',
      about:
        'A row for each album: a small cover, the title and artist, the year, songs and length.'
    }
  },
  artists: {
    grid: {
      label: 'Grid',
      icon: 'lookGrid',
      about: 'Round pictures in a grid, with a heading for each letter.'
    },
    shelves: {
      label: 'Shelves',
      icon: 'lookShelves',
      about: 'Each artist with their albums in a row that scrolls sideways.'
    },
    list: {
      label: 'List',
      icon: 'lookList',
      about: 'A row for each artist: their picture, name, a few covers, albums and songs.'
    }
  },
  artistPage: {
    sections: {
      label: 'Sections',
      icon: 'lookSections',
      about: 'Their most played songs, then Albums, Singles and EPs, and Appears on, as covers.'
    },
    albums: {
      label: 'Albums with songs',
      icon: 'lookAlbums',
      about:
        'Each album with its cover beside its songs, so all their work reads and plays from one page.'
    },
    column: {
      label: 'Left column',
      icon: 'lookColumn',
      about:
        'The artist in a column on the left that stays put, their songs and albums as rows on the right.'
    }
  }
}

export const lookViewNames: Record<LookView, string> = {
  albums: 'Albums',
  artists: 'Artists',
  artistPage: 'Artist page'
}

// the act id of the switch, on the head of each view
export const lookId = 'look'

// The switch for a head: one icon segment per look, the current one picked.
export function lookSwitch(view: LookView): NonNullable<HeadBlock['looks']> {
  const info = looks[view] as Record<string, LookInfo>
  return {
    id: lookId,
    label: `${lookViewNames[view]} look`,
    value: viewLook(view),
    options: viewLookChoices[view].map((l) => ({
      value: l,
      label: info[l].label,
      icon: info[l].icon
    }))
  }
}

export { setViewLook, viewLook }
