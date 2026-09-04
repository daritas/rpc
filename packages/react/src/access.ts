import type { RpcEffect } from '@source-repo/rpc'
import type { DescribedElevation, DescribedMethod, RpcMethodSemantics } from './types.js'

export interface MethodAccessExplanation {
    readonly effect: RpcEffect | 'unknown'
    readonly semantics: RpcMethodSemantics | 'unknown'
    readonly authority: 'required' | 'not-required'
    /** Static description is never an authorization dry-run. */
    readonly decision: 'unknown-at-call-time'
    readonly elevations: readonly DescribedElevation[]
}

/**
 * Explain only what describe() proves.
 *
 * Effects and authority are reported by the target peer. Elevations describe power the target
 * currently holds; they do not grant this caller access. An authorizer may use identity, roles,
 * grants, parameters and private policy, so this function deliberately never returns “allowed”.
 */
export const explainMethodAccess = (
    method: Pick<DescribedMethod, 'effect' | 'semantics' | 'requiresAuthority'>,
    elevations: readonly DescribedElevation[] = []
): MethodAccessExplanation => ({
    effect: method.effect ?? 'unknown',
    semantics: method.semantics ?? 'unknown',
    authority: method.requiresAuthority ? 'required' : 'not-required',
    decision: 'unknown-at-call-time',
    elevations: [...elevations]
})
