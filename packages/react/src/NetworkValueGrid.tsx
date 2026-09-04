import { useSyncExternalStore } from 'react'
import { networkResource, networkScopeFromKey, type NetworkRpcDataProvider, type NetworkScopeRef } from '@source-repo/query'
import type { DescribedAction } from './types.js'
import { DataProviderValueGrid } from './DataProviderValueGrid.js'
import { networkMethodSelectionFromRowKey, type NetworkMethodSelection } from './network-method.js'

/**
 * The existing scope-tree/leaf-grid arrangement, pointed at the local network resource adapter.
 *
 * There is intentionally no second network viewer here. `ValueGrid` already owns the arrangement:
 * a provider tree scopes a paged leaf table, and an optional record panel opens the selected row.
 * This component supplies only the synthetic component declaration and question addresses needed
 * to let that view ask a client-side `NetworkRpcDataProvider`.
 */

const CALL_METHOD: DescribedAction = { method: 'call', label: 'call', kinds: ['rpc.method'] }

export const NetworkValueGrid = ({
    provider,
    period,
    pageSize = 50,
    onScope,
    onCallMethod
}: {
    provider: NetworkRpcDataProvider
    period?: number
    pageSize?: number
    /** Structural selection for console chrome; resource data remains owned by this grid. */
    onScope?: (scope: NetworkScopeRef) => void
    /** Open the host's call form for a method-description row. */
    onCallMethod?: (method: NetworkMethodSelection) => void
}) => {
    const status = useSyncExternalStore(provider.subscribe, provider.getStatus, provider.getStatus)

    return (
        <div className="network-value-grid">
            {status.settled && status.partial && (
                <div className="network-result-notice" role="status">
                    <strong>Incomplete network result</strong>
                    <span>
                        {status.rows} rows from {status.asked} source{status.asked === 1 ? '' : 's'}
                        {status.hasMore ? ' · the bounded result has more rows' : ''}
                        {status.refused.length ? ` · ${status.refused.length} source${status.refused.length === 1 ? '' : 's'} refused` : ''}
                    </span>
                    {status.refused.length > 0 && (
                        <details>
                            <summary>show refusals</summary>
                            <ul>
                                {status.refused.map(({ source: refused, reason }) => (
                                    <li key={`${refused.peer}\u0000${refused.namespace}\u0000${refused.resource.join('\u0000')}`}>
                                        <span className="mono">
                                            {refused.peer}/{refused.namespace}/{refused.resource.join('.')}
                                        </span>{' '}
                                        — {reason}
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                </div>
            )}
            <DataProviderValueGrid
                provider={provider}
                resource={networkResource(status.columns)}
                period={period}
                pageSize={pageSize}
                onScope={(id) => onScope?.(id === undefined ? { kind: 'network' } : (networkScopeFromKey(id) ?? { kind: 'network' }))}
                actionsFor={() => (onCallMethod ? [CALL_METHOD] : undefined)}
                onAction={(_action, id) => {
                    const method = networkMethodSelectionFromRowKey(id)
                    if (method) onCallMethod?.(method)
                }}
            />
        </div>
    )
}
