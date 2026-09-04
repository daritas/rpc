import test from 'ava'
import type { RpcGetChildrenResult, RpcGetListResult, ServerDescription } from '@source-repo/rpc'
import { SECURITY_RESOURCE, SecurityDataProvider, type SecurityRow } from './SecurityDataProvider.js'

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
        { name: 'Current console link', authentication: 'unknown', evidence: 'unknown' },
        { name: 'Findings', findings: 1 },
        { name: 'Peers', peers: 1 }
    ])
    t.deepEqual(roots.grouping, [true, true, true])
    t.deepEqual(roots.hasChildren, [false, false, true])

    const peers = provider.dataRequest('getChildren', ['security'], { parentId: roots.ids[2] }) as RpcGetChildrenResult
    const alpha = peers.ids[0]
    t.false(rowsOf(list(provider, roots.ids[2])).some((row) => row.category === 'identity'))
    const sections = provider.dataRequest('getChildren', ['security'], { parentId: alpha }) as RpcGetChildrenResult
    t.deepEqual(sections.data.map((value) => (value as { name: string }).name), ['Transports', 'Elevations'])
    const elevationBranch = sections.ids[1]
    const elevations = rowsOf(list(provider, elevationBranch))
    t.deepEqual(elevations.map((row) => row.kind), ['security.elevation'])
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
