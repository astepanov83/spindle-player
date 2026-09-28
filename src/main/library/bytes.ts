// A copy of just these bytes in a buffer of their own. postMessage copies a
// typed array's whole buffer, and a Buffer (from readFile or music-metadata) is
// often a view into a bigger one; Buffer.slice() is a view too.
export function ownCopy(data: Uint8Array): Uint8Array {
  return new Uint8Array(data)
}
