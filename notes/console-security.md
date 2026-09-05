# Security in the web console

## Goal

Make Source RPC's existing security mechanisms visible, explainable and testable from the generic
network console without turning the open-source console into an identity, policy or compliance
product.

The boundary is:

> Nodes enforce security. The console observes, explains, tests and invokes already-authorized
> operations. It is not the source of truth for users, roles, policies, credentials, approvals or
> audit retention.

The primitives already have direct tests: authentication, authorization, token identities, frame
signing, AI grants, component authority and elevation. What is missing is a coherent operator-facing
workflow and an end-to-end fixture exercising them together through the web console.

## Open-source console scope

### Security workspace

Add **Security** as a network-wide left-menu workspace. Its primary view is a DataProvider-backed
posture/finding grid over the visible peers. Security is network context rather than a detail of one
selected resource, so it does not belong among the right-side Events, Actions and Chat tabs.

The workspace shows:

- peer, component and transport security posture;
- whether a fact was verified by this link, reported by a peer, inferred locally or is unknown;
- authentication mode and the identity vouched for by the current link;
- signing requirement and verification state;
- TLS and relay trust posture;
- validation and introspection posture;
- safe summaries of active grants and elevations;
- authority requirements and current lease state where disclosure is authorized;
- findings such as unauthenticated relay, unsigned broker traffic, insecure TLS, permanent
  elevation and unknown posture.

No transport credential, token, private/public key material, reusable authorization header or
secret-bearing endpoint reaches `describe()`, console RPC answers, browser security state, posture
exports, metadata-only traffic, errors or snapshots. Application events and explicitly enabled
traffic payloads are different: they are operator-requested application data and are displayed and
exported verbatim.

### Access explanation

For a selected RPC method, explain its declared effect, semantics, authority requirement and the
known grant/elevation layers. The first implementation is static and says **unknown at call time**
where a custom authorizer decides from information the console cannot see.

A later `explainAccess`/authorization dry-run is acceptable only when it:

- invokes nothing;
- is itself authorized;
- reports bounded reason codes rather than policy internals;
- distinguishes an enforcement decision from a peer's unverified claim.

### Identity and events

Show the console page's authenticated identity, roles and trust source without secrets. Normalize
authentication failures, authorization refusals, AI grant decisions, signature failures, authority
changes, elevation changes and transport trust changes into the existing bounded diagnostic event
model. The first three target-side transitions now travel over an opt-in, ordinarily authorized
`msgrpc.security` event with closed codes and no policy reason or call arguments. JSONL export is
useful for debugging but is explicitly not a durable compliance audit log.

Transport trust changes are observed separately by comparing descriptions that the console already
needed. The first description establishes a baseline; later changes to public endpoint,
authentication, encryption, signing, relay, or transport membership enter the same bounded history.
Presence alone never causes an introspection probe or a security alarm.

### Controls

The open console may acquire and release existing component authority because those are ordinary,
already-authorized operational actions. Lowering or closing a temporary elevation can follow only
if an explicit authorized RPC operation exists.

This authority slice is implemented as declared Security DataProvider row actions. A known row can
acquire or renew a bounded one-, five-, or fifteen-minute lease and release only authority held by
the console identity. The row id is validated against the target's current disclosed authority
records before the existing `$acquire` or `$release` is invoked. Unknown rows and takeover have no
action.

Creating identities, issuing or revoking tokens, changing grants, opening elevations, editing policy
and managing certificates remain configuration/CLI operations in the open-source console.

## Paid product boundary

The commercial product owns capabilities whose real cost is lifecycle, durability, integration,
liability and support rather than drawing controls:

- human accounts, organizations, teams and tenant isolation;
- SSO/OIDC/SAML, MFA/passkeys and SCIM;
- central RBAC/ABAC policy authoring, versions, approvals, simulation, rollout and rollback;
- separation of duties and signed approval workflows;
- end-user identity propagation and delegated sessions through relays and gateways;
- token, key and certificate issuance, storage, rotation, revocation, vault/HSM/KMS and PKI/mTLS;
- durable tamper-evident audit trails, retention, search and evidence export;
- SIEM, alerting, incident, on-call and compliance integrations;
- fleet history, posture trends, remote-access gateways, segmentation, HA, backup and disaster
  recovery;
- fine-grained row/field redaction and resource policy;
- enterprise migrations, compatibility guarantees, SLAs and support.

The open console must not grow a partial version of these features that appears authoritative but
cannot maintain their lifecycle or guarantees.

## Trust vocabulary

Every security fact carries its evidence:

```ts
type RpcSecurityEvidence = 'link' | 'peer' | 'local' | 'unknown'

interface RpcSecurityFact<T> {
    value?: T
    evidence: RpcSecurityEvidence
}
```

- `link`: established or verified by the transport on which this observer sees the peer;
- `peer`: self-reported by the described peer;
- `local`: inferred from configuration held by this console process;
- `unknown`: not safely knowable from the available surface.

The UI never collapses these into a single “secure” badge. A peer reporting that it requires
signatures is different from this link verifying a signature.

## Delivery

### 1. Secret-free posture contract

- Define the vocabulary and the facts a transport/node can safely announce.
- Extend transport descriptions with bounded authentication, signing, encryption and relay posture.
- State evidence/provenance and `unknown` explicitly.
- Test every transport and test that credential-shaped values cannot enter a description.

### 2. Read-only Security workspace

- Compose peer descriptions into a network security DataProvider.
- Show posture rows and derived findings in the generic tree-scope-grid.
- Add filters for peer, transport, evidence, severity and finding kind.
- Preserve partial results when peers are offline, unauthorized or undescribed.

### 3. Identity and access explanation

- Expose a safe “who am I on this link?” answer.
- Add method-level static explanations.
- Add a gated dry-run contract only if static explanation proves insufficient.

The first two items are now implemented. The console reports only the browser-to-console identity
and the method panel explicitly distinguishes it from the console-to-target identity that is
actually authorized. No dry-run contract has been justified yet.

### 4. Operational security events and authority

- Normalize bounded security events into Problems/Operations.
- Surface authority holders, expiry and generation where authorized.
- Reuse the existing acquire/release operations; add no parallel control protocol.

The first operational slice is now implemented. Transport rejections and relayed-call
authorization/authority refusals are kept as a 200-entry, secret-free console history and projected
through the Security DataProvider. Authorized peers expose live authority holder, expiry and
generation through a query kept separate from structural `describe()` caching. Described peers now
publish AI access decisions, authority changes and elevation changes through the ordinarily
authorized `msgrpc.security` event. The bridge has no target-side history and carries only closed
codes and allow-listed identifiers/state, so this remains diagnostic and does not claim
completeness or durable audit semantics. Public transport posture is now compared across later
descriptions, including same-name peer replacement, and emits bounded `transport-change` history.
The DataProvider labels derived posture `current` and observed transitions `history`. Known
authority rows now reuse `$acquire` and `$release` through declared actions with bounded lease
choices, an explicit confirmation, immediate state refresh, and no takeover surface. Authority
answers are reconciled by their monotonic generation (and renewal expiry), while reads begun before
an action or peer-incarnation change are discarded, so the five-second poll cannot flash an older
holder after a successful action.

### 5. End-to-end fixture

Create a security demonstration network containing anonymous, viewer, operator, engineer and AI
identities; authenticated and unauthenticated Socket.IO links; signed and unsigned MQTT; a relay;
methods across the effect ladder; authority-controlled methods; and expiring grants/elevations.

Exercise successful and refused calls, stolen identity/name mismatch, expiry, authority contention,
offline/stale peers, custom-authorizer unknown decisions, reconnect, transport changes and complete
secret redaction from DOM, traffic, exports, errors and snapshots.

The first cross-layer acceptance fixture is implemented in `packages/cli/src/security-fixture.test.ts`.
It covers authenticated Socket.IO roles behind an anonymous browser link, the complete effect
ladder, a bounded AI grant, an expiring elevation, authority contention and expiry, identity-name
mismatch, reconnect, signed/unsigned MQTT, normalized console events, and token/signing-secret
redaction from browser-facing RPC answers and snapshots. It now also replaces a live authenticated
peer with an open peer under the same name, asserting the offline/stale transition, presence
history, reconnect, fresh transport posture, and the recorded authentication downgrade. Web
boundary tests now carry hostile
credential-bearing data through the Security DataProvider, generic renderer, traffic view and
shared JSONL serializer. Metadata traffic strips arguments, results and detailed errors at the bus
and again at the browser allow-list; the filtered traffic view can be exported. Explicit payload
capture remains deliberately verbatim and outside the redaction claim.

## Not now

- browser forms for secrets or credentials;
- editing users, roles, grants, policy or certificates;
- durable audit/compliance claims;
- approval workflows or remote access;
- a green “secure” summary that hides evidence or unknown state.

## MCP access and multiple AI personas

Security will also be exposed to MCP through generic DataProvider tools. The MCP adapter will reuse
`SecurityDataProvider`; it will not grow a second security model or publish an aggregate whose
identity launders calls to its targets. Reads leave under the MCP peer's identity, and declared
authority actions invoke the target's existing `$acquire`/`$release` directly.

Multiple personas are separate principals. The first deployable shape is now implemented in task
files: each `type: "mcp"` role is HTTP-only and has its own RPC peer name, bus authentication,
port, and optional `mcpAuth` token file. The target therefore distinguishes a PLC-development
assistant from a security-administration assistant even when one host process supervises both.
Neither prompts nor MCP tool arguments can switch that identity.

The MCP-local provider registry, `list_data_resources`, `read_data`, and generic declared-action
invocation are implemented. The current Security projection is hydrated from the MCP observer's
authorized descriptions and authority queries with bounded fan-out and unknown/refused peers
preserved. `observe` needs ordinary authorization; authority acquisition calls the target directly
and needs `ai.tool.write`. Bounded `msgrpc.security` collection now uses one authorized subscription
per described peer after the first Security read, rebuilds the closed event vocabulary without
spreading remote values, retains the newest 200 events, and projects them through the same Events
branch. Coverage counts and an explicit unavailable-source finding prevent zero events from
claiming complete silence after a refused subscription; the same-name replacement fixture proves
the returned process is followed afresh. Future policy or grant administration remains
`security-admin`/`ai.sponsor` and must
additionally prevent self-expansion.
