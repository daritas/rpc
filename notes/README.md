# Working material

Design conversations, adoption reviews, research comparisons and superseded roadmaps — the material the committed designs were distilled *from*. Kept because the reasoning is worth keeping; deliberately not part of the documentation site, because it records how decisions were reached rather than what was decided. The distilled results live in [`docs/`](../docs/), which is the site.

Two of these are specifications rather than conversations, and both have been built past their first phase — so a reader picking them up should know which parts are now code and which are still design. [Persistent components and online change](source-rpc-online-change-design/source-rpc-online-change-design-spec.md): Phases 1 to 3 are `@source-repo/continuity` — snapshots and held-state migration, then the managed runtime, consistent capture and the obligation manifest, then shadow activation, ownership epochs and fenced replacement — along with the portable form and the C# reader that Phase 4 turns on. Phase 4's journal and replay-assisted recovery are built too — a chained, append-only record whose retention is defined by what stays replayable, and `recoverForward`, which turns `failed-after-commit`'s *recover forward* into a plan or a refusal. Its format crosses languages too: `oven-journal.json` is read by both suites, which compute the same chain of hashes over it and reach the same replay plan from the same snapshot. [Node live diagnostics](source-rpc-node-live-diagnostics-design/source-rpc-node-live-diagnostics-design-spec.md): Phase 1, source-linked props and state, is `@source-repo/diagnostics` and the console's source view. Phase 2 is built as far as its telemetry — a variant can be proved a derivative (`admissibleVariant`, with the strip in `@source-repo/rpc-cli`), generated (`instrumentSource`), given somewhere to write (`RpcProbeSink`), and swapped in and out over continuity's `handOver`, which is section 16 step for step. Its telemetry is built too: an observation session with the design's twelve permissions, a deadline, a latest-value table published as state, an ordered trace as an event for a session permitted to keep one, and classified values withheld at capture rather than in the editor. Tracepoints are built too, with their conditions compiled into the derivative and checked against a constrained grammar rather than evaluated at runtime. Of Phase 3, safe-boundary breakpoints are built — the probe asks, the running handler finishes, and the barrier stops the next unit of work — along with the controller lease, the pause deadline and its three expiry actions, which is five of that phase's seven acceptance criteria. Exact pause is built too, on the worker model the feasibility note said it would need: the same supervisor driven by a worker-hosted component's gate stops the logic between two statements of a handler, and the kind of pause is a property of the mechanism rather than a label. Stepping is built too, as that gate with a frame-depth predicate: the design's five commands, with a cursor named by index because a step command reaches a parked thread and travels through shared memory. Both specs are now built to their ends. Those are advertised as `false` rather than omitted, and the capability set is now derived from what a host actually wired rather than declared, so a node that has no coordinator says so. The specs are unedited — their status lines describe what was ready to build when they were written, not what has since been built.

Also here: [what an exact pause would cost](exact-pause-feasibility.md) — a working pause gate, measured, with the limits established before anything was built on it. The finding that decides the shape of Phase 3 is that a parked thread freezes everything sharing it, so a pause scope of *one component* means a worker per component, and the expensive part is not the gate but moving component logic off the transport's thread in `@source-repo/rpc`.

Also here: [a review of the worker-thread work](worker-thread-nodes/worker-thread-nodes-review.md) — written against `39de1b8`, with what was built in answer appended to it. It found a doc comment promising a stricter boundary than the code enforced, which became `RpcValue`; it named the component facade as the gap that mattered, which became `serveComponentInWorker`; and its rule for the whole thing is worth keeping in mind before adding another placement: *private state by default, copied messages between nodes, explicit shared-memory primitives only where their concurrency protocol is itself part of the contract*.

Also here: [OPC UA as an aspect](opc-ua/opc-ua-as-aspect.md) — written against `@source-repo/aspects` after it shipped, and it reaches the conclusion the documentation package had already been renamed for: *an OPC UA interface is not an aspect; arrangements of OPC UA objects are*. OPC UA is a source and a protocol, the way Markdown is a format. It also gets identity right in a way worth keeping — a UA node's persistent identity is its namespace **URI** plus its identifier, never `ns=4;s=…`, because the index is session-local — which makes a browse path exactly what this repository already says a structural path is: a placement, not an identity.

Also here: [branches and rows](branches-and-rows.md) — how general the console's child-node view is, written after it was built, with the four decisions the serial-port fixture changed marked as such.

Also here: [the generic viewer](generic-viewer.md) — what a node has to say for a viewer it has never heard of to draw it well, written before the work rather than after. The finding that shapes it is that most of what such a viewer needs is already declared, already served and consumed by nobody: `getMany` and `getManyReference` exist and no resource says which field refers to where, the write verbs are implemented by two store packages and the console cannot write a row. So the first two thirds of it is finishing rather than starting, and the packages the survey proposes come last. The survey itself is in [`rpc-admin-capabilities/`](rpc-admin-capabilities/), an outside evaluation of react-admin and its enterprise modules against this repository, scrubbed of the product names it was written around.

Also here: [typed columns](typed-columns.md) — collapsing the generic grid's union of columns to one slot per type, written before the work. Its finding is that the interesting question is not colour but what can bind a cell to one line of a stacked heading: position exists only in the heading, hue fails silently for about one man in twelve, and a glyph is the only channel that carries the binding into a cell without it. So the glyphs default to on, and weight and slant — the first idea — are dropped rather than added to.

Also here: [ways in](ways-in.md) — showing a node's other interfaces in the console, written before anything is built: bindings rather than child nodes, three grades of reach that are not one decision, and default-closed on the shape the AI grants document already has.

Also here: [a knowledge system over Source RPC](knowledge-system-generality/source-rpc-general-knowledge-system-design-spec.md) and [Linear as its first adapter](knowledge-system-generality/source-rpc-linear-knowledge-adapter-design-spec.md) — proposed, not built, and kept mainly for the discipline in them: the rule that Source RPC transports and governs a knowledge capability while a separate provider owns knowledge semantics, and an anti-monster gate every proposed addition has to pass before it may enter the core. The two extensions they ask for are small and land on a seam the library already declared — `shape: 'tree'` says in its own comment that a tree is not served yet. A review against the implementation is appended to the first one.

Also here: field-trial feedback, starting with [the first fresh-agent session](session-feedback-2026-08-01.md) — a Claude with no prior knowledge of the project working the network through the MCP server, whose findings were filed into Linear.

---

## The rest, grouped

The prose above covers the documents whose status a reader most needs to know before trusting
them. These are the other twenty-nine — about 137,000 words that nothing in this repository
named until 2026-11-09. They are grouped by what they are, because that is the thing most worth
knowing before opening one: a proposed spec, a review of a spec, a research comparison, or
scrubbed reading notes.

### Proposed design specifications

Written as specs, with a status line. None of them is a description of code — check the status
line and then check the package.

| | |
|---|---|
| [`extending-rpc-design/source-rpc-next-design-spec.md`](extending-rpc-design/source-rpc-next-design-spec.md) | Source RPC 4.1–4.2. **Proposed.** |
| [`extending-rpc-design/source-rpc-distributed-context-topology-design-spec.md`](extending-rpc-design/source-rpc-distributed-context-topology-design-spec.md) | Distributed topology, context and shared state. **Proposed.** |
| [`ai-boundary/source-rpc-ai-boundary-design-spec.md`](ai-boundary/source-rpc-ai-boundary-design-spec.md) | The AI boundary: principals, grants, security administration. **Proposed.** This is where `aiGrants` is specified — a document a reviewer can diff, closed by default. |
| [`Sparkplug/source-rpc-sparkplug-projection-design-spec.md`](Sparkplug/source-rpc-sparkplug-projection-design-spec.md) | The Sparkplug B projection and the plant boundary. **Proposed.** The decision it implements — *Sparkplug outside; Source RPC inside* — is canon in the handbook. |
| [`Sparkplug/source-rpc-sparkplug-relay-design-spec.md`](Sparkplug/source-rpc-sparkplug-relay-design-spec.md) | The relay over Sparkplug B, a private tunnel named as one. **Proposed and deliberately deferred** — not built until a paying deployment states the need. |
| [`extending-rpc-design/deferred-results-proposal.md`](extending-rpc-design/deferred-results-proposal.md) | Returning a long job's result to the caller that asked for it: namespace withdrawal, deferred replies, two smaller fixes found on the way. |

### Reviews of those specs

Adversarial reads, kept for the findings. They open with a verdict rather than a title, which is
why they look like fragments in a file listing.

| | |
|---|---|
| [`ai-boundary/source-rpc-ai-boundary-design-spec-OpenAI-review.md`](ai-boundary/source-rpc-ai-boundary-design-spec-OpenAI-review.md) | Review of the AI-boundary spec. Opens: *"the strongest Source RPC architecture documents so far"* — then the objections. |
| [`extending-rpc-design/source-rpc-distributed-context-topology-design-spec-review-review.md`](extending-rpc-design/source-rpc-distributed-context-topology-design-spec-review-review.md) | A review **of a review** — the second-order read of the topology spec's developer review. The name is accurate, not a typo. |
| [`csharp-and-rpc-review.md`](csharp-and-rpc-review.md) | A framework review pinned to commit `03838ba`, when `@source-repo/rpc` was 5.0.1. Read the pin: the repository has moved. |
| [`openai-msgrpc-review.md`](openai-msgrpc-review.md) | Whether to keep or replace the framework. Conclusion: **keep and harden.** |
| [`ChatGPT-RPC task DEV-379 review.md`](ChatGPT-RPC%20task%20DEV-379%20review.md) | A task review. A chat export; its filename carries spaces. |

### Research comparisons

Where an outside library or product was studied to decide what to take.

| | |
|---|---|
| [`tanstack-query-comparison.md`](tanstack-query-comparison.md) | What TanStack Query fakes, and where this does the same thing one level down. The library README already sends a browser-plus-one-backend reader to tRPC, so this one earns its place. |
| [`tanstack-query-comparison-review.md`](tanstack-query-comparison-review.md) | The review of it. Its praised insight is the demand-driven-query distinction. |
| [`state-layer-plan.md`](state-layer-plan.md) | **What to build after those two**, ordered by what has to be true first. The largest live note here. |
| [`Sparkplug/OpenAI chat about MQTT Sparkplug B.md`](Sparkplug/OpenAI%20chat%20about%20MQTT%20Sparkplug%20B.md) | The 2026-08-01 conversation behind the Sparkplug decision. A chat export; spaces in the filename. |
| [`webport-scada-comparisons/process-value-attributes.md`](webport-scada-comparisons/process-value-attributes.md) | How a SCADA product models a tag's attributes. |
| [`webport-scada-comparisons/process-value-scoping.md`](webport-scada-comparisons/process-value-scoping.md) | How it scopes process values — prefix-based binding and the alternatives. |
| [`webport-scada-comparisons/symbol-library.md`](webport-scada-comparisons/symbol-library.md) | Where standard suffixes and their matching rules are defined. |

### Working notes

Short, specific, and each written because something in the code was about to be decided wrongly.

| | |
|---|---|
| [`setting-state-from-a-console.md`](setting-state-from-a-console.md) | Why inferring a setter from a method's name is the wrong mechanism — prompted by what the context console was doing and should stop doing. |
| [`component-snapshot-patches.md`](component-snapshot-patches.md) | The component channel sends state whole, deliberately. What sending a delta would take, and why the usual objection does not apply. |
| [`console-security.md`](console-security.md) | Making the existing security mechanisms visible, explainable and testable from the generic console. |
| [`network-scope-data-provider.md`](network-scope-data-provider.md) | A network scope over `DataProvider` resources, reusing the scope-tree and leaf-grid arrangement. |
| [`new-stuff.md`](new-stuff.md) | A July wish-list — reflection for runtime type checking, a "swagger call", a scanner with a dialog. Kept because **most of it was built**: `msgrpc.describe` is that swagger call and the console is the scanner beside it, as [`ways-in.md`](ways-in.md) records. It sat at the repository root as `new stuff.md` until 2026-11-09, where a space in the filename made it both unsearchable and the first thing a visitor saw. |
| [`tooling-roadmap.md`](tooling-roadmap.md) | What the CLI and console could become for testing and debugging a network of devices, written after a pass over the existing commands and the MQTT tools. |

### `rpc-admin-capabilities/` — scrubbed reading notes

Design input taken from studying React Admin. **Scrubbed**, and the folder's own framing is the
thing to keep: the commercial application layer above Source RPC is not this repository's
business. Read them for ideas about what a generic admin surface owes a user, not as a plan.

| | |
|---|---|
| [`rpc-admin-capabilities-summary.md`](rpc-admin-capabilities/rpc-admin-capabilities-summary.md) | The summary, and the case for `@source-repo/react`. |
| [`making-ui-generally-useful.md`](rpc-admin-capabilities/making-ui-generally-useful.md) | What makes a generic UI generally useful rather than merely generic. |
| [`react-admin-useful-ideas.md`](rpc-admin-capabilities/react-admin-useful-ideas.md) | Feature-by-feature reading notes. |
| [`react-admin-enterprise-edition-useful-ideas.md`](rpc-admin-capabilities/react-admin-enterprise-edition-useful-ideas.md) | The same for the enterprise edition. |

### `archived/`

Superseded, kept for the reasoning. The distinction from the rest of `notes/` is worth holding:
everything else here records how a live decision was reached; these two record how a decision that
has since been *replaced* was reached.

| | |
|---|---|
| [`archived/extensions-and-ecosystem-review.md`](archived/extensions-and-ecosystem-review.md) | The review that drove the revision in [`../docs/extensions-and-ecosystem.md`](../docs/extensions-and-ecosystem.md), kept for the reasoning behind each resolution. |
| [`archived/rpc-extensions-chat.md`](archived/rpc-extensions-chat.md) | 19,700 words — the largest file in the repository after the changelog. A conversation about extending the framework: properties on a remote class, server-driven UI, scripted nodes, and how far toward the metal the model can be pushed. |

---

**A document in `notes/` that this file does not name is a document nobody will find.** Add it
here when you add it there — a line is enough, and saying which of the five kinds it is matters
more than summarising it.

