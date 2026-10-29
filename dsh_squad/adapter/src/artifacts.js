// The artifacts a task's result carries, as the steps that read the result see them. A
// reviewer or the next step gets the page itself, not only the words of the result: without
// this, a checker could only judge a page it cannot see. Pure: the caller supplies the reader
// (controller.js artifact), so the tests need no Controller.

const TEXT = /^(text\/|application\/json|image\/svg\+xml)/
export const ARTIFACT_LIMIT = 200_000

/** The hex digest of an artifact, from the sha256 the Controller states ("sha256/<hex>" or "sha256:<hex>"). */
export const digestOf = art => String(art?.sha256 ?? '').replace(/^sha256[/:]/, '')

/**
 * The text lines that show a result's artifacts. Text and SVG are shown in full up to a
 * limit; anything else is named and left out.
 * @param {{artifacts?: {name?: string, media_type?: string, sha256?: string}[]}|undefined} result
 * @param {(hex: string) => Promise<Buffer>} read
 * @param {number} limit
 * @returns {Promise<string[]>}
 */
export async function artifactLines(result, read, limit = ARTIFACT_LIMIT) {
  const lines = []
  for (const art of result?.artifacts ?? []) {
    const name = art.name ?? 'artifact'
    const type = art.media_type ?? 'unknown'
    if (!TEXT.test(type)) {
      lines.push(`artifact ${name} (${type}): not shown`)
      continue
    }
    let text
    try {
      text = (await read(digestOf(art))).toString('utf8')
    } catch {
      lines.push(`artifact ${name}: unavailable`)
      continue
    }
    lines.push(`artifact ${name} (${type}, sha256 ${digestOf(art).slice(0, 12)}):`, text.length > limit ? `${text.slice(0, limit)}\n[cut at ${limit} characters]` : text)
  }
  return lines
}

/**
 * The HTML artifact of a result, when it has one.
 * @returns {Promise<string|undefined>}
 */
export async function htmlArtifact(result, read) {
  const art = (result?.artifacts ?? []).find(a => /html/.test(a.media_type ?? ''))
  if (art === undefined) return undefined
  return (await read(digestOf(art))).toString('utf8')
}
