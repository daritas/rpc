import anyTest, { type TestFn } from 'ava'
import { randomUUID } from 'node:crypto'
import { connectAsync } from 'mqtt'
import {
    createHmacSigner,
    createHmacVerifier,
    createTokenAuthenticator,
    MqttTransport,
    rpc,
    rpcComponent,
    rpcNamespace,
    RpcClient,
    RpcComponent,
    RpcServer,
    type RpcAuthorizer,
    type RpcIdentity,
    type ServerDescription
} from '@source-repo/rpc'
import { securityAuthorityRowId } from '@source-repo/query'
import { consoleIdentityPath, startConsole, type ConsoleService } from './console.js'

/**
 * The console security acceptance fixture.
 *
 * This is intentionally a network rather than a collection of mocked callbacks. It puts an open
 * browser link in front of an authenticated console-to-plant link, then exercises the identities,
 * effect ladder, component authority and expiring posture that the console has to explain without
 * ever receiving a credential. The MQTT half repeats the boundary with end-to-end signatures when
 * a test broker is available.
 */

const run = randomUUID().slice(0, 8)
const named = (name: string) => `${name}-${run}`

const waitFor = async (condition: () => boolean | Promise<boolean>, timeout = 5000) => {
    const deadline = Date.now() + timeout
    while (!(await condition())) {
        if (Date.now() > deadline) throw new Error('waitFor timed out')
        await new Promise((resolve) => setTimeout(resolve, 20))
    }
}

type CellState = { mode: 'idle' | 'running'; setpoint: number; program: string }

@rpcNamespace('cell', { version: '1' })
class SecurityCell extends RpcComponent<{ label: string }, CellState> {
    constructor() {
        super({ label: 'security fixture cell' }, { mode: 'idle', setpoint: 20, program: 'recipe-1' })
    }

    @rpc({ semantics: 'query', effect: 'observe' })
    async status() {
        return this.state.mode
    }

    @rpc({ semantics: 'idempotent-command', effect: 'operate', requiresAuthority: true, sets: 'setpoint' })
    async setSetpoint(value: number) {
        this.setState({ setpoint: value })
        return value
    }

    @rpc({ semantics: 'idempotent-command', effect: 'operate' })
    async acknowledgeAlarm() {
        return 'acknowledged'
    }

    @rpc({ semantics: 'idempotent-command', effect: 'program', sets: 'program' })
    async deployProgram(program: string) {
        this.setState({ program })
        return program
    }

    @rpc({ semantics: 'non-repeatable-command', effect: 'security-admin' })
    async rotateCredentials() {
        return 'rotated'
    }
}

const browserClient = async (url: string) => {
    const { name } = (await (await fetch(`${url}${consoleIdentityPath}`)).json()) as { name: string }
    const client = new RpcClient(url, { defaultTarget: name, readyTimeout: 3000, callTimeout: 3000 })
    await client.ready()
    return { client, remote: await client.proxy<ConsoleService>('console') }
}

interface Context {
    broker: boolean
}

const test = anyTest as TestFn<Context>
const BROKER_URL = process.env.MSGRPC_TEST_BROKER ?? 'mqtt://localhost:1883'

test.before(async (t) => {
    try {
        const broker = await connectAsync(BROKER_URL, { connectTimeout: 1000, reconnectPeriod: 0 })
        await broker.endAsync()
        t.context = { broker: true }
    } catch {
        if (process.env.SOURCE_RPC_REQUIRE_BROKER) throw new Error(`SOURCE_RPC_REQUIRE_BROKER is set, but no MQTT broker answered at ${BROKER_URL}`)
        t.context = { broker: false }
    }
})

test.serial('the console explains an authenticated plant without acquiring its users or secrets', async (t) => {
    const target = named('secure-cell')
    const consoleName = named('security-console')
    const identities = {
        viewer: { name: named('viewer'), roles: ['viewer'] },
        operator: { name: named('operator'), roles: ['viewer', 'operator'] },
        engineer: { name: named('engineer'), roles: ['viewer', 'operator', 'engineer'] },
        ai: { name: named('assistant'), roles: ['ai-tool'] },
        console: { name: consoleName, roles: ['viewer', 'operator'] }
    } satisfies Record<string, RpcIdentity>
    const tokens = Object.fromEntries(Object.keys(identities).map((role) => [role, `${role}-token-${run}`])) as Record<keyof typeof identities, string>
    const authenticate = createTokenAuthenticator(Object.fromEntries(Object.entries(identities).map(([role, identity]) => [tokens[role as keyof typeof tokens], identity])))
    const authorize: RpcAuthorizer = ({ identity, method, subscription }) => {
        const roles = identity?.roles ?? []
        if (subscription || method === 'status' || method === 'describe' || method === 'authorities') return roles.some((role) => ['viewer', 'operator', 'engineer', 'ai-tool'].includes(role))
        if (method === 'acknowledgeAlarm') return roles.includes('operator') || roles.includes('ai-tool')
        if (method === '$acquire' || method === '$release' || method === 'setSetpoint') return roles.includes('operator')
        if (method === 'deployProgram' || method === 'rotateCredentials') return roles.includes('engineer')
        return false
    }
    const aiDecisions: { source: string; path: string; method: string; effect: string; allowed: boolean; grant?: string; reason: string }[] = []
    const aiGrantExpiresAt = Date.now() + 1200
    let plant = new RpcServer({
        name: target,
        transports: [{ port: 7441, host: '127.0.0.1' }],
        authenticate,
        authorize,
        exposeIntrospection: true,
        // The target-side audit callback may see the private policy reason. The safe event bridge
        // below must not, so use a real fixture credential rather than an innocuous sentence.
        aiGrants: { grants: 1, revision: 1, open: { 'ai.tool.write': { to: [identities.ai.name], expiresAt: aiGrantExpiresAt, reason: tokens.ai } } },
        onAiDecision: (decision) => aiDecisions.push(decision)
    })
    plant.exposeClassInstance(new SecurityCell())
    await plant.ready()
    t.teardown(() => plant.close())

    const running = await startConsole({
        hub: 'http://127.0.0.1:7441',
        hubCredentials: { token: tokens.console },
        port: 7442,
        host: '127.0.0.1',
        name: consoleName,
        callTimeout: 1000
    })
    t.teardown(() => running.close())
    const browser = await browserClient(running.url)
    t.teardown(() => browser.client.close())
    await waitFor(async () => (await browser.remote.peers()).peers.includes(target))
    const initialDescription = (await browser.remote.describe(target)) as ServerDescription
    t.true(initialDescription.transports?.some((transport) => transport.protocol === 'socket.io' && transport.security?.authentication.value === 'connection'))
    // Opened after describe(), because that call also installs the console's safe operational-event
    // subscription. Both opening and expiry are therefore observable without timing startup.
    plant.elevate({ capability: 'debug.endpoint', reason: 'security fixture', until: Date.now() + 1500, grantedBy: identities.engineer.name })

    const authorityId = securityAuthorityRowId(target, 'cell')
    const consoleLease = await browser.remote.acquireAuthority(authorityId, 1000)
    t.like(consoleLease, { peer: target, namespace: 'cell', status: 'acquired', holder: consoleName })
    t.is(consoleLease.authorities?.[0].authority.holder, consoleName, 'the action refreshes the live authority projection')
    const consoleRelease = await browser.remote.releaseAuthority(authorityId)
    t.like(consoleRelease, { peer: target, namespace: 'cell', status: 'released' })
    t.is(consoleRelease.authorities?.[0].authority.holder, undefined)
    const inventedAuthority = await t.throwsAsync(browser.remote.acquireAuthority(JSON.stringify(['security-row', 'authority', target, 'component', 'missing']), 1000))
    t.is((inventedAuthority as { code?: string })?.code, 'InvalidParams', 'an invented row id cannot turn the action into a general target call')

    const clients: RpcClient[] = []
    const connect = async (identity: RpcIdentity, token: string) => {
        const client = new RpcClient('http://127.0.0.1:7441', {
            name: identity.name,
            defaultTarget: target,
            credentials: { token },
            readyTimeout: 1000,
            callTimeout: 1000
        })
        clients.push(client)
        await client.ready()
        return client
    }
    t.teardown(async () => void (await Promise.allSettled(clients.map((client) => client.close()))))

    const viewer = await connect(identities.viewer, tokens.viewer)
    const operator = await connect(identities.operator, tokens.operator)
    const engineer = await connect(identities.engineer, tokens.engineer)
    const assistant = await connect(identities.ai, tokens.ai)

    const browserIdentity = await browser.remote.identity()
    t.deepEqual(browserIdentity.authentication, { value: 'none', evidence: 'link' })
    t.is(browserIdentity.source.evidence, 'unknown')
    t.truthy(browserIdentity.source.value)
    t.is((await browser.remote.call(target, 'cell', 'status')).result, 'idle', 'the authenticated console identity may relay an observation')
    t.is(await (await viewer.proxy<SecurityCell>('cell')).status(), 'idle')

    const viewerRefusal = await t.throwsAsync((await viewer.proxy<SecurityCell>('cell')).setSetpoint(30))
    t.is((viewerRefusal as { code?: string })?.code, 'Forbidden')
    const aiCell = await assistant.proxy<SecurityCell>('cell')
    t.is(await aiCell.status(), 'idle', 'an AI identity may observe without a grant')
    t.is(await aiCell.acknowledgeAlarm(), 'acknowledged', 'a bounded AI operate grant opens only that rung')
    const aiRefusal = await t.throwsAsync(aiCell.deployProgram('ai-recipe'))
    t.is((aiRefusal as { code?: string })?.code, 'Forbidden')

    const controlled = await operator.component<SecurityCell>('cell')
    const contender = await engineer.component<SecurityCell>('cell')
    const lease = await controlled.$acquire(500)
    t.is(lease.holder, identities.operator.name)
    t.is(await controlled.setSetpoint(80), 80)
    const contention = await t.throwsAsync(contender.$acquire(500))
    t.is((contention as { code?: string })?.code, 'NotInControl')

    const live = await browser.remote.authorities(target)
    t.is(live[0].namespace, 'cell')
    t.is(live[0].authority.holder, identities.operator.name)
    t.true((live[0].authority.expiresAt ?? 0) > Date.now())

    const authorityRefusal = await browser.remote.call(target, 'cell', 'setSetpoint', [90])
    t.is(authorityRefusal.code, 'NotInControl', 'the console is authorized to operate, but does not hold this component')
    const authorizationRefusal = await browser.remote.call(target, 'cell', 'deployProgram', ['recipe-2'])
    t.is(authorizationRefusal.code, 'Forbidden', 'the console operator role is not an engineer role')
    t.is(await (await engineer.proxy<SecurityCell>('cell')).deployProgram('recipe-2'), 'recipe-2')
    t.is(await (await engineer.proxy<SecurityCell>('cell')).rotateCredentials(), 'rotated')

    const impostor = new RpcClient('http://127.0.0.1:7441', {
        name: identities.engineer.name,
        defaultTarget: target,
        credentials: { token: tokens.operator },
        readyTimeout: 1000,
        callTimeout: 300
    })
    clients.push(impostor)
    await impostor.ready()
    const stolenName = await t.throwsAsync((await impostor.proxy<SecurityCell>('cell')).status())
    t.is((stolenName as { code?: string })?.code, 'Timeout', 'a valid token cannot speak under another identity name')

    const anonymous = new RpcClient('http://127.0.0.1:7441', { name: named('anonymous'), readyTimeout: 250 })
    clients.push(anonymous)
    await t.throwsAsync(anonymous.ready(), { message: /not ready within/ })

    await waitFor(() => Date.now() > aiGrantExpiresAt)
    const lapsedGrant = await t.throwsAsync(aiCell.acknowledgeAlarm())
    t.is((lapsedGrant as { code?: string })?.code, 'Forbidden', 'the same AI call closes when its grant expires')

    await waitFor(async () => (await browser.remote.authorities(target))[0]?.authority.holder === undefined)
    const nextLease = await contender.$acquire(500)
    t.is(nextLease.holder, identities.engineer.name, 'expiry frees the component for the next authorized operator')
    t.is(await contender.setSetpoint(95), 95)
    await contender.$release()

    const describedWhileElevated = (await browser.remote.describe(target)) as ServerDescription
    // On a very slow runner the bounded elevation may already have closed. Its expiry behavior is
    // still asserted below; seeing it first is useful but not required for test stability.
    if (describedWhileElevated.elevated?.length) t.is(describedWhileElevated.elevated[0].capability, 'debug.endpoint')
    await waitFor(async () => !((await browser.remote.describe(target)) as ServerDescription).elevated?.some((one) => one.capability === 'debug.endpoint'))

    await viewer.close()
    const reconnectedViewer = await connect(identities.viewer, tokens.viewer)
    t.is(await (await reconnectedViewer.proxy<SecurityCell>('cell')).status(), 'idle', 'the same authenticated identity may reconnect cleanly')

    const security = await browser.remote.securityEvents()
    t.false(security.events.some((event) => event.kind === 'transport-change'), 'the first described posture establishes a baseline without inventing a change')
    t.true(security.events.some((event) => event.kind === 'authority-refused' && event.code === 'NotInControl'))
    t.true(security.events.some((event) => event.kind === 'authorization-refused' && event.code === 'Forbidden'))
    t.true(
        security.events.some(
            (event) => event.kind === 'ai-access' && event.code === 'allowed' && event.peer === identities.ai.name && event.target === target && event.method === 'acknowledgeAlarm'
        ),
        'an allowed target-side AI decision reaches the console as a safe peer-reported event'
    )
    t.true(security.events.some((event) => event.kind === 'ai-access' && event.code === 'refused' && event.method === 'deployProgram'))
    t.true(security.events.some((event) => event.kind === 'authority-change' && event.code === 'acquired' && event.namespace === 'cell'))
    t.true(security.events.some((event) => event.kind === 'authority-change' && event.code === 'expired' && event.namespace === 'cell'))
    t.true(
        security.events.some((event) => event.kind === 'elevation-change' && event.code === 'opened' && event.capability === 'debug.endpoint' && event.severity === 'medium')
    )
    t.true(security.events.some((event) => event.kind === 'elevation-change' && event.code === 'expired' && event.target === target))
    t.true(aiDecisions.some((decision) => decision.allowed && decision.method === 'acknowledgeAlarm' && decision.grant === 'ai.tool.write'))
    t.true(aiDecisions.some((decision) => !decision.allowed && decision.method === 'acknowledgeAlarm' && decision.grant === 'ai.tool.write'))

    const browserFacing = JSON.stringify({
        identity: await browser.remote.identity(),
        description: await browser.remote.describe(target),
        authorities: await browser.remote.authorities(target),
        security,
        refusal: authorizationRefusal,
        snapshot: controlled[rpcComponent].getSnapshot()
    })
    for (const [role, secret] of Object.entries(tokens)) t.false(browserFacing.includes(secret), `browser-facing data included the ${role} token`)

    // A disappearance weakens values already observed instead of erasing them, while presence
    // records the transition. Returning under the same address is not assumed to be the same
    // security posture: this replacement deliberately changes from authenticated to open.
    await plant.close()
    await waitFor(() => controlled[rpcComponent].getSnapshot().status === 'stale')
    await waitFor(async () => !(await browser.remote.peers()).peers.includes(target))
    t.true((await browser.remote.presence()).changes.some((change) => change.peer === target && change.state === 'offline'))
    await Promise.allSettled(clients.map((client) => client.close()))
    clients.length = 0

    plant = new RpcServer({ name: target, transports: [{ port: 7441, host: '127.0.0.1' }], exposeIntrospection: true })
    plant.exposeClassInstance(new SecurityCell())
    await plant.ready()
    await waitFor(async () => (await browser.remote.peers()).peers.includes(target))
    const replacementDescription = (await browser.remote.describe(target)) as ServerDescription
    t.true(replacementDescription.transports?.some((transport) => transport.protocol === 'socket.io' && transport.security?.authentication.value === 'none'))
    const changedSecurity = await browser.remote.securityEvents()
    t.true(
        changedSecurity.events.some(
            (event) =>
                event.kind === 'transport-change' &&
                event.code === 'authentication-changed' &&
                event.target === target &&
                event.previous === 'connection (peer)' &&
                event.current === 'none (peer)'
        ),
        'a replacement under the same peer name records its weaker authentication posture'
    )
    const transitions = (await browser.remote.presence()).changes.filter((change) => change.peer === target)
    t.true(transitions.some((change) => change.state === 'offline'))
    t.true(transitions.some((change) => change.state === 'online'))
})

test.serial('signed MQTT reaches the console and an unsigned caller becomes a bounded security event', async (t) => {
    if (!t.context.broker) {
        t.pass(`no MQTT broker at ${BROKER_URL} - skipped`)
        return
    }
    const target = named('signed-cell')
    const consoleName = named('signed-console')
    const rogueName = named('unsigned-rogue')
    const prefix = `msgrpc/security-fixture-${run}`
    const secrets = {
        [target]: `target-signing-secret-${run}`,
        [consoleName]: `console-signing-secret-${run}`
    }
    const verifier = createHmacVerifier(
        (source) => secrets[source as keyof typeof secrets],
        (source) => (source === consoleName ? { name: source, roles: ['operator'] } : source === target ? { name: source, roles: ['device'] } : undefined)
    )
    const plant = new RpcServer({
        name: target,
        transports: [{ brokerurl: BROKER_URL, prefix, sessionExpirySeconds: 10, sign: createHmacSigner(secrets[target]), verify: verifier }],
        requireAuthenticatedPeers: true,
        exposeIntrospection: true
    })
    plant.exposeClassInstance(new SecurityCell())
    await plant.ready()
    t.teardown(() => plant.close())

    const running = await startConsole({
        broker: BROKER_URL,
        prefix,
        sign: createHmacSigner(secrets[consoleName]),
        verify: verifier,
        port: 7443,
        host: '127.0.0.1',
        name: consoleName,
        callTimeout: 500
    })
    t.teardown(() => running.close())
    const browser = await browserClient(running.url)
    t.teardown(() => browser.client.close())
    await waitFor(async () => (await browser.remote.peers()).peers.includes(target))

    t.is((await browser.remote.call(target, 'cell', 'status')).result, 'idle')
    const description = (await browser.remote.describe(target)) as ServerDescription
    t.true(description.transports?.some((transport) => transport.protocol === 'mqtt' && transport.security?.signing.value === 'bidirectional'))

    const rogue = new RpcClient(undefined, {
        name: rogueName,
        defaultTarget: consoleName,
        callTimeout: 300,
        transport: new MqttTransport(rogueName, BROKER_URL, { prefix, sessionExpirySeconds: 10 })
    })
    t.teardown(() => rogue.close())
    await rogue.ready()
    await t.throwsAsync((await rogue.proxy<ConsoleService>('console')).securityEvents(), { message: /Timeout/ })
    await waitFor(async () => (await browser.remote.securityEvents()).events.some((event) => event.kind === 'signature-failure' && event.peer === rogueName))

    const browserFacing = JSON.stringify({ description, security: await browser.remote.securityEvents() })
    for (const secret of Object.values(secrets)) t.false(browserFacing.includes(secret), 'a signing secret reached browser-facing data')
})
