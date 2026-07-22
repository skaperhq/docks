export type SkaperUIOptions = {
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
  /** Optional same-origin relay used for cross-origin API traffic. */
  relay?: SkaperRelay
}

export type SkaperRelayTransport = "http" | "websocket"

export type SkaperRelayDestination = {
  url: URL
  transport: SkaperRelayTransport
}

export type SkaperRelayOptions = {
  /** Same-origin path on which the host mounts the relay handler. */
  path: string
  /** Exact upstream origins permitted by the relay. */
  allowedOrigins?: string[]
  /** Optional dynamic destination authorization hook. */
  allowDestination?: (
    destination: SkaperRelayDestination
  ) => boolean | Promise<boolean>
  /** Allows callback-authorized private-network destinations. Defaults to false. */
  allowPrivateNetwork?: boolean
}

export type SkaperRelay = {
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

export type SkaperHandler = {
  (context: HonoContextLike): Response | Promise<Response>
  (request: unknown, response: ExpressResponseLike): unknown
  (): Response
}

/** Creates a self-contained HTML route handler for Skaper. */
export declare function skaperUI(options: SkaperUIOptions): SkaperHandler

/** Creates a restricted same-origin relay for cross-origin API requests. */
export declare function createSkaperRelay(
  options: SkaperRelayOptions
): SkaperRelay

export default skaperUI
