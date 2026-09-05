import { describe, expect, it } from 'vitest'
import { explainMethodAccess } from './access.js'

describe('static access explanation', () => {
    it('states declared effect and authority without manufacturing an authorization decision', () => {
        expect(
            explainMethodAccess(
                { effect: 'program', semantics: 'idempotent-command', requiresAuthority: true },
                [{ capability: 'docker.create', reason: 'maintenance' }]
            )
        ).toEqual({
            effect: 'program',
            semantics: 'idempotent-command',
            authority: 'required',
            decision: 'unknown-at-call-time',
            elevations: [{ capability: 'docker.create', reason: 'maintenance' }]
        })
    })

    it('keeps missing facts unknown while absence of the authority flag means it is not required', () => {
        expect(explainMethodAccess({})).toEqual({
            effect: 'unknown',
            semantics: 'unknown',
            authority: 'not-required',
            decision: 'unknown-at-call-time',
            elevations: []
        })
    })
})
