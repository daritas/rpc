import test from 'ava'
import type { RpcGetChildrenResult, RpcGetListResult, ServerDescription } from '@source-repo/rpc'
import {
    SECURITY_RESOURCE,
    SecurityDataProvider,
    SecurityEventHistory,
    securityAuthorityRowId,
    securityAuthorityTargetOf,
    securityEventFromRemote,
    type SecurityRow
} from './SecurityDataProvider.js'

const described = (changes: Partial<ServerDescription> = {}): ServerDescription => ({
    name: 'alpha',
    validating: true,
    namespaces: [],
    transports: [],
    ...changes
})

const list = (provider: SecurityDataProvider, under?: string) =>
    provider.dataRequest('getList', ['security'], { ...(under ? { under } : {}), recursive: true, pagination: { page: 0, pageSize: 100 } }) as RpcGetListResult

const rowsOf = (answer: RpcGetListResult) => answer.data as SecurityRow[]

test('declares one ordinary tree resource for the generic grid', (t) => {
    const provider = new SecurityDataProvider({ peers: [], descriptions: {} })
    t.deepEqual(provider.dataResources(), [SECURITY_RESOURCE])
    t.deepEqual(SECURITY_RESOURCE.actions, [
        { method: 'acquireAuthority', label: 'acquire', confirm: true, kinds: ['security.authority'] },
        { method: 'releaseAuthority', label: 'release mine', confirm: true, kinds: ['security.authority'] }
    ])
})

test('remote security evidence is allow-listed and process history is bounded', (t) => {
    const rebuilt = securityEventFromRemote(
        'cell',
        {
            at: 1,
            kind: 'ai-access',
            code: 'refused',
            peer: 'assistant',
            namespace: 'line',
            method: 'setMode',
            effect: 'operate',
            allowed: false,
            token: 'token-must-not-cross',
            reason: 'private policy detail'
        },
        100
    )
    t.deepEqual(rebuilt, {
        at: 100,
        kind: 'ai-access',
        severity: 'medium',
        evidence: 'peer',
        target: 'cell',
        peer: 'assistant',
        namespace: 'line',
        method: 'setMode',
        effect: 'operate',
        allowed: false,
        code: 'refused'
    })
    if (!rebuilt) return t.fail('expected the declared event vocabulary to be accepted')
    t.is(securityEventFromRemote('cell', { kind: 'ai-access', code: 'invented' }), undefined)

    const history = new SecurityEventHistory(2)
    history.record(rebuilt)
    history.record({ ...rebuilt, at: 101 })
    history.record({ ...rebuilt, at: 102 })
    t.deepEqual(
        history.snapshot().map(({ id, at }) => ({ id, at })),
        [
            { id: 3, at: 102 },
            { id: 2, at: 101 }
        ]
    )
})

test('event coverage distinguishes a quiet subscription from an unavailable one', (t) => {
    const provider = new SecurityDataProvider({
        peers: ['alpha', 'legacy'],
        descriptions: { alpha: described(), legacy: described({ name: 'legacy' }) },
        eventSources: { alpha: 'unavailable', legacy: 'unsupported' }
    })
    const roots = provider.dataRequest('getChildren', ['security'], {}) as RpcGetChildrenResult
    t.deepEqual(roots.data[2], {
        name: 'Events',
        events: 0,
        coverage: 'partial',
        following: 0,
        unavailable: 1,
        unsupported: 1,
        unknown: 0
    })
    t.like(
        rowsOf(list(provider)).find((row) => row.finding === 'security-events-unavailable'),
        {
            peer: 'alpha',
            evidence: 'unknown',
            severity: 'unknown',
            message: 'This observer could describe msgrpc.security but could not subscribe to it'
        }
    )
})

test('authority action subjects decode only the provider-owned opaque identity', (t) => {
    const id = securityAuthorityRowId('alpha', 'line')
    t.deepEqual(securityAuthorityTargetOf(id), { peer: 'alpha', namespace: 'line' })
    t.is(securityAuthorityTargetOf(JSON.stringify(['security-row', 'authority', 'alpha', 'component', 'line', 'extra'])), undefined)
    t.is(securityAuthorityTargetOf('not-json'), undefined)
})

test('keeps an undescribed or refused peer unknown without exposing the refusal', (t) => {
    const provider = new SecurityDataProvider({ peers: ['lost'], descriptions: {}, refused: { lost: new Error('token=secret') } })
    const rows = rowsOf(list(provider))
    t.is(rows.find((row) => row.kind === 'security.peer')?.evidence, 'unknown')
    const finding = rows.find((row) => row.finding === 'unknown-peer-posture')
    t.is(finding?.severity, 'unknown')
    t.false(JSON.stringify(rows).includes('secret'))
})

test('states what is known on the browser link without treating a routed source claim as identity', (t) => {
    const anonymous = new SecurityDataProvider({ peers: [], descriptions: {} })
    const unknown = rowsOf(list(anonymous)).find((row) => row.category === 'identity')
    t.is(unknown?.evidence, 'unknown')
    t.is(unknown?.authentication, undefined)

    const authenticated = new SecurityDataProvider({
        peers: [],
        descriptions: {},
        observerLabel: 'Current MCP persona',
        observer: {
            authentication: 'authenticated',
            authenticationEvidence: 'link',
            source: 'page-7',
            sourceEvidence: 'link',
            identity: 'anders',
            roles: ['operator']
        }
    })
    const known = rowsOf(list(authenticated)).find((row) => row.category === 'identity')
    t.like(known, { evidence: 'link', authentication: 'authenticated', source: 'page-7', identity: 'anders', roles: ['operator'] })
    const roots = authenticated.dataRequest('getChildren', ['security'], {}) as RpcGetChildrenResult
    t.is((roots.data[0] as { name: string }).name, 'Current MCP persona')

    const routed = new SecurityDataProvider({
        peers: [],
        descriptions: {},
        observer: { authentication: 'none', authenticationEvidence: 'link', source: 'page-claim', sourceEvidence: 'unknown' }
    })
    t.is(rowsOf(list(routed))[0].evidence, 'mixed', 'known lack of authentication does not promote the source claim')
})

test('derives conservative transport and elevation findings with evidence intact', (t) => {
    const provider = new SecurityDataProvider({
        peers: ['alpha'],
        descriptions: {
            alpha: described({
                validating: false,
                transports: [
                    {
                        name: 'alpha',
                        protocol: 'socket.io',
                        role: 'listen',
                        endpoint: 'http://plant.example:3992/',
                        security: {
                            authentication: { value: 'none', evidence: 'peer' },
                            encryption: { value: 'none', evidence: 'peer' },
                            signing: { value: 'none', evidence: 'peer' },
                            relay: { value: 'enabled', evidence: 'peer' }
                        }
                    },
                    {
                        name: 'broker',
                        protocol: 'mqtt',
                        role: 'broker',
                        endpoint: 'mqtts://broker.example/',
                        security: {
                            authentication: { value: 'credentials-presented', evidence: 'peer' },
                            encryption: { value: 'tls-unverified', evidence: 'peer' },
                            signing: { value: 'none', evidence: 'peer' },
                            relay: { value: 'not-applicable', evidence: 'peer' }
                        }
                    }
                ],
                elevated: [{ capability: 'docker.create', reason: 'maintenance', grantedBy: 'deployment' }]
            })
        }
    })
    const rows = rowsOf(list(provider))
    t.deepEqual(
        rows.filter((row) => row.finding).map((row) => row.finding),
        ['validation-disabled', 'unauthenticated-relay', 'cleartext-remote-link', 'tls-verification-disabled', 'unsigned-mqtt', 'permanent-elevation']
    )
    const mqtt = rows.find((row) => row.kind === 'security.transport' && row.protocol === 'mqtt')
    t.is(mqtt?.authentication, 'credentials-presented', 'presenting credentials is stated without calling it authenticated')
    t.is(mqtt?.authenticationEvidence, 'peer')
    t.is(mqtt?.encryption, 'tls-unverified')
    t.is(rows.find((row) => row.kind === 'security.elevation')?.reason, 'maintenance')
})

test('custom and older transports stay unknown while explicit empty transports do not', (t) => {
    const provider = new SecurityDataProvider({
        peers: ['old', 'empty', 'custom'],
        descriptions: {
            old: described({ name: 'old', transports: undefined }),
            empty: described({ name: 'empty', transports: [] }),
            custom: described({ name: 'custom', transports: [{ name: 'custom', protocol: 'fieldbus', role: 'custom', endpoint: 'mqtt://user:secret@example.test/path?token=also-secret' }] })
        }
    })
    const findings = rowsOf(list(provider)).filter((row) => row.finding === 'unknown-transport-posture')
    t.deepEqual(findings.map((row) => row.peer), ['custom', 'old'])
    const serialised = JSON.stringify(list(provider))
    t.false(serialised.includes('secret'))
    t.false(serialised.includes('token='))
    t.true(serialised.includes('mqtt://example.test/path'))
})

test('tree scopes findings and peer sections without turning leaves into branches', (t) => {
    const provider = new SecurityDataProvider({
        peers: ['alpha'],
        descriptions: { alpha: described({ elevated: [{ capability: 'debug.shell' }] }) }
    })
    const roots = provider.dataRequest('getChildren', ['security'], {}) as RpcGetChildrenResult
    t.deepEqual(roots.data, [
        { name: 'Current observer', authentication: 'unknown', evidence: 'unknown' },
        { name: 'Findings', findings: 1 },
        { name: 'Events', events: 0 },
        { name: 'Peers', peers: 1 }
    ])
    t.deepEqual(roots.grouping, [true, true, true, true])
    t.deepEqual(roots.hasChildren, [false, false, false, true])

    const peers = provider.dataRequest('getChildren', ['security'], { parentId: roots.ids[3] }) as RpcGetChildrenResult
    const alpha = peers.ids[0]
    t.false(rowsOf(list(provider, roots.ids[3])).some((row) => row.category === 'identity'))
    const sections = provider.dataRequest('getChildren', ['security'], { parentId: alpha }) as RpcGetChildrenResult
    t.deepEqual(sections.data.map((value) => (value as { name: string }).name), ['Transports', 'Elevations', 'Authorities'])
    const elevationBranch = sections.ids[1]
    const elevations = rowsOf(list(provider, elevationBranch))
    t.deepEqual(elevations.map((row) => row.kind), ['security.elevation'])
})

test('security events and live authority leases are ordinary scoped rows', (t) => {
    const provider = new SecurityDataProvider({
        peers: ['alpha'],
        descriptions: { alpha: described() },
        authorities: {
            alpha: [{ namespace: 'line', methods: ['start'], authority: { holder: 'console', expiresAt: 10000, generation: 4 } }]
        },
        events: [
            {
                id: 7,
                at: 9000,
                kind: 'authorization-refused',
                severity: 'medium',
                evidence: 'link',
                peer: 'alpha',
                namespace: 'line',
                method: 'start',
                code: 'Forbidden'
            },
            {
                id: 8,
                at: 9100,
                kind: 'ai-access',
                severity: 'low',
                evidence: 'peer',
                peer: 'assistant',
                target: 'alpha',
                namespace: 'line',
                method: 'start',
                code: 'allowed',
                effect: 'operate',
                grant: 'ai.tool.write',
                allowed: true
            },
            {
                id: 9,
                at: 9200,
                kind: 'transport-change',
                severity: 'medium',
                evidence: 'peer',
                target: 'alpha',
                code: 'authentication-changed',
                transport: 'socket.io listen alpha',
                previous: 'connection (peer)',
                current: 'none (peer)'
            }
        ]
    })
    const roots = provider.dataRequest('getChildren', ['security'], {}) as RpcGetChildrenResult
    const events = rowsOf(list(provider, roots.ids[2]))
    t.like(events[0], {
        name: 'authorization-refused',
        kind: 'security.event',
        category: 'event',
        peer: 'alpha',
        evidence: 'link',
        severity: 'medium',
        timeframe: 'history',
        event: 'authorization-refused',
        at: 9000,
        code: 'Forbidden',
        namespace: 'line',
        method: 'start'
    })
    t.like(events[1], {
        name: 'ai-access',
        peer: 'assistant',
        target: 'alpha',
        evidence: 'peer',
        severity: 'low',
        timeframe: 'history',
        code: 'allowed',
        effect: 'operate',
        grant: 'ai.tool.write',
        allowed: true
    })
    t.like(events[2], {
        name: 'transport-change',
        target: 'alpha',
        evidence: 'peer',
        severity: 'medium',
        timeframe: 'history',
        code: 'authentication-changed',
        transport: 'socket.io listen alpha',
        previous: 'connection (peer)',
        current: 'none (peer)'
    })

    const peers = provider.dataRequest('getChildren', ['security'], { parentId: roots.ids[3] }) as RpcGetChildrenResult
    const sections = provider.dataRequest('getChildren', ['security'], { parentId: peers.ids[0] }) as RpcGetChildrenResult
    const authorities = rowsOf(list(provider, sections.ids[2]))
    t.like(authorities[0], {
        category: 'authority',
        namespace: 'line',
        holder: 'console',
        expiresAt: 10000,
        generation: 4,
        methods: ['start'],
        evidence: 'peer',
        timeframe: 'current'
    })
    const authorityPage = list(provider, sections.ids[2])
    t.is(authorityPage.ids[0], securityAuthorityRowId('alpha', 'line'), 'the action subject names the target component without exposing it to the viewer')
})

test('an unknown authority placeholder is not an actionable authority row', (t) => {
    const provider = new SecurityDataProvider({ peers: ['alpha'], descriptions: { alpha: described() } })
    const unknown = rowsOf(list(provider)).find((row) => row.category === 'authority')
    t.like(unknown, { kind: 'security.authority-unknown', evidence: 'unknown' })
})

test('filtering, sorting, paging and row preview use the DataProvider contract', (t) => {
    const provider = new SecurityDataProvider({
        peers: ['beta', 'alpha'],
        descriptions: { alpha: described({ name: 'alpha', validating: false }), beta: described({ name: 'beta' }) }
    })
    const answer = provider.dataRequest('getList', ['security'], {
        recursive: true,
        filter: { field: 'category', op: 'eq', operand: 'finding' },
        sort: { field: 'peer', order: 'ASC' },
        pagination: { page: 0, pageSize: 1 }
    }) as RpcGetListResult
    t.is(answer.total, 1)
    t.is((answer.data[0] as SecurityRow).peer, 'alpha')
    const one = provider.dataRequest('getOne', ['security'], { id: answer.ids[0] })
    t.deepEqual((one as { data: unknown }).data, answer.data[0])
    t.deepEqual(list(provider, 'not-a-branch').data, [], 'an invalid scope cannot accidentally reveal the whole resource')
})
