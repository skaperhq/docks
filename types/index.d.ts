export type DocksUIOptions = {
  /** URL that the browser should fetch to load the OpenAPI JSON document. */
  url: string
  /** Optional HTML document title. */
  title?: string
  /** Optional CSP nonce applied to the embedded style and module script. */
  nonce?: string
  /** Optional password protecting the UI. */
  password?: string
  /**
   * Stable identifier used to isolate browser storage for this API workspace.
   * Defaults to an identifier derived from the host project and OpenAPI URL.
   */
  workspaceId?: string
  /** Authenticated PostgreSQL storage returned by createDocksPostgres(). */
  storage?: DocksRemoteStorage
  /** Optional same-origin relay used for cross-origin API traffic. */
  relay?: DocksRelay
}

export type DocksRemoteStorage = {
  readonly path: string
  readonly workspaceId: string
}

export type DocksRelayTransport = "http" | "websocket"

export type DocksRelayDestination = {
  url: URL
  transport: DocksRelayTransport
}

export type DocksRelayOptions = {
  /** Same-origin path on which the host mounts the relay handler. */
  path: string
  /** Exact upstream origins permitted by the relay. */
  allowedOrigins?: string[]
  /** Optional dynamic destination authorization hook. */
  allowDestination?: (
    destination: DocksRelayDestination
  ) => boolean | Promise<boolean>
  /** Allows callback-authorized private-network destinations. Defaults to false. */
  allowPrivateNetwork?: boolean
}

export type DocksRelay = {
  readonly path: string
  readonly handler: {
    (context: { req: { raw: Request } }): Promise<Response>
    (request: unknown, response: unknown): Promise<void>
    (request: Request): Promise<Response>
  }
  /** Handles only upgrades whose pathname exactly matches `path`. */
  readonly handleUpgrade: (
    request: unknown,
    socket: unknown,
    head: Uint8Array
  ) => boolean
}

export type HonoContextLike = {
  html: (content: string) => Response | Promise<Response>
}

export type ExpressResponseLike = {
  type?: (contentType: string) => unknown
  send: (content: string) => unknown
}

export type DocksHandler = {
  (context: HonoContextLike): Response | Promise<Response>
  (request: unknown, response: ExpressResponseLike): unknown
  (): Response
}

/** Creates a self-contained HTML route handler for Docks. */
export declare function docksUI(options: DocksUIOptions): DocksHandler

/** Creates a restricted same-origin relay for cross-origin API requests. */
export declare function createDocksRelay(options: DocksRelayOptions): DocksRelay

export default docksUI
