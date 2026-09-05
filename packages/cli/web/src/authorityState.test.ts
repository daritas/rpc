import { describe, expect, it } from 'vitest'
import type { DescribedComponentAuthority } from '@source-repo/rpc'
import { authorityReadIsCurrent, reconcileAuthorities, type AuthoritiesByPeer } from './authorityState'

const authority = (generation: number, holder?: string, expiresAt?: number): DescribedComponentAuthority => ({
    namespace: 'line',
    methods: ['setSetpoint'],
    authority: { generation, ...(holder ? { holder } : {}), ...(expiresAt ? { expiresAt } : {}) }
})

const held = (state: AuthoritiesByPeer) => state.line?.[0]

describe('authority state reconciliation', () => {
    it('accepts the initial read and rejects one superseded by an action', () => {
        expect(authorityReadIsCurrent({}, 'line', 0)).toBe(true)
        expect(authorityReadIsCurrent({ line: 1 }, 'line', 0)).toBe(false)
    })

    it('does not let an older poll replace an action refresh', () => {
        const current = { line: [authority(15, 'security-console', 2000)] }
        const next = reconcileAuthorities(current, 'line', [authority(14)])

        expect(held(next)).toEqual(authority(15, 'security-console', 2000))
    })

    it('keeps the later expiry when a renewal has the same generation', () => {
        const current = { line: [authority(15, 'security-console', 3000)] }
        const next = reconcileAuthorities(current, 'line', [authority(15, 'security-console', 2000)])

        expect(held(next)).toEqual(authority(15, 'security-console', 3000))
    })

    it('accepts a newer generation and explicit unknown or empty results', () => {
        const current = { line: [authority(14)] }
        const newer = reconcileAuthorities(current, 'line', [authority(15, 'security-console', 2000)])

        expect(held(newer)).toEqual(authority(15, 'security-console', 2000))
        expect(reconcileAuthorities(newer, 'line', []).line).toEqual([])
        expect(reconcileAuthorities(newer, 'line', undefined).line).toBeUndefined()
    })
})
