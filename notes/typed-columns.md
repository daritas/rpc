# Typed columns, and what binds a cell to its heading

*Written before the work rather than after it, against `5878611`, in the manner of [`generic-viewer.md`](generic-viewer.md) and not of [`branches-and-rows.md`](branches-and-rows.md): nothing here has met a fixture yet. The reasoning is the part worth keeping. Treat the glyph set and the palette as undecided, and expect at least one of the decisions below to change shape on contact with a real screen.*

## The question

The console's generic grid draws rows of different types into one table, and its columns are the union of every type's fields. A row fills the columns its own type has and leaves the rest blank, so the width of the table is the sum of the types present while the width of any single row is much less. Two places build that union, and both discard, on the line that builds it, exactly the information needed to do better.

`columnsFor` in `packages/query/src/NetworkRpcDataProvider.ts` flat-maps `Object.keys(source.row.fields)` across every source and puts the result through a `Set`. The grouping by source is in the argument and is gone from the result.

`SecurityDataProvider` declares one row type with about thirty optional fields discriminated by seven `kind`s, and promotes fourteen of them as `defaultColumns`. A `security.transport` row populates six of those fourteen; a `security.finding` row populates three. Nothing is wrong with either row. The table is the wrong shape for both.

## The idea

One physical column holds a different field for each row type. The heading for that column stacks one label per type; a cell shows its own type's field at that slot. The column count falls from `union(all fields)` to `shared + max(fields per type)` - dramatic where the types are disjoint, and worth little where one type is much wider than the others, which is a property of the data and not something the layout can fix.

Fields that several types share by name keep a single slot and a single label, and that label is drawn plainly, with no type marking on it at all. `id`, `peer`, `name` and `status` go on lining up down the page exactly as they do now. Only the divergent fields stack, so the marking that follows appears only where it is carrying information, and a table whose types happen to agree looks like the table it is today.

## What binds a cell to its heading

This is the whole of the design, and it is easy to mistake for a question about colour.

A stacked heading is useless unless a reader can tell, of a given cell, which of the stacked labels it answers to. That binding has to be carried by something the cell and the label can both wear. There are four candidates and they are not interchangeable.

**Vertical position in the stack** is exact, free, and independent of everything - and it exists only in the heading. A cell occupies one line and has no position to spend. So position can reinforce the binding but can never establish it, which is why the stack keeps a blank line for a type with no field in that column rather than compacting. Compacting buys a shorter heading and gives up the one channel that costs nothing. If it is ever changed back, this is what is lost.

**Hue** works in both places, which is why it is the obvious answer, and it is the one that quietly fails. Red-green deficiency affects about one man in twelve and about one woman in two hundred - a share large enough that a grid which is unreadable without hue is a grid that is unreadable, for a meaningful fraction of the people who open it, in a way none of them will report as a bug. Two consequences for the palette: it must vary in lightness as well as hue, so that it survives being seen in fewer dimensions than it was designed in, and no two types whose distinction actually matters should be separated by red against green alone.

**A glyph** works in both places and is the only channel that does what hue does, in a cell, without hue. That is the argument for it, and it is stronger than the one usually made: a glyph is not a courtesy added for a minority, it is the only thing on this list that can carry the binding into a cell for a reader who is not reading the colour. Hue then becomes what it is good at - grouping at a glance across the page, before anything is read.

**Weight and slant** work in both places and are being dropped from the type axis deliberately, having been the first idea. Italic in a monospaced face at eleven pixels is hard to spot and harder to name, and bold changes the apparent density of a column, which fights the `font-variant-numeric: tabular-nums` that `styles.css` says is the entire reason the arrangement exists. Two channels that both work are worth more than four of which two are guesses. They are the obvious thing to reach for when a seventh type appears; the answer then is a better glyph set, not a fifth channel.

So: hue and glyph carry the type, together and redundantly, and position reinforces the pair in the heading.

## The glyphs default to on

Not because most readers need them, but because the ones who do have no way of knowing the setting exists. Accessibility behind an opt-in reaches the people who already know what they are missing, and colour deficiency is mostly not experienced as a deficiency - a grid encoded in a channel someone cannot see looks to them like a grid encoded in nothing. The failure is silent on both sides.

Inverting it costs the other reader an annoyance rather than a capability, and an annoyed reader goes and finds the checkbox. That asymmetry is the whole argument, and it is the reason this is not a preference with a neutral default.

The preference itself follows the console's existing shape: global rather than per resource, because it is a fact about the person reading rather than about the node being read, held in `localStorage` through a wrapped read and write, because that call throws outright in a private window and a pane that would not render for want of a remembered preference is a worse failure than one that forgets. `ComponentPanel`'s `preview` and page size are the pattern; copy the nearest.

## Where the per-type field sets come from

From declarations, and not from which fields happened to arrive. The rule is already written one line above the site that would be tempted to break it: *"Columns come from declarations, never by guessing at whichever values happened to arrive."* A layout derived from a page would change when the page did, which is the one thing a heading must never do.

For the network grid the declarations are already in hand and are being thrown away, so that half is a matter of keeping what `columnsFor` receives.

For a row type discriminated by `kind`, `TypeNode` can already say it: `{ kind: 'union', options }` beside `{ kind: 'literal', value }` expresses a discriminated union today, and the per-type field sets fall out of the declaration with no new vocabulary on the wire. That matters because [`generic-viewer.md`](generic-viewer.md) set the condition explicitly - per-kind presentation metadata *only if the union genuinely cannot carry it* - and it can. So `SecurityRow` becomes the union it has always been in spirit, and nothing is added to `presentation` at all.

## What it costs

**Column alignment, where the types are mixed.** A slot holding a number from one type and a string from another gives up the thing the table's `tabular-nums` is for. The `kind-chips` filter already narrows a page to one type, and when it does the heading collapses to a single line and the column is homogeneous again - so the mixed view reads compact and the filtered view reads aligned, and the two features complete each other rather than competing. That is worth knowing before anyone tries to fix the alignment in the mixed view, which cannot be done and should not be attempted.

**Heading height**, which is at worst one line per type present, and in practice much less once shared fields collapse.

## The order

The layout rule first, as a plain function with a test beside it and no React anywhere near it - given the per-type field sets, produce the slots. Everything after it is rendering, and this is the part that is wrong quietly if it is wrong. `scopeSummaryFields` is the precedent and the reason: kept outside React so a non-visual test can pin the generic rule.

Then the stacked heading and the cell lookup in `BranchTable`, with the markup asserted and no palette yet. Then hue and glyph, as tokens with fallbacks, which is how every colour in `styles.css` is already written so that defining the tokens takes a consumer's palette and defining nothing looks like the console. Then the two producers - the network grid's grouping, and `SecurityRow` as a union - which are independent of each other and of everything above.

`tr.on` currently sets `color` as well as a background tint and an inset edge. The text colour is the one thing selection has to give up here, and the tint and the edge already mark a selected row perfectly well without it.

## Not decided

The glyph set. Geometric marks are the obvious family, filled ones read better than outlines at this size, and the constraint that will actually decide it is advance width in a monospaced column across the fallback chain - a glyph that is double-width somewhere ruins the alignment it was added to protect. This wants trying against a real font before it is written down.

Whether the stack compacts, which is a one-line change in the other direction and should be made only after looking at seven security kinds at once.

Whether the network grid's source triple, rather than `kind`, is what the type axis reads there. It probably is, since rows from different sources often carry no `kind` at all, but that is a question about one grid and not about the layout.

## What building the first three settled

*Appended after the layout rule, the stacked heading and the palette were built. The section above is left as it was written; this is what changed on contact.*

**The glyph set did not need the fixed-font trial it was waiting for, because the constraint dissolved.** The worry was real - the geometric marks are Ambiguous East Asian Width, so a fallback font may draw one double-width and shift every column after it - but choosing marks carefully is the wrong answer to it. An `inline-block` of exactly `1ch` advances by `1ch` whatever the font does with what is inside it, so a wide glyph spills into its own margin rather than into the layout. The set is then free to be chosen on how it reads: four filled marks and then the same four hollow, because channels are handed out in order, a filled mark reads better than an outline at eleven pixels, and fill becomes a cue of its own between the first four types and the second four. If the fixed width is ever taken off, this is what goes with it.

**A type whose every field is shared takes no channel at all.** It was not in the plan and it falls out of the rule: such a type only ever draws in plain columns, where one label means there is nothing to bind, so marking its rows would be ink spent on a distinction nobody has to make - and it would cost every stacked heading on the page one permanently blank line.

**A row of a type the table was not told about draws a blank row at the full width**, rather than falling back to the untyped columns. The fallback was the first thing written and it is wrong: it gives that one row a different number of cells from the header above it, which is a broken table and not a missing value.

**A cell empty because its type has no such field now says so**, faintly and separately from a cell empty because the value is. Only the layout knows the difference, and in a union of columns most blanks are the first kind - so this is a good part of the readability the whole exercise is for, and it was not in the plan either. It is drawn as a background *image* so that it composes with the selection tint rather than fighting it.

**Selection gave up its text colour**, keeping its background tint and its edge. In a table of several types that channel is carrying which type a cell belongs to, and a selection that overrode it would erase the binding for exactly the row somebody is looking hardest at.

**Eight channels, and a ninth type is deliberately left muted and unmarked.** Seven is the widest real case. A palette that wrapped round would give two types the same mark and hide what the ninth is actually telling you, which is that a single branch holding nine shapes of row has a scoping problem.

Still open: whether the stack compacts, and whether the network grid reads its source triple rather than `kind` as the type axis. Both are unchanged by any of the above.
