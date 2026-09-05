import { useEffect, useMemo, useRef, useState } from 'react'
import type { RpcDataProvider, RpcDataResource } from '@source-repo/rpc'
import { RpcDataCache, type RpcDataAnswer, type RpcQuestion } from '@source-repo/query'
import { ValueGrid } from './ValueGrid.js'
import type { DescribedAction, DescribedComponent, DescribedResource } from './types.js'

const localResource = (resource: RpcDataResource): DescribedResource => ({
    path: [...resource.path],
    verbs: [...resource.verbs],
    ...(resource.row ? { row: resource.row as DescribedResource['row'] } : {}),
    ...(resource.columns ? { columns: [...resource.columns] } : {}),
    ...(resource.shape ? { shape: resource.shape } : {}),
    ...(resource.label ? { label: resource.label } : {}),
    ...(resource.presentation
        ? {
              presentation: {
                  ...(resource.presentation.defaultColumns ? { defaultColumns: [...resource.presentation.defaultColumns] } : {}),
                  ...(resource.presentation.representation ? { representation: resource.presentation.representation } : {}),
                  ...(resource.presentation.detail ? { detail: [...resource.presentation.detail] } : {}),
                  ...(resource.presentation.edit ? { edit: [...resource.presentation.edit] } : {}),
                  ...(resource.presentation.sections
                      ? { sections: resource.presentation.sections.map((section) => ({ label: section.label, fields: [...section.fields] })) }
                      : {})
              }
          }
        : {}),
    ...(resource.actions
        ? {
              actions: resource.actions.map((action) => ({
                  method: action.method,
                  ...(action.label ? { label: action.label } : {}),
                  ...(action.confirm !== undefined ? { confirm: action.confirm } : {}),
                  ...(action.appliesTo ? { appliesTo: action.appliesTo } : {}),
                  ...(action.kinds ? { kinds: [...action.kinds] } : {})
              }))
          }
        : {}),
    ...(resource.references ? { references: resource.references.map((reference) => ({ field: reference.field, target: [...reference.target] })) } : {})
})

const localComponent = (resource: RpcDataResource): DescribedComponent => ({ subscribers: 0, resources: [localResource(resource)] })

/** Put any local RpcDataProvider into the ordinary scope-tree/leaf-grid. */
export const DataProviderValueGrid = ({
    provider,
    resource,
    period,
    pageSize = 50,
    preview: initialPreview = true,
    onScope,
    actionsFor = () => undefined,
    onAction
}: {
    provider: RpcDataProvider
    resource: RpcDataResource
    period?: number
    pageSize?: number
    preview?: boolean
    onScope?: (id: string | undefined) => void
    actionsFor?: (path: string[]) => DescribedAction[] | undefined
    onAction?: (action: DescribedAction, id: string, resource: readonly string[], label?: string) => void
}) => {
    const current = useRef(provider)
    current.current = provider
    const cache = useMemo(
        () =>
            new RpcDataCache({
                ask: async ({ method, resource: path, params }) => (await current.current.dataRequest(method, path, params ?? {})) as RpcDataAnswer
            }),
        []
    )
    const [preview, setPreview] = useState(initialPreview)
    const [size, setSize] = useState(pageSize)
    const component = useMemo(() => localComponent(resource), [resource])
    const question = (method: RpcQuestion['method'], params: RpcQuestion['params']): RpcQuestion => ({
        target: '$local-data-view',
        namespace: '$local-data-view',
        method,
        resource: resource.path,
        params
    })

    useEffect(() => {
        // A replacement provider is a new projection at the same local question address. Refresh
        // active questions without throwing away the reader's scope, filter or selected row.
        void cache.queryClient.invalidateQueries({ refetchType: 'active' })
    }, [cache, provider])
    useEffect(() => () => cache.close(), [cache])

    return (
        <ValueGrid
            component={component}
            scope={[...resource.path]}
            cache={cache}
            period={period}
            preview={preview}
            onPreview={setPreview}
            pageSize={size}
            onPageSize={setSize}
            onScope={onScope}
            branchQuestion={(_path, parentId, page, branchSize) =>
                question('getChildren', { ...(parentId !== undefined ? { parentId } : {}), pagination: { page, pageSize: branchSize } })
            }
            scopedQuestion={(_path, under, page, rowPageSize, filter, sort) =>
                question('getList', {
                    ...(under !== undefined ? { under } : {}),
                    recursive: true,
                    pagination: { page, pageSize: rowPageSize },
                    ...(filter ? { filter } : {}),
                    ...(sort ? { sort } : {})
                })
            }
            rowQuestion={(_path, id) => question('getOne', { id })}
            manyQuestion={(_path, ids) => question('getMany', { ids })}
            actionsFor={actionsFor}
            onAction={onAction}
        />
    )
}
