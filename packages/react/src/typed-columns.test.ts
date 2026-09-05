import { describe, expect, test } from 'vitest'
import { cellsFor, channelFor, fieldFor, typedColumnLayout, type TypedColumn, type TypedFields } from './typed-columns.js'

/**
 * The rule that decides the shape of a grid holding rows of several types.
 *
 * Every assertion here is about a heading staying still. A layout derived from a page would move
 * when the page did, and a reader binding a cell to one line of a stacked heading has nothing left
 * once the lines have swapped - so determinism, the fixed order of the stack, and the blank lines
 * that hold it open are the whole of what is being pinned.
 */

const labels = (column: TypedColumn) => (column.kind === 'shared' ? [column.field] : column.stack.map((label) => label.field))

describe('fields several types carry', () => {
    const layout = typedColumnLayout([
        { type: 'a', fields: ['id', 'name', 'left'] },
        { type: 'b', fields: ['id', 'name', 'right'] }
    ])

    test('collapse to one plain column each, in declared order', () => {
        expect(layout.columns.filter((column) => column.kind === 'shared').map((column) => column.field)).toEqual(['id', 'name'])
    })

    test('and say which types actually carry them, which is not always all of them', () => {
        const layout = typedColumnLayout([
            { type: 'a', fields: ['held'] },
            { type: 'b', fields: ['held'] },
            { type: 'c', fields: ['alone'] }
        ])
        const shared = layout.columns.find((column) => column.kind === 'shared')
        expect(shared).toMatchObject({ field: 'held', types: ['a', 'b'] })
        // Not the same as carrying it and leaving it empty, which is what the cell has to draw.
        expect(fieldFor(shared!, 'c')).toBeUndefined()
    })

    test('are shared on two types out of many, not only on all of them', () => {
        // The alternative - share only what every type carries - packs tighter and puts one field
        // name in two columns, at whichever depth each type happened to place it.
        const layout = typedColumnLayout([
            { type: 'a', fields: ['holder', 'x'] },
            { type: 'b', fields: ['y', 'holder'] },
            { type: 'c', fields: ['z'] }
        ])
        expect(layout.columns.filter((column) => column.kind === 'shared').map((column) => column.field)).toEqual(['holder'])
    })
})

describe('fields only one type carries', () => {
    const layout = typedColumnLayout([
        { type: 'a', fields: ['one', 'two', 'three'] },
        { type: 'b', fields: ['first'] }
    ])

    test('stack, one column per depth, as deep as the widest type', () => {
        expect(layout.columns).toHaveLength(3)
        expect(labels(layout.columns[0])).toEqual(['one', 'first'])
    })

    test('and hold a blank line open for a type that does not reach that far', () => {
        // The blank is the point: it is what keeps a type on the same line in every column, which
        // is the one channel here that costs nothing and survives being read without colour.
        expect(labels(layout.columns[1])).toEqual(['two', undefined])
        expect(labels(layout.columns[2])).toEqual(['three', undefined])
    })

    test('repeating the same type order in every column', () => {
        for (const column of layout.columns) expect(column.kind === 'stacked' && column.stack.map((label) => label.type)).toEqual(['a', 'b'])
    })
})

describe('channels', () => {
    test('go only to types that stack something', () => {
        // Every field of `plain` is shared, so its rows are never ambiguous and marking them would
        // be ink spent on a distinction nobody has to make.
        const layout = typedColumnLayout([
            { type: 'plain', fields: ['id'] },
            { type: 'marked', fields: ['id', 'own'] },
            { type: 'also', fields: ['id', 'other'] }
        ])
        expect(layout.stacked).toEqual([
            { type: 'marked', channel: 0 },
            { type: 'also', channel: 1 }
        ])
    })

    test('and are absent on a plain column and on a blank line', () => {
        const layout = typedColumnLayout([
            { type: 'a', fields: ['id', 'one', 'two'] },
            { type: 'b', fields: ['id', 'only'] }
        ])
        const [shared, first, second] = layout.columns
        expect(channelFor(shared, 'a')).toBeUndefined()
        expect(channelFor(first, 'b')).toBe(1)
        expect(channelFor(second, 'b')).toBeUndefined()
    })
})

describe('the property the sharing rule exists for', () => {
    const types: TypedFields[] = [
        { type: 'security.finding', fields: ['name', 'peer', 'evidence', 'severity', 'finding', 'message'] },
        { type: 'security.transport', fields: ['name', 'peer', 'evidence', 'transport', 'protocol', 'authentication', 'encryption', 'signing', 'relay'] },
        { type: 'security.event', fields: ['name', 'peer', 'evidence', 'event', 'at', 'code', 'method'] },
        { type: 'security.authority', fields: ['name', 'peer', 'evidence', 'holder', 'namespace', 'generation', 'expiresAt'] },
        { type: 'security.identity', fields: ['name', 'peer', 'evidence', 'identity', 'roles', 'methods'] }
    ]
    const layout = typedColumnLayout(types)

    test('every field name occupies exactly one column', () => {
        const seen = layout.columns.flatMap((column) => labels(column).filter((field): field is string => field !== undefined))
        expect(seen).toHaveLength(new Set(seen).size)
        expect(new Set(seen)).toEqual(new Set(types.flatMap(({ fields }) => fields)))
    })

    test('and the width falls from the union to shared plus the widest type', () => {
        const union = new Set(types.flatMap(({ fields }) => fields))
        expect(union.size).toBe(23)
        // Three shared, and `security.transport` at six divergent fields sets the depth.
        expect(layout.columns).toHaveLength(9)
    })

    test('leaving every row able to say which field it draws where', () => {
        const transport = layout.columns.map((column) => fieldFor(column, 'security.transport'))
        expect(transport).toEqual(['name', 'peer', 'evidence', 'transport', 'protocol', 'authentication', 'encryption', 'signing', 'relay'])
        const identity = layout.columns.map((column) => fieldFor(column, 'security.identity'))
        expect(identity).toEqual(['name', 'peer', 'evidence', 'identity', 'roles', 'methods', undefined, undefined, undefined])
    })
})

describe('the awkward inputs', () => {
    test('no types at all is an empty layout rather than a throw', () => {
        expect(typedColumnLayout([])).toEqual({ columns: [], stacked: [] })
    })

    test('a type listing a field twice gets one slot for it, and no promotion to shared', () => {
        // Counted by carrying type rather than by occurrence, or a type repeating itself would
        // share a column with nobody.
        const layout = typedColumnLayout([{ type: 'a', fields: ['same', 'same', 'other'] }])
        expect(layout.columns.every((column) => column.kind === 'stacked')).toBe(true)
        expect(layout.columns.map(labels)).toEqual([['same'], ['other']])
    })

    test('a type with no fields takes no line', () => {
        const layout = typedColumnLayout([
            { type: 'empty', fields: [] },
            { type: 'a', fields: ['one'] }
        ])
        expect(layout.stacked).toEqual([{ type: 'a', channel: 0 }])
    })
})

describe('what a row of one type draws', () => {
    const layout = typedColumnLayout([
        { type: 'a', fields: ['id', 'one', 'two'] },
        { type: 'b', fields: ['id', 'only'] }
    ])

    test('is one answer per column, in the columns own order', () => {
        expect(cellsFor(layout, 'a')).toEqual([{ field: 'id' }, { field: 'one', channel: 0 }, { field: 'two', channel: 0 }])
    })

    test('with the columns it has nothing in left empty and unmarked', () => {
        // Which is not the same as a field it has and left empty, and only the layout knows which.
        expect(cellsFor(layout, 'b')).toEqual([{ field: 'id' }, { field: 'only', channel: 1 }, {}])
    })

    test('and a type nobody declared draws nothing at all, at the full width', () => {
        // A row the table cannot place must still have as many cells as the header above it.
        const absent = cellsFor(layout, 'never-declared')
        expect(absent).toHaveLength(layout.columns.length)
        expect(absent.every(({ field }) => field === undefined)).toBe(true)
    })
})
