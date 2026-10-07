// A folder's path as its own name and the folder it is in, so a row can
// show the name first and the rest after it, faint.
export function folderParts(path: string): { name: string; dir: string } {
  const m = /^(.*?)([/\\]?)([^/\\]+)[/\\]?$/.exec(path)
  if (!m) return { name: path, dir: '' }
  // "/music" is in "/"
  return { name: m[3], dir: m[1] || m[2] }
}
