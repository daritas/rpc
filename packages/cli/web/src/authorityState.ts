import type { DescribedComponentAuthority } from '@source-repo/rpc'

export type AuthoritiesByPeer = Readonly<Record<string, readonly DescribedComponentAuthority[] | undefined>>
export type AuthorityReadGenerations = Readonly<Record<string, number>>

/** An unversioned peer is generation zero until an action or incarnation change supersedes it. */
export const authorityReadIsCurrent = (generations: AuthorityReadGenerations, peer: string, started: number): boolean =>
    (generations[peer] ?? 0) === started

const currentWins = (current: DescribedComponentAuthority, incoming: DescribedComponentAuthority): boolean => {
    const held = current.authority
    const next = incoming.authority
    if (held.generation !== next.generation) return held.generation > next.generation

    // A renewal deliberately keeps its generation. Within one generation the holder cannot
    // change, and an expiry can only move later, so an earlier or less complete lease is stale too.
    if (held.holder !== next.holder) return true
    if (held.expiresAt !== undefined && next.expiresAt === undefined) return true
    return held.expiresAt !== undefined && next.expiresAt !== undefined && held.expiresAt > next.expiresAt
}

/**
 * Merge a live authority answer without allowing an older poll to undo a newer observation.
 *
 * Authority generations are monotonic during one peer incarnation. The console clears a peer's
 * entry when that incarnation goes offline or is reshaped, so a later process under the same name
 * starts without inheriting this ordering rule.
 */
export const reconcileAuthorities = (
    state: AuthoritiesByPeer,
    peer: string,
    incoming: readonly DescribedComponentAuthority[] | undefined
): AuthoritiesByPeer => {
    if (incoming === undefined) return { ...state, [peer]: undefined }
    const previous = state[peer]
    if (!previous?.length || !incoming.length) return { ...state, [peer]: incoming }
    const byNamespace = new Map(previous.map((entry) => [entry.namespace, entry]))
    const reconciled = incoming.map((entry) => {
        const held = byNamespace.get(entry.namespace)
        return held && currentWins(held, entry) ? held : entry
    })
    return { ...state, [peer]: reconciled }
}
