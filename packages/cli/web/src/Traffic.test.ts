import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'
import { SecurityDataProvider } from '@source-repo/query'
import type { TappedFrame } from '../../../react/src/types'
import { staticSource, ValueTree } from '../../../react/src/ValueTree'
import { Traffic, trafficRows } from './Traffic'
import { jsonLines } from './jsonl'

const secret = 'credential-that-must-not-reach-the-page'
const captured: TappedFrame = {
    at: 1_800_000_000_000,
    source: 'operator',
    target: 'line',
    kind: 'ERROR',
    namespace: 'cell',
    method: 'start',
    id: 'call-1',
    code: 'Forbidden',
    error: `upstream refused token=${secret}`,
    params: [{ token: secret }],
    result: { credential: secret },
    taps: ['tap-1']
}

describe('traffic disclosure boundary', () => {
    test('metadata-only rows exclude payloads from rendered markup and JSONL', () => {
        const untrusted = [{ ...captured, credential: secret } as TappedFrame]
        const rows = trafficRows(untrusted, false)
        const html = renderToStaticMarkup(
            createElement(Traffic, {
                service: null,
                selected: null,
                frames: untrusted,
                onClear: vi.fn(),
                paused: false,
                onPaused: vi.fn(),
                hidden: false
            })
        )
        const exported = jsonLines(rows)

        expect(html).toContain('Forbidden')
        expect(exported).toContain('Forbidden')
        expect(html).not.toContain(secret)
        expect(exported).not.toContain(secret)
        expect(rows[0]).not.toHaveProperty('credential')
    })

    test('payload-enabled capture is explicit and exported verbatim', () => {
        const rows = trafficRows([captured], true)

        expect(jsonLines(rows)).toContain(secret)
        expect(rows[0].error).toContain(secret)
        expect(rows[0].params).toEqual([{ token: secret }])
    })
})

test('JSONL has one object per line and no phantom row for an empty view', () => {
    expect(jsonLines([{ id: 1 }, { id: 2 }])).toBe('{"id":1}\n{"id":2}\n')
    expect(jsonLines([])).toBe('')
})

test('security projection keeps credentials out of the generic renderer and JSONL', () => {
    const provider = new SecurityDataProvider({
        peers: ['line'],
        descriptions: {
            line: {
                name: 'line',
                validating: true,
                transports: [
                    {
                        name: 'plant',
                        protocol: 'socket.io',
                        role: 'connect',
                        endpoint: `http://operator:${secret}@plant.example/control?token=${secret}#${secret}`,
                        security: {
                            authentication: { value: 'credentials-presented', evidence: 'peer' },
                            encryption: { value: 'none', evidence: 'peer' },
                            signing: { value: 'none', evidence: 'peer' },
                            relay: { value: 'not-applicable', evidence: 'peer' }
                        },
                        credential: secret
                    } as never
                ]
            }
        },
        refused: { line: new Error(`authorization=${secret}`) },
        events: [
            {
                id: 1,
                at: 1_800_000_000_000,
                kind: 'authorization-refused',
                severity: 'medium',
                evidence: 'link',
                peer: 'line',
                code: 'Forbidden',
                rawError: secret
            } as never
        ]
    })
    const answer = provider.dataRequest('getList', ['security'], { recursive: true, pagination: { page: 0, pageSize: 100 } }) as {
        data: readonly unknown[]
    }
    const html = renderToStaticMarkup(createElement(ValueTree, { source: staticSource(answer.data) }))
    const exported = jsonLines(answer.data)

    expect(html).toContain('plant.example')
    expect(exported).toContain('Forbidden')
    expect(html).not.toContain(secret)
    expect(exported).not.toContain(secret)
})
