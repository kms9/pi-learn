// The page's copy of the Controller's state (M3-1). The Controller's snapshot is the
// only source: events are hints that something changed, never facts to apply. Pure.
//
// - A snapshot replaces the copy unless it is older than the copy (lower revision of the
//   same Controller epoch): a slow answer cannot undo a newer one.
// - A new Controller epoch (a restart) always replaces it.
// - Events past the copy's revision, a gap in the event sequence, or a lost connection
//   all ask for a fresh snapshot.

export const EMPTY = { epoch: null, revision: -1, snapshot: null, stale: true, error: null }

export function acceptSnapshot(current, snapshot) {
  if (snapshot === undefined || snapshot === null) return current
  const epoch = snapshot.controller_epoch
  const revision = Number(snapshot.revision ?? 0)
  if (current.epoch === epoch && revision < current.revision) return current
  return { epoch, revision, snapshot, stale: false, error: null }
}

/**
 * What an event page means for the copy.
 * @returns {{resnapshot: boolean, cursor: number}}
 */
export function readEvents(current, page) {
  if (page === undefined || page === null) return { resnapshot: true, cursor: current.revision }
  if (current.epoch !== null && page.controller_epoch !== current.epoch) return { resnapshot: true, cursor: 0 }
  const events = page.events ?? []
  if (events.length === 0) return { resnapshot: false, cursor: current.revision }
  const first = events[0].seq
  const last = events.at(-1).seq
  const gap = first > current.revision + 1
  return { resnapshot: last > current.revision || gap, cursor: Math.max(current.revision, last) }
}

export const lost = (current, error) => ({ ...current, stale: true, error: String(error?.message ?? error) })
