// Main's libuv pool runs its file work: audio reads for the page, cover files
// and saves. Four threads (the default) can all be stuck on a slow NAS read,
// and then a save waits too. More threads keep a stuck read from holding up
// the rest. It only counts if set before the pool starts, so index.ts imports
// this first.
process.env.UV_THREADPOOL_SIZE ||= '16'
