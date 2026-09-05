/**
 * The exact bytes used by the console's local exports.
 *
 * Kept separate from the browser download gesture so tests can exercise the same serialization
 * boundary without mocking Blob URLs or a document. This function does not attempt to guess which
 * application values are secrets: callers must pass the already-safe view, or explicitly accept
 * that a payload-enabled view is exported verbatim.
 */
export const jsonLines = (rows: readonly unknown[]): string => (rows.length ? `${rows.map((row) => JSON.stringify(row)).join('\n')}\n` : '')

/** Saves a bounded in-memory view as newline-delimited JSON without using a remote service. */
export const downloadJsonLines = (rows: readonly unknown[], filename: string) => {
    const blob = new Blob([jsonLines(rows)], { type: 'application/x-ndjson' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
}
