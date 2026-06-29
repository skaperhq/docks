export type RequestTab = "Docs" | "Params" | "Authorization" | "Headers" | "Body"

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
  example?: unknown
}

export type RequestBodyDraft = {
  mode: string
  contentType: string
  value: string
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

export type ResponseState =
  | { status: "idle" }
  | { status: "loading"; startedAt: number }
  | { status: "success"; result: ResponseResult }
  | { status: "error"; error: string; durationMs: number }
