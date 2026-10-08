// The drawing family a genre tag picks (ticket 104). The first list that
// matches wins, so "Folk Rock" is rock and "Classic Rock" is not classical.
// The tag reader already turns ID3 number genres like "(17)" into names.
export const families = [
  'ambient',
  'rock',
  'folk',
  'electronic',
  'classical',
  'jazz',
  'pop',
  'none'
] as const
export type Family = (typeof families)[number]

const words: [Family, RegExp][] = [
  [
    'ambient',
    /ambient|drone|new.?age|chill|relax|meditat|lounge|downtempo|эмбиент|амбиент|アンビエント|ヒーリング|環境音楽/i
  ],
  [
    'rock',
    /rock|metal|punk|grunge|hardcore|\bemo\b|shoegaze|alternative|рок|метал|панк|ロック|メタル|パンク/i
  ],
  [
    'folk',
    /folk|country|bluegrass|acoustic|singer.?songwriter|celtic|world|народ|фолк|кантри|бард|авторская|フォーク|カントリー|民謡/i
  ],
  [
    'electronic',
    /electro|techno|house|trance|edm|dnb|drum.{1,5}bass|dubstep|synth|\bidm\b|breakbeat|dance|электрон|техно|хаус|транс|エレクトロ|テクノ|ハウス|電子/i
  ],
  [
    'classical',
    /classic|baroque|opera|symphon|orchestra|chamber|concerto|sonata|классик|классич|симфон|опера|камерн|クラシック|交響|オペラ|室内楽/i
  ],
  ['jazz', /jazz|blues|swing|bebop|bossa|soul|funk|джаз|блюз|ジャズ|ブルース/i],
  [
    'pop',
    /pop|hip.?hop|\brap\b|r&b|\brnb\b|disco|indie|поп|хип|рэп|ポップ|ヒップホップ|アイドル|歌謡/i
  ]
]

// No tag, or a tag that none of the lists know: `none`.
export function familyOf(genre: string | undefined): Family {
  if (!genre) return 'none'
  return words.find(([, re]) => re.test(genre))?.[0] ?? 'none'
}
