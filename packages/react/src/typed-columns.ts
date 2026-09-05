/**
 * One column per *slot*, rather than one column per field.
 *
 * A grid drawing rows of several types has, today, the union of every type's fields as its columns:
 * its width is the sum of the types present, while any one row fills a fraction of it. A security
 * posture promotes fourteen columns of which a transport row populates six and a finding row three;
 * a network list unions the row types of every source it reached. Neither row is wrong. The table
 * is the wrong shape for both.
 *
 * So a column holds a different field for each type, its heading stacks one label per type, and a
 * cell draws whichever field belongs to *its* row's type. The width falls from the union to
 * `shared + max(divergent per type)`, which is a large saving where the types are disjoint and a
 * small one where a single type is much wider than the rest. That is a property of the data; no
 * arrangement can improve on it.
 *
 * **Every field name occupies exactly one column, and that is what decides the rule below.** A name
 * carried by two or more types is *shared*: one slot, one plain label, no marking of any kind,
 * because with one label there is nothing for a reader to bind a cell to. Only names carried by a
 * single type stack. The tempting alternative - share only what *every* type carries - packs
 * tighter and breaks the property: a name held by two of seven types would then appear in the stack
 * twice, at whatever depth each type happened to put it, and the same field name in two different
 * columns is worse than a column that is blank for five types.
 *
 * What the stack is bound by is set out in `notes/typed-columns.md`, and it is the part of this to
 * read before changing anything: a cell has one line and therefore no position to spend, so its
 * position in the heading cannot bind it, and hue cannot bind it alone for about one reader in
 * twelve. Which is why `channel` below is one number handed to both a hue and a glyph rather than
 * a colour index - and why a type that stacks nothing is given no channel at all. No ambiguity, no
 * ink.
 */

/** What one row type draws, in the order the type wants it drawn. */
export interface TypedFields {
    /**
     * The discriminator this type answers to: a `kind`, or a key naming a source.
     *
     * The order these arrive in decides the order of the stack and therefore every channel, so it
     * has to come from a declaration - a union's options, a catalogue's sources - and never from
     * what happened to be on a page. A heading that reordered itself when the page changed would
     * be worse than no heading, and it is the one thing a heading must never do.
     */
    readonly type: string
    readonly fields: readonly string[]
}

/** A column that only one label can describe. Drawn plainly: there is nothing to bind. */
export interface SharedColumn {
    readonly kind: 'shared'
    readonly field: string
    /** Which types carry it. A type absent from this list has no value here, as against an empty one. */
    readonly types: readonly string[]
}

/** One type's line in a stacked heading. `field` absent is a blank line, deliberately held open. */
export interface StackedLabel {
    readonly type: string
    readonly channel: number
    readonly field?: string
}

export interface StackedColumn {
    readonly kind: 'stacked'
    readonly stack: readonly StackedLabel[]
}

export type TypedColumn = SharedColumn | StackedColumn

export interface TypedColumnLayout {
    readonly columns: readonly TypedColumn[]
    /**
     * The types that stack, in the order every stacked column repeats, each with its channel.
     *
     * One order for the whole layout rather than one per column, because it is what makes a type's
     * line the same line in every heading on the page - the free, colour-independent reinforcement
     * that a blank line exists to preserve. Computed per column it would drift, and a reader would
     * have nothing left but the hue.
     */
    readonly stacked: readonly { readonly type: string; readonly channel: number }[]
}

/** First occurrence wins, so a type that lists a field twice does not get two slots for it. */
const distinct = (fields: readonly string[]): readonly string[] => [...new Set(fields)]

/**
 * The layout for a set of declared types.
 *
 * Pure, and outside React on purpose: this is the whole of the feature and everything after it is
 * rendering, so it is the part that would be wrong quietly. `scopeSummaryFields` is the precedent.
 */
export const typedColumnLayout = (types: readonly TypedFields[]): TypedColumnLayout => {
    const fieldsOf = new Map(types.map((held) => [held.type, distinct(held.fields)]))

    // How many *types* carry each name, never how many times it was written. A field a type lists
    // twice is one type's field, and counting occurrences would promote it to shared on its own.
    const carriers = new Map<string, string[]>()
    for (const { type } of types)
        for (const field of fieldsOf.get(type)!) {
            const held = carriers.get(field)
            if (held) held.push(type)
            else carriers.set(field, [type])
        }

    // Ordered by first appearance, scanning types in their declared order: deterministic, and it
    // puts the fields of the first-declared type first, which is the order somebody chose.
    const shared: SharedColumn[] = []
    for (const { type } of types)
        for (const field of fieldsOf.get(type)!) {
            const holders = carriers.get(field)!
            if (holders.length < 2 || shared.some((column) => column.field === field)) continue
            shared.push({ kind: 'shared', field, types: holders })
        }

    const divergent = new Map(types.map(({ type }) => [type, fieldsOf.get(type)!.filter((field) => carriers.get(field)!.length < 2)]))

    // Only types that actually stack something take a line, and therefore a channel. A type whose
    // every field is shared draws in plain columns and is never ambiguous, so marking its rows
    // would be ink spent on a distinction nobody has to make - and it would cost every stacked
    // heading on the page one permanently blank line.
    const stacked = types.filter(({ type }) => divergent.get(type)!.length > 0).map(({ type }, channel) => ({ type, channel }))

    const depth = Math.max(0, ...stacked.map(({ type }) => divergent.get(type)!.length))
    const columns: TypedColumn[] = [...shared]
    for (let at = 0; at < depth; at++)
        columns.push({
            kind: 'stacked',
            // Every stacking type gets a line whether or not it reaches this far, because the blank
            // is the point: it is what keeps a type on the same line in every column, which is the
            // one channel here that costs nothing and survives being read without colour.
            stack: stacked.map(({ type, channel }) => ({ type, channel, field: divergent.get(type)![at] }))
        })

    return { columns, stacked }
}

/** Which field a row of this type draws in this column, if any. The cell's whole question. */
export const fieldFor = (column: TypedColumn, type: string): string | undefined =>
    column.kind === 'shared' ? (column.types.includes(type) ? column.field : undefined) : column.stack.find((label) => label.type === type)?.field

/** How a cell of this type is marked, where it is marked at all. Absent means a plain column. */
export const channelFor = (column: TypedColumn, type: string): number | undefined =>
    column.kind === 'stacked' ? column.stack.find((label) => label.type === type && label.field !== undefined)?.channel : undefined
