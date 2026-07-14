import { getDocksStorageAdapter } from "./storage-adapter"

export interface EnvironmentVariableInput {
  id: string
  key: string
  value: string
  enabled: boolean
  isSecret?: boolean
  description?: string
}

export interface EnvironmentInput {
  id: string
  name: string
  baseUrl: string
  variables: EnvironmentVariableInput[]
}

export async function getEnvironments() {
  return getDocksStorageAdapter().getEnvironments()
}

export async function saveEnvironment({
  data,
}: {
  data: { id: string; name: string; baseUrl: string }
}) {
  return getDocksStorageAdapter().saveEnvironment({ data })
}

export async function deleteEnvironment({ data: id }: { data: string }) {
  return getDocksStorageAdapter().deleteEnvironment({ data: id })
}

export async function saveVariable({
  data,
}: {
  data: { envId: string; variable: EnvironmentVariableInput }
}) {
  return getDocksStorageAdapter().saveVariable({ data })
}

export async function deleteVariable({
  data,
}: {
  data: { envId: string; varId: string }
}) {
  return getDocksStorageAdapter().deleteVariable({ data })
}

export async function bulkSyncEnvironments({
  data: environments,
}: {
  data: EnvironmentInput[]
}) {
  return getDocksStorageAdapter().bulkSyncEnvironments({ data: environments })
}
