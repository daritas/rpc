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
    readonly kind: 'security.identity' | 'security.peer' | 'security.transport' | 'security.elevation' | 'security.authority' | 'security.event' | 'security.finding'
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
    /** What the console established about the browser link carrying its own identity() call. */
    readonly observer?: SecurityObserver
    /** Missing entries are unknown/refused; an empty array is a known answer with no guarded components. */
    readonly authorities?: Readonly<Record<string, readonly DescribedComponentAuthority[] | undefined>>
    readonly events?: readonly SecurityDataEvent[]
    readonly epoch?: string
    readonly revision?: number
}

export interface SecurityDataEvent {
    readonly id: number
    readonly at: number
    readonly kind: string
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

export interface SecurityObserver {
    readonly authentication: 'authenticated' | 'none'
    readonly authenticationEvidence: 'link'
    readonly source: string
    readonly sourceEvidence: 'link' | 'unknown'
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

const str = { type: { kind: 'string' } } as const
const optional = { type: { kind: 'string' }, optional: true } as const
const strings = { type: { kind: 'array', items: { kind: 'string' } }, optional: true } as const
const moment = { type: { kind: 'number' }, optional: true } as const
const counter = { type: { kind: 'number', integer: true }, optional: true } as const
const flag = { type: { kind: 'boolean' }, optional: true } as const

/** What every security row carries, whichever shape it is. */
const commonFields = { name: str, category: str, peer: str, evidence: str, timeframe: str } as const

/**
 * What each shape carries beyond the common five.
 *
 * One list per `kind`, and the union below is built from it rather than written beside it, so the
 * two cannot drift. `satisfies` is what makes the keys a claim: a shape nobody produces, or a
 * `kind` left out when one is added, stops the build here rather than becoming a column that is
 * blank on every row.
 *
 * The reason to say this at all is that a viewer can now use it. A row type this wide had to be one
 * flat object with thirty optional fields while nothing could read anything better, and the cost
 * was a table whose columns were the union of seven shapes - fifteen promoted, of which a transport
 * row fills eight and a peer row three. `TypeNode` could express the union the whole time; there
 * was just nothing on the other end to ask. See `notes/typed-columns.md`.
 */
const shapeFields = {
    'security.identity': { authentication: optional, authenticationEvidence: optional, source: optional, sourceEvidence: optional, identity: optional, roles: strings },
    'security.peer': { validating: flag },
    'security.transport': {
        transport: str,
        protocol: str,
        role: str,
        endpoint: optional,
        authentication: optional,
        authenticationEvidence: optional,
        encryption: optional,
        encryptionEvidence: optional,
        signing: optional,
        signingEvidence: optional,
        relay: optional,
        relayEvidence: optional
    },
    'security.elevation': { capability: str, reason: optional, since: moment, until: moment, grantedBy: optional },
    'security.authority': { namespace: optional, methods: strings, generation: counter, holder: optional, expiresAt: moment, message: optional },
    'security.event': {
        severity: str,
        event: str,
        at: { type: { kind: 'number' } },
        code: str,
        target: optional,
        namespace: optional,
        method: optional,
        effect: optional,
        grant: optional,
        allowed: flag,
        capability: optional,
        holder: optional,
        previousHolder: optional,
        expiresAt: moment,
        generation: counter,
        until: moment,
        transport: optional,
        previous: optional,
        current: optional
    },
    'security.finding': { severity: str, finding: str, message: str, transport: optional, protocol: optional, role: optional, endpoint: optional, capability: optional }
} as const satisfies Record<SecurityRow['kind'], Readonly<Record<string, unknown>>>

const securityResource: RpcDataResource = {
    path: SECURITY_RESOURCE_PATH,
    verbs: ['getChildren', 'getList', 'getOne'],
    shape: 'tree',
    label: 'Security',
    // Seven shapes rather than one object with thirty optional fields. `additional` stays true: it
    // was true before, the rows are assembled by spreading, and tightening a claim about what may
    // arrive is a different change from saying what usually does.
    row: {
        kind: 'union',
        options: Object.entries(shapeFields).map(([kind, fields]) => ({
            kind: 'object' as const,
            fields: { kind: { type: { kind: 'literal' as const, value: kind } }, ...commonFields, ...fields },
            additional: true
        }))
    },
    presentation: {
        defaultColumns: ['timeframe', 'severity', 'finding', 'event', 'peer', 'target', 'namespace', 'holder', 'transport', 'authentication', 'encryption', 'signing', 'relay', 'evidence', 'message'],
        representation: 'name'
    }
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
    private readonly observer?: SecurityObserver
    private readonly authorities: NonNullable<SecurityDataProviderOptions['authorities']>
    private readonly events: readonly SecurityDataEvent[]
    private readonly epoch: string
    private readonly revision: number

    constructor(options: SecurityDataProviderOptions) {
        this.peers = [...new Set(options.peers)].sort()
        this.descriptions = options.descriptions
        this.refused = options.refused ?? {}
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
                label: 'Current console link',
                hasChildren: false,
                value: {
                    name: 'Current console link',
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
            rowId('event', event.peer ?? event.target ?? '$console-link', [event.id]),
            {
                name: event.kind,
                kind: 'security.event',
                category: 'event',
                peer: event.peer ?? event.target ?? '$console-link',
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
            rowId('identity', '$console-link', ['current']),
            {
                name: observer?.identity ?? observer?.source ?? 'Current console link',
                kind: 'security.identity',
                category: 'identity',
                peer: '$console-link',
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
                    kind: 'security.authority',
                    category: 'authority',
                    peer,
                    evidence: 'unknown',
                    message: 'Authority state is unavailable or has not been read'
                }
            ])
        else
            for (const authority of authorities)
                rows.push([
                    rowId('authority', peer, [authority.namespace]),
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
