// Ids go into spindle://radio/<id>, so they stay plain. On its own, with no
// imports, so the plugin list can check saved station keys without a loop of imports.
export const stationIdPattern = /^[A-Za-z0-9_-]{1,200}$/
