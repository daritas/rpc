import test from 'ava'
import { MessagePortTransport } from './Transports/MessagePortTransport.js'
import { MqttTransport } from './Transports/MqttTransport.js'
import { SocketIoClientTransport } from './Transports/SocketIoClientTransport.js'
import { SocketIoServerTransport } from './Transports/SocketIoServerTransport.js'

/**
 * Ask the description methods without opening their transports. Their inputs are constructor
 * configuration held on the instance; no live socket contributes to the answer, which is exactly
 * the stable/reportable boundary this test protects.
 */
test('built-in transports report bounded posture and never the credentials it was derived from', (t) => {
    const listen = SocketIoServerTransport.prototype.rpcDescription.call({
        getName: () => 'hub',
        describedEndpoint: 'https://0.0.0.0:8443/rpc?token=not-published',
        authenticate: () => ({ name: 'peer' }),
        relay: () => true,
        server: undefined
    } as unknown as SocketIoServerTransport)
    t.is(listen.endpoint, 'https://0.0.0.0:8443/rpc')
    t.deepEqual(listen.security, {
        authentication: { value: 'connection', evidence: 'peer' },
        encryption: { value: 'tls', evidence: 'peer' },
        signing: { value: 'none', evidence: 'peer' },
        relay: { value: 'conditional', evidence: 'peer' }
    })

    const connect = SocketIoClientTransport.prototype.rpcDescription.call({
        getName: () => 'panel',
        url: 'https://operator:socket-secret@example.test/rpc?token=also-secret#private',
        allowInsecureTls: true,
        options: { auth: { token: 'socket-secret' } }
    } as unknown as SocketIoClientTransport)
    t.is(connect.endpoint, 'https://example.test/rpc')
    t.deepEqual(connect.security, {
        authentication: { value: 'credentials-presented', evidence: 'peer' },
        encryption: { value: 'tls-unverified', evidence: 'peer' },
        signing: { value: 'none', evidence: 'peer' },
        relay: { value: 'not-applicable', evidence: 'peer' }
    })

    const mqtt = MqttTransport.prototype.rpcDescription.call({
        getName: () => 'cell',
        url: 'mqtts://operator:mqtt-secret@broker.test:8883/plant?token=also-secret',
        mqttOptions: { username: 'operator', password: 'mqtt-secret' },
        sign: () => 'signature',
        verify: () => ({ name: 'cell' })
    } as unknown as MqttTransport)
    t.is(mqtt.endpoint, 'mqtts://broker.test:8883/plant')
    t.deepEqual(mqtt.security, {
        authentication: { value: 'credentials-presented', evidence: 'peer' },
        encryption: { value: 'tls-verified', evidence: 'peer' },
        signing: { value: 'bidirectional', evidence: 'peer' },
        relay: { value: 'not-applicable', evidence: 'peer' }
    })

    const port = MessagePortTransport.prototype.rpcDescription.call({ getName: () => 'worker' } as unknown as MessagePortTransport)
    t.deepEqual(port.security, {
        authentication: { value: 'none', evidence: 'peer' },
        encryption: { value: 'local', evidence: 'peer' },
        signing: { value: 'none', evidence: 'peer' },
        relay: { value: 'not-applicable', evidence: 'peer' }
    })

    const published = JSON.stringify([listen, connect, mqtt, port])
    for (const secret of ['socket-secret', 'mqtt-secret', 'also-secret', 'not-published', 'operator']) t.false(published.includes(secret), secret)
})

test('none and unknown remain different security facts', (t) => {
    const unknown = SocketIoClientTransport.prototype.rpcDescription.call({
        getName: () => 'custom-url',
        url: 'not a safely understood endpoint',
        allowInsecureTls: false,
        options: {}
    } as unknown as SocketIoClientTransport)
    t.deepEqual(unknown.security?.encryption, { evidence: 'unknown' })
    t.deepEqual(unknown.security?.authentication, { value: 'none', evidence: 'peer' })
    t.is(unknown.endpoint, undefined)
})
