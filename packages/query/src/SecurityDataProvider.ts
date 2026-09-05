import {
    pageEntries,
    publicTransportEndpoint,
    type RpcDataMethod,
    type RpcDataProvider,
    type RpcDataResource,
    type RpcDataResult,
    type RpcDataParams,
    type RpcGetChildrenParams,
    type RpcGetChildrenResult,
    type RpcGetListParams,
    type RpcGetListResult,
    type RpcGetOneParams,
    type RpcGetOneResult,
    type DescribedComponentAuthority,
    type RpcSecurityEvidence,
    type RpcTransportDescription,
    type RpcElevation
} from '@source-repo/rpc'

export const SECURITY_RESOURCE_PATH = ['security'] as const

export type SecurityFindingKind =
    | 'unknown-peer-posture'
    | 'unknown-transport-posture'
    | 'validation-disabled'
    | 'unauthenticated-relay'
    | 'cleartext-remote-link'
    | 'tls-verification-disabled'
    | 'unsigned-mqtt'
    | 'permanent-elevation'

export type SecuritySeverity = 'high' | 'medium' | 'low' | 'unknown'

export interface SecurityRow {
    readonly name: string
    readonly kind:
        | 'security.identity'
        | 'security.peer'
        | 'security.transport'
        | 'security.elevation'
        | 'security.authority'
        | 'security.authority-unknown'
        | 'security.event'
        | 'security.finding'
    readonly category: 'identity' | 'peer' | 'transport' | 'elevation' | 'authority' | 'event' | 'finding'
    readonly peer: string
    readonly evidence: RpcSecurityEvidence | 'mixed'
    readonly severity?: SecuritySeverity
    readonly finding?: SecurityFindingKind
    readonly message?: string
    readonly validating?: boolean
    readonly transport?: string
    readonly protocol?: string
    readonly role?: string
    readonly endpoint?: string
    readonly authentication?: string
    readonly authenticationEvidence?: RpcSecurityEvidence
    readonly encryption?: string
    readonly encryptionEvidence?: RpcSecurityEvidence
    readonly signing?: string
    readonly signingEvidence?: RpcSecurityEvidence
    readonly relay?: string
    readonly relayEvidence?: RpcSecurityEvidence
    readonly capability?: string
    readonly reason?: string
    readonly since?: number
    readonly until?: number
    readonly grantedBy?: string
    readonly identity?: string
    readonly roles?: readonly string[]
    readonly source?: string
    readonly sourceEvidence?: RpcSecurityEvidence
    readonly namespace?: string
    readonly holder?: string
    readonly expiresAt?: number
    readonly generation?: number
    readonly methods?: readonly string[]
    readonly event?: string
    readonly at?: number
    readonly code?: string
    readonly method?: string
    readonly target?: string
    readonly effect?: string
    readonly grant?: string
    readonly allowed?: boolean
    readonly previousHolder?: string
    /** Current derived posture or an observed transition retained in the bounded history. */
    readonly timeframe?: 'current' | 'history'
    readonly previous?: string
    readonly current?: string
}

export interface SecurityDataProviderOptions {
    /** Presence is authoritative for which peers exist; a missing description stays visibly unknown. */
    readonly peers: readonly string[]
    readonly descriptions: Readonly<Record<string, SecurityDescription | undefined>>
    /** A refusal changes the explanation, never the trust level. Its raw message is not exposed. */
    readonly refused?: Readonly<Record<string, unknown>>
    /** Name of this observation boundary even before its identity facts are available. */
    readonly observerLabel?: string
    /** What this observer established about the link carrying its requests. */
    readonly observer?: SecurityObserver
    /** Missing entries are unknown/refused; an empty array is a known answer with no guarded components. */
    readonly authorities?: Readonly<Record<string, readonly DescribedComponentAuthority[] | undefined>>
    readonly events?: readonly SecurityDataEvent[]
    readonly epoch?: string
    readonly revision?: number
}

export type SecurityDataEventKind =
    | 'authentication-failure'
    | 'signature-failure'
    | 'transport-rejection'
    | 'authorization-refused'
    | 'authority-refused'
    | 'ai-access'
    | 'authority-change'
    | 'elevation-change'
    | 'transport-change'

export interface SecurityDataEvent {
    readonly id: number
    readonly at: number
    readonly kind: SecurityDataEventKind
    readonly severity: 'high' | 'medium' | 'low'
    readonly evidence: 'link' | 'peer'
    readonly peer?: string
    readonly target?: string
    readonly namespace?: string
    readonly method?: string
    readonly code: string
    readonly effect?: string
    readonly grant?: string
    readonly allowed?: boolean
    readonly capability?: string
    readonly holder?: string
    readonly previousHolder?: string
    readonly expiresAt?: number
    readonly generation?: number
    readonly until?: number
    readonly transport?: string
    readonly previous?: string
    readonly current?: string
}

const remoteOperationalCodes = {
    'ai-access': new Set(['allowed', 'refused']),
    'authority-change': new Set(['acquired', 'renewed', 'taken', 'released', 'expired']),
    'elevation-change': new Set(['opened', 'lowered', 'expired'])
} as const

const safeRemoteString = (value: unknown): string | undefined => (typeof value === 'string' && value.length <= 256 ? value : undefined)
const safeRemoteNumber = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)

/**
 * Rebuild peer-reported operational evidence from its closed, secret-free vocabulary.
 * Never spread the remote value: it may attach private policy reasons, claims or credentials.
 */
export const securityEventFromRemote = (target: string, value: unknown, observedAt = Date.now()): Omit<SecurityDataEvent, 'id'> | undefined => {
    if (!value || typeof value !== 'object') return undefined
    const from = value as Record<string, unknown>
    const kind = safeRemoteString(from.kind) as keyof typeof remoteOperationalCodes | undefined
    const code = safeRemoteString(from.code)
    if (!kind || !Object.hasOwn(remoteOperationalCodes, kind) || !code || !remoteOperationalCodes[kind].has(code as never)) return undefined
    const until = safeRemoteNumber(from.until)
    const severity: SecurityDataEvent['severity'] =
        kind === 'elevation-change' && code === 'opened' && until === undefined
            ? 'high'
            : (kind === 'elevation-change' && code === 'opened') ||
                (kind === 'authority-change' && code === 'taken') ||
                (kind === 'ai-access' && code === 'refused')
              ? 'medium'
              : 'low'
    const strings = Object.fromEntries(
        ['peer', 'namespace', 'method', 'effect', 'grant', 'capability', 'holder', 'previousHolder'].flatMap((field) => {
            const held = safeRemoteString(from[field])
            return held === undefined ? [] : [[field, held]]
        })
    )
    const numbers = Object.fromEntries(
        ['expiresAt', 'generation', 'until'].flatMap((field) => {
            const held = safeRemoteNumber(from[field])
            return held === undefined ? [] : [[field, held]]
        })
    )
    return {
        at: observedAt,
        kind,
        severity,
        evidence: 'peer',
        target,
        ...strings,
        ...numbers,
        ...(typeof from.allowed === 'boolean' ? { allowed: from.allowed } : {}),
        code
    }
}

/** Process-local, newest-first evidence. This is diagnostic history, never a durable audit log. */
export class SecurityEventHistory {
    private readonly limit: number
    private readonly held: SecurityDataEvent[] = []
    private counter = 0

    constructor(limit = 200) {
        this.limit = Math.max(1, Math.floor(limit))
    }

    record(event: Omit<SecurityDataEvent, 'id'>): SecurityDataEvent {
        const recorded = { ...event, id: ++this.counter }
        this.held.unshift(recorded)
        if (this.held.length > this.limit) this.held.length = this.limit
        return recorded
    }

    snapshot(): readonly SecurityDataEvent[] {
        return [...this.held]
    }
}

export interface SecurityObserver {
    readonly authentication: 'authenticated' | 'none' | 'unknown'
    readonly authenticationEvidence: RpcSecurityEvidence
    readonly source: string
    readonly sourceEvidence: RpcSecurityEvidence
    readonly identity?: string
    readonly roles?: readonly string[]
}

/** The safe subset of describe() used by this projection. */
export interface SecurityDescription {
    readonly name: string
    readonly validating: boolean
    readonly transports?: readonly RpcTransportDescription[]
    readonly elevated?: readonly RpcElevation[]
}

const securityResource: RpcDataResource = {
    path: SECURITY_RESOURCE_PATH,
    verbs: ['getChildren', 'getList', 'getOne'],
    shape: 'tree',
    label: 'Security',
    row: {
        kind: 'object',
        fields: {
            name: { type: { kind: 'string' } },
            kind: { type: { kind: 'string' } },
            category: { type: { kind: 'string' } },
            peer: { type: { kind: 'string' } },
            severity: { type: { kind: 'string' }, optional: true },
            finding: { type: { kind: 'string' }, optional: true },
            message: { type: { kind: 'string' }, optional: true },
            transport: { type: { kind: 'string' }, optional: true },
            protocol: { type: { kind: 'string' }, optional: true },
            authentication: { type: { kind: 'string' }, optional: true },
            encryption: { type: { kind: 'string' }, optional: true },
            signing: { type: { kind: 'string' }, optional: true },
            relay: { type: { kind: 'string' }, optional: true },
            evidence: { type: { kind: 'string' } },
            capability: { type: { kind: 'string' }, optional: true },
            identity: { type: { kind: 'string' }, optional: true },
            roles: { type: { kind: 'array', items: { kind: 'string' } }, optional: true },
            source: { type: { kind: 'string' }, optional: true },
            namespace: { type: { kind: 'string' }, optional: true },
            holder: { type: { kind: 'string' }, optional: true },
            expiresAt: { type: { kind: 'number' }, optional: true },
            generation: { type: { kind: 'number', integer: true }, optional: true },
            methods: { type: { kind: 'array', items: { kind: 'string' } }, optional: true },
            event: { type: { kind: 'string' }, optional: true },
            at: { type: { kind: 'number' }, optional: true },
            code: { type: { kind: 'string' }, optional: true },
            method: { type: { kind: 'string' }, optional: true },
            target: { type: { kind: 'string' }, optional: true },
            effect: { type: { kind: 'string' }, optional: true },
            grant: { type: { kind: 'string' }, optional: true },
            allowed: { type: { kind: 'boolean' }, optional: true },
            previousHolder: { type: { kind: 'string' }, optional: true },
            timeframe: { type: { kind: 'string' }, optional: true },
            previous: { type: { kind: 'string' }, optional: true },
            current: { type: { kind: 'string' }, optional: true }
        },
        additional: true
    },
    presentation: {
        defaultColumns: ['timeframe', 'severity', 'finding', 'event', 'peer', 'target', 'namespace', 'holder', 'transport', 'authentication', 'encryption', 'signing', 'relay', 'evidence', 'message'],
        representation: 'name'
    },
    actions: [
        { method: 'acquireAuthority', label: 'acquire', confirm: true, kinds: ['security.authority'] },
        { method: 'releaseAuthority', label: 'release mine', confirm: true, kinds: ['security.authority'] }
    ]
}

export const SECURITY_RESOURCE: RpcDataResource = securityResource

type BranchKind = 'identity' | 'findings' | 'events' | 'peers' | 'peer' | 'transports' | 'elevations' | 'authorities'

interface SecurityBranch {
    readonly id: string
    readonly kind: BranchKind
    readonly label: string
    readonly peer?: string
    readonly parent?: string
    readonly hasChildren: boolean
    readonly value: Readonly<Record<string, unknown>>
}

const findingsId = JSON.stringify(['security', 'findings'])
const identityId = JSON.stringify(['security', 'identity'])
const eventsId = JSON.stringify(['security', 'events'])
const peersId = JSON.stringify(['security', 'peers'])
const peerId = (peer: string) => JSON.stringify(['security', 'peer', peer])
const sectionId = (peer: string, section: 'transports' | 'elevations' | 'authorities') => JSON.stringify(['security', section, peer])
const rowId = (category: SecurityRow['category'], peer: string, identity: readonly unknown[]) => JSON.stringify(['security-row', category, peer, ...identity])
/** Stable action subject for one real authority record; unknown placeholder rows deliberately use another identity. */
export const securityAuthorityRowId = (peer: string, namespace: string): string => rowId('authority', peer, ['component', namespace])

/** Decode only the opaque authority-row identity owned by this provider. */
export const securityAuthorityTargetOf = (id: string): { peer: string; namespace: string } | undefined => {
    try {
        const value: unknown = JSON.parse(id)
        if (
            !Array.isArray(value) ||
            value.length !== 5 ||
            value[0] !== 'security-row' ||
            value[1] !== 'authority' ||
            typeof value[2] !== 'string' ||
            value[3] !== 'component' ||
            typeof value[4] !== 'string'
        )
            return undefined
        return { peer: value[2], namespace: value[4] }
    } catch {
        return undefined
    }
}

const evidenceOf = (transport: RpcTransportDescription): RpcSecurityEvidence | 'mixed' => {
    if (!transport.security) return 'unknown'
    const evidence = new Set(Object.values(transport.security).map((fact) => fact.evidence))
    return evidence.size === 1 ? [...evidence][0] : 'mixed'
}

const isRemoteEndpoint = (endpoint: string | undefined): boolean => {
    if (!endpoint) return false
    try {
        const host = new URL(endpoint).hostname.toLowerCase()
        return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1' && host !== '[::1]'
    } catch {
        // An endpoint that cannot be classified safely does not justify a clear-text finding.
        return false
    }
}

const unknownTransport = (transport: RpcTransportDescription): boolean => {
    if (!transport.security) return true
    return Object.values(transport.security).some((fact) => fact.evidence === 'unknown' || fact.value === undefined)
}

/**
 * A local, read-only projection of descriptions into browsable posture rows and conservative findings.
 *
 * It never asks a peer, grants authority or interprets credentials. In particular, a credential
 * being presented is not called authentication, and a fact reported by a peer is not upgraded to
 * link evidence. Unknown descriptions and custom transports remain unknown rather than secure.
 */
export class SecurityDataProvider implements RpcDataProvider {
    private readonly peers: readonly string[]
    private readonly descriptions: SecurityDataProviderOptions['descriptions']
    private readonly refused: NonNullable<SecurityDataProviderOptions['refused']>
    private readonly observerLabel: string
    private readonly observer?: SecurityObserver
    private readonly authorities: NonNullable<SecurityDataProviderOptions['authorities']>
    private readonly events: readonly SecurityDataEvent[]
    private readonly epoch: string
    private readonly revision: number

    constructor(options: SecurityDataProviderOptions) {
        this.peers = [...new Set(options.peers)].sort()
        this.descriptions = options.descriptions
        this.refused = options.refused ?? {}
        this.observerLabel = options.observerLabel ?? 'Current observer'
        this.observer = options.observer
        this.authorities = options.authorities ?? {}
        this.events = options.events ?? []
        this.epoch = options.epoch ?? 'security-view'
        this.revision = options.revision ?? 0
    }

    dataResources(): readonly RpcDataResource[] {
        return [securityResource]
    }

    dataRequest(method: RpcDataMethod, resource: readonly string[], params: RpcDataParams): RpcDataResult {
        if (resource.length !== 1 || resource[0] !== SECURITY_RESOURCE_PATH[0]) throw new Error(`security view serves security, not ${resource.join('.')}`)
        switch (method) {
            case 'getChildren':
                return this.getChildren(params as RpcGetChildrenParams)
            case 'getList':
                return this.getList(params as RpcGetListParams)
            case 'getOne':
                return this.getOne(params as RpcGetOneParams)
            case 'getMany':
            case 'getManyReference':
                throw new Error(`security view does not answer ${method}`)
        }
    }

    private branches(): readonly SecurityBranch[] {
        const findings = this.rows().filter(([, row]) => row.category === 'finding').length
        const roots: SecurityBranch[] = [
            {
                id: identityId,
                kind: 'identity',
                label: this.observerLabel,
                hasChildren: false,
                value: {
                    name: this.observerLabel,
                    authentication: this.observer?.authentication ?? 'unknown',
                    evidence: this.observer?.authenticationEvidence ?? 'unknown'
                }
            },
            { id: findingsId, kind: 'findings', label: 'Findings', hasChildren: false, value: { name: 'Findings', findings } },
            { id: eventsId, kind: 'events', label: 'Events', hasChildren: false, value: { name: 'Events', events: this.events.length } },
            { id: peersId, kind: 'peers', label: 'Peers', hasChildren: this.peers.length > 0, value: { name: 'Peers', peers: this.peers.length } }
        ]
        const children = this.peers.flatMap((peer): SecurityBranch[] => {
            const description = this.descriptions[peer]
            const transports = description?.transports?.length ?? 0
            const elevations = description?.elevated?.length ?? 0
            const id = peerId(peer)
            return [
                {
                    id,
                    kind: 'peer',
                    label: peer,
                    peer,
                    parent: peersId,
                    hasChildren: true,
                    value: {
                        name: peer,
                        posture: description ? 'described' : 'unknown',
                        evidence: description ? 'peer' : 'unknown',
                        transports,
                        elevations,
                        findings: this.rows().filter(([, row]) => row.peer === peer && row.category === 'finding').length
                    }
                },
                {
                    id: sectionId(peer, 'transports'),
                    kind: 'transports',
                    label: 'Transports',
                    peer,
                    parent: id,
                    hasChildren: false,
                    value: { name: 'Transports', peer, transports, evidence: description?.transports === undefined ? 'unknown' : 'peer' }
                },
                {
                    id: sectionId(peer, 'elevations'),
                    kind: 'elevations',
                    label: 'Elevations',
                    peer,
                    parent: id,
                    hasChildren: false,
                    value: { name: 'Elevations', peer, elevations, evidence: description ? 'peer' : 'unknown' }
                },
                {
                    id: sectionId(peer, 'authorities'),
                    kind: 'authorities',
                    label: 'Authorities',
                    peer,
                    parent: id,
                    hasChildren: false,
                    value: {
                        name: 'Authorities',
                        peer,
                        ...(this.authorities[peer]
                            ? { authorities: this.authorities[peer].length, evidence: 'peer' }
                            : { evidence: 'unknown' })
                    }
                }
            ]
        })
        return [...roots, ...children]
    }

    private getChildren(params: RpcGetChildrenParams): RpcGetChildrenResult {
        const parent = params.parentId
        const branches = this.branches().filter((branch) => (parent === undefined ? branch.parent === undefined : branch.parent === parent))
        const byId = new Map(branches.map((branch) => [branch.id, branch] as const))
        const page = pageEntries(
            branches.map((branch) => [branch.id, branch.value] as const),
            params
        )
        return {
            ...page,
            grouping: page.ids.map(() => true),
            hasChildren: page.ids.map((id) => byId.get(id)?.hasChildren ?? false),
            epoch: this.epoch,
            revision: this.revision
        }
    }

    private getList(params: RpcGetListParams): RpcGetListResult {
        const branch = params.under === undefined ? undefined : this.branches().find((one) => one.id === params.under)
        if (params.under !== undefined && !branch)
            return { ids: [], data: [], total: 0, hasMore: false, epoch: this.epoch, revision: this.revision }
        const rows = this.rows().filter(([, row]) => {
            if (!branch) return true
            if (branch.kind === 'peers') return row.category !== 'identity' && row.category !== 'event'
            if (branch.kind === 'identity') return row.category === 'identity'
            if (branch.kind === 'findings') return row.category === 'finding'
            if (branch.kind === 'events') return row.category === 'event'
            if (branch.kind === 'peer') return row.peer === branch.peer
            if (branch.kind === 'transports') return row.peer === branch.peer && row.category === 'transport'
            if (branch.kind === 'elevations') return row.peer === branch.peer && row.category === 'elevation'
            return row.peer === branch.peer && row.category === 'authority'
        })
        return { ...pageEntries(rows, params), epoch: this.epoch, revision: this.revision }
    }

    private getOne(params: RpcGetOneParams): RpcGetOneResult {
        const row = this.rows().find(([id]) => id === params.id)
        return { ...(row ? { data: row[1] } : {}), epoch: this.epoch, revision: this.revision }
    }

    private rows(): readonly (readonly [string, SecurityRow])[] {
        const current = ([id, row]: readonly [string, SecurityRow]) => [id, { ...row, timeframe: 'current' as const }] as const
        return [current(this.identityRow()), ...this.eventRows(), ...this.peers.flatMap((peer) => this.peerRows(peer)).map(current)]
    }

    private eventRows(): readonly (readonly [string, SecurityRow])[] {
        return this.events.map((event) => [
            rowId('event', event.peer ?? event.target ?? '$observer-link', [event.id]),
            {
                name: event.kind,
                kind: 'security.event',
                category: 'event',
                peer: event.peer ?? event.target ?? '$observer-link',
                evidence: event.evidence,
                severity: event.severity,
                timeframe: 'history',
                event: event.kind,
                at: event.at,
                code: event.code,
                ...(event.target ? { target: event.target } : {}),
                ...(event.namespace ? { namespace: event.namespace } : {}),
                ...(event.method ? { method: event.method } : {}),
                ...(event.effect ? { effect: event.effect } : {}),
                ...(event.grant ? { grant: event.grant } : {}),
                ...(event.allowed !== undefined ? { allowed: event.allowed } : {}),
                ...(event.capability ? { capability: event.capability } : {}),
                ...(event.holder ? { holder: event.holder } : {}),
                ...(event.previousHolder ? { previousHolder: event.previousHolder } : {}),
                ...(event.expiresAt !== undefined ? { expiresAt: event.expiresAt } : {}),
                ...(event.generation !== undefined ? { generation: event.generation } : {}),
                ...(event.until !== undefined ? { until: event.until } : {}),
                ...(event.transport ? { transport: event.transport } : {}),
                ...(event.previous ? { previous: event.previous } : {}),
                ...(event.current ? { current: event.current } : {})
            }
        ])
    }

    private identityRow(): readonly [string, SecurityRow] {
        const observer = this.observer
        return [
            rowId('identity', '$observer-link', ['current']),
            {
                name: observer?.identity ?? observer?.source ?? this.observerLabel,
                kind: 'security.identity',
                category: 'identity',
                peer: '$observer-link',
                evidence: observer
                    ? observer.authenticationEvidence === observer.sourceEvidence
                        ? observer.authenticationEvidence
                        : 'mixed'
                    : 'unknown',
                ...(observer
                    ? {
                          authentication: observer.authentication,
                          authenticationEvidence: observer.authenticationEvidence,
                          source: observer.source,
                          sourceEvidence: observer.sourceEvidence,
                          ...(observer.identity ? { identity: observer.identity } : {}),
                          ...(observer.roles ? { roles: observer.roles } : {})
                      }
                    : {})
            }
        ]
    }

    private peerRows(peer: string): readonly (readonly [string, SecurityRow])[] {
        const description = this.descriptions[peer]
        if (!description) {
            const reason = peer in this.refused ? 'Description was refused or unavailable' : 'Description has not been received'
            return [
                [rowId('peer', peer, ['posture']), { name: peer, kind: 'security.peer', category: 'peer', peer, evidence: 'unknown' }],
                [
                    rowId('finding', peer, ['unknown-peer-posture']),
                    {
                        name: `Unknown posture on ${peer}`,
                        kind: 'security.finding',
                        category: 'finding',
                        peer,
                        evidence: 'unknown',
                        severity: 'unknown',
                        finding: 'unknown-peer-posture',
                        message: reason
                    }
                ]
            ]
        }

        const rows: (readonly [string, SecurityRow])[] = [
            [
                rowId('peer', peer, ['posture']),
                {
                    name: peer,
                    kind: 'security.peer',
                    category: 'peer',
                    peer,
                    evidence: 'peer',
                    validating: description.validating
                }
            ]
        ]
        if (!description.validating)
            rows.push([
                rowId('finding', peer, ['validation-disabled']),
                {
                    name: `Validation disabled on ${peer}`,
                    kind: 'security.finding',
                    category: 'finding',
                    peer,
                    evidence: 'peer',
                    severity: 'medium',
                    finding: 'validation-disabled',
                    message: 'RPC arguments are not checked against the extracted contract'
                }
            ])

        if (description.transports === undefined)
            rows.push([
                rowId('finding', peer, ['unknown-transport-posture']),
                {
                    name: `Unknown transports on ${peer}`,
                    kind: 'security.finding',
                    category: 'finding',
                    peer,
                    evidence: 'unknown',
                    severity: 'unknown',
                    finding: 'unknown-transport-posture',
                    message: 'This description does not report transport security posture'
                }
            ])

        for (const [at, transport] of (description.transports ?? []).entries()) rows.push(...this.transportRows(peer, transport, at))
        for (const [at, elevation] of (description.elevated ?? []).entries()) {
            rows.push([
                rowId('elevation', peer, [elevation.capability, elevation.since ?? null, at]),
                {
                    name: elevation.capability,
                    kind: 'security.elevation',
                    category: 'elevation',
                    peer,
                    evidence: 'peer',
                    capability: elevation.capability,
                    ...(elevation.reason ? { reason: elevation.reason } : {}),
                    ...(elevation.since !== undefined ? { since: elevation.since } : {}),
                    ...(elevation.until !== undefined ? { until: elevation.until } : {}),
                    ...(elevation.grantedBy ? { grantedBy: elevation.grantedBy } : {})
                }
            ])
            if (elevation.until === undefined)
                rows.push([
                    rowId('finding', peer, ['permanent-elevation', elevation.capability, elevation.since ?? null, at]),
                    {
                        name: `Permanent elevation: ${elevation.capability}`,
                        kind: 'security.finding',
                        category: 'finding',
                        peer,
                        evidence: 'peer',
                        severity: 'high',
                        finding: 'permanent-elevation',
                        capability: elevation.capability,
                        message: 'This elevation has no automatic expiry'
                    }
                ])
        }
        const authorities = this.authorities[peer]
        if (authorities === undefined)
            rows.push([
                rowId('authority', peer, ['unknown']),
                {
                    name: `Authority posture on ${peer}`,
                    kind: 'security.authority-unknown',
                    category: 'authority',
                    peer,
                    evidence: 'unknown',
                    message: 'Authority state is unavailable or has not been read'
                }
            ])
        else
            for (const authority of authorities)
                rows.push([
                    securityAuthorityRowId(peer, authority.namespace),
                    {
                        name: authority.namespace,
                        kind: 'security.authority',
                        category: 'authority',
                        peer,
                        evidence: 'peer',
                        namespace: authority.namespace,
                        methods: authority.methods,
                        generation: authority.authority.generation,
                        ...(authority.authority.holder ? { holder: authority.authority.holder } : {}),
                        ...(authority.authority.expiresAt !== undefined ? { expiresAt: authority.authority.expiresAt } : {})
                    }
                ])
        return rows
    }

    private transportRows(peer: string, transport: RpcTransportDescription, at: number): readonly (readonly [string, SecurityRow])[] {
        const endpoint = transport.endpoint ? publicTransportEndpoint(transport.endpoint) : undefined
        const identity = [transport.name, transport.protocol, transport.role, endpoint ?? null, at] as const
        const security = transport.security
        const common = { peer, transport: transport.name, protocol: transport.protocol, role: transport.role, ...(endpoint ? { endpoint } : {}) }
        const rows: (readonly [string, SecurityRow])[] = [
            [
                rowId('transport', peer, identity),
                {
                    name: `${transport.protocol} ${transport.role}`,
                    kind: 'security.transport',
                    category: 'transport',
                    ...common,
                    evidence: evidenceOf(transport),
                    ...(security?.authentication.value ? { authentication: security.authentication.value } : {}),
                    ...(security ? { authenticationEvidence: security.authentication.evidence } : {}),
                    ...(security?.encryption.value ? { encryption: security.encryption.value } : {}),
                    ...(security ? { encryptionEvidence: security.encryption.evidence } : {}),
                    ...(security?.signing.value ? { signing: security.signing.value } : {}),
                    ...(security ? { signingEvidence: security.signing.evidence } : {}),
                    ...(security?.relay.value ? { relay: security.relay.value } : {}),
                    ...(security ? { relayEvidence: security.relay.evidence } : {})
                }
            ]
        ]
        const finding = (kind: SecurityFindingKind, severity: SecuritySeverity, message: string): void => {
            rows.push([
                rowId('finding', peer, [kind, ...identity]),
                {
                    name: message,
                    kind: 'security.finding',
                    category: 'finding',
                    ...common,
                    evidence: security ? evidenceOf(transport) : 'unknown',
                    severity,
                    finding: kind,
                    message
                }
            ])
        }
        if (unknownTransport(transport)) finding('unknown-transport-posture', 'unknown', 'One or more transport security facts are unknown')
        if (security?.authentication.value === 'none' && (security.relay.value === 'enabled' || security.relay.value === 'conditional'))
            finding('unauthenticated-relay', 'high', 'A relay accepts a connection without authentication')
        if (security?.encryption.value === 'none' && isRemoteEndpoint(endpoint)) finding('cleartext-remote-link', 'high', 'A remote transport endpoint is not encrypted')
        if (security?.encryption.value === 'tls-unverified') finding('tls-verification-disabled', 'high', 'TLS is used without peer certificate verification')
        if (transport.protocol.toLowerCase() === 'mqtt' && security?.signing.value === 'none') finding('unsigned-mqtt', 'medium', 'MQTT frames are not signed')
        return rows
    }
}
