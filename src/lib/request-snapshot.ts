import type {
  RequestDraft,
  SavedRequestSnapshot,
} from "@/components/api-reference/types"

/** Restores every editable part of a saved request without sharing row arrays. */
export function requestDraftFromSnapshot(
  snapshot: SavedRequestSnapshot
): RequestDraft {
  return {
    params: snapshot.params.map((row) => ({ ...row })),
    headers: snapshot.headers.map((row) => ({ ...row })),
    body: {
      ...snapshot.body,
      formDataRows: snapshot.body.formDataRows?.map((row) => ({ ...row })),
      urlEncodedRows: snapshot.body.urlEncodedRows?.map((row) => ({ ...row })),
    },
  }
}
