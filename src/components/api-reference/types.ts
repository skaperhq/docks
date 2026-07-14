export type RequestTab = "Docs" | "Params" | "Headers" | "Body"

export type KeyValueRow = {
  key: string
  value: string
  description: string
  enabled?: boolean
  required?: boolean
  type?: string
  location?: string
  defaultValue?: string
  enum?: string[]
  pattern?: string
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  example?: any
  fileName?: string
  file?: Blob
}

export type RequestBodyDraft = {
  mode: string
  contentType: string
  value: string
  formDataRows?: KeyValueRow[]
  urlEncodedRows?: KeyValueRow[]
  binaryFileName?: string
  binaryFile?: Blob
  graphqlQuery?: string
  graphqlVariables?: string
}

export type RequestDraft = {
  params: KeyValueRow[]
  headers: KeyValueRow[]
  body: RequestBodyDraft
}

export type ResponseHeader = {
  key: string
  value: string
}

export type ResponseResult = {
  status: number
  statusText: string
  ok: boolean
  durationMs: number
  sizeBytes: number
  contentType: string
  bodyText: string
  headers: ResponseHeader[]
  cookies: ResponseHeader[]
  url: string
}

export type SavedRequestSnapshot = {
  method: string
  transport: "http" | "websocket"
  mode: "standard" | "sse"
  url: string
  params: KeyValueRow[]
  headers: KeyValueRow[]
  body: RequestBodyDraft
  environment: {
    id?: string
    name?: string
    baseUrl?: string
  } | null
  sentAt: string
}

export type SavedResponseSummary = {
  id: string
  operationId: string
  method: string
  path: string
  name: string
  status: number
  ok: boolean
  durationMs: number
  sizeBytes: number
  contentType: string
  createdAt: string
}

export type ResponseState =
  | { status: "idle" }
  | { status: "loading"; startedAt: number }
  | { status: "success"; result: ResponseResult }
  | { status: "error"; error: string; durationMs: number }
