// The theme the page shows. Main drives prefers-color-scheme through
// nativeTheme (decision 28), so this only follows the media query. Used where
// CSS can't pick for us: the album palette per theme, and the canvas.
const query = matchMedia('(prefers-color-scheme: light)')

export const theme = $state({ light: query.matches })

query.addEventListener('change', () => (theme.light = query.matches))
