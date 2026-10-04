// A path as [everything before the last folder, the last folder with its
// slash], so a long one can be cut in the middle and still show its own name.
export function pathEnds(path: string): [string, string] {
  const m = /^(.*?)([/\\]?[^/\\]+[/\\]?|[/\\])$/.exec(path)
  return m ? [m[1], m[2]] : ['', path]
}
