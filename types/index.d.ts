export type SkaperUIOptions = {
  /** URL that the browser should fetch to load the OpenAPI JSON document. */
  url: string
  /** Optional HTML document title. */
  title?: string
  /** Optional CSP nonce applied to the embedded style and module script. */
  nonce?: string
  /** Optional password protecting the UI. */
  password?: string
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

export default skaperUI
