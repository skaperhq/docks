export type RequestTabCloseResult = {
  openOperationIds: string[]
  nextOperationId?: string
  shouldShowOverview: boolean
}

/**
 * Computes tab state after a close action. Closing the active tab selects the
 * nearest remaining tab; Overview is shown only after the final tab closes.
 */
export function getRequestTabCloseResult({
  openOperationIds,
  activeOperationId,
  closedOperationId,
}: {
  openOperationIds: string[]
  activeOperationId?: string
  closedOperationId: string
}): RequestTabCloseResult {
  const closedIndex = openOperationIds.indexOf(closedOperationId)
  const nextOpenOperationIds = openOperationIds.filter(
    (operationId) => operationId !== closedOperationId
  )
  const closedActiveOperation =
    closedIndex !== -1 && activeOperationId === closedOperationId

  return {
    openOperationIds: nextOpenOperationIds,
    nextOperationId:
      closedActiveOperation && nextOpenOperationIds.length > 0
        ? nextOpenOperationIds[
            Math.min(closedIndex, nextOpenOperationIds.length - 1)
          ]
        : undefined,
    shouldShowOverview:
      closedActiveOperation && nextOpenOperationIds.length === 0,
  }
}
