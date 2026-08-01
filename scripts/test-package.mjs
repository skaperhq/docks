import assert from "node:assert/strict"
import crypto from "node:crypto"
import { createServer } from "node:http"
import { createRequire } from "node:module"
import { stat } from "node:fs/promises"
import { WebSocket, WebSocketServer } from "ws"
import skaperUI, {
  createSkaperRelay,
  skaperUI as namedSkaperUI,
} from "../dist/package/index.js"
import { createSkaperMcp } from "../dist/package/mcp.js"

const require = createRequire(import.meta.url)
const commonJsSkaperUI = require("../dist/package/index.cjs")
const commonJsMcp = require("../dist/package/mcp.cjs")

assert.equal(skaperUI, namedSkaperUI)
assert.equal(commonJsSkaperUI, commonJsSkaperUI.skaperUI)
assert.equal(typeof createSkaperRelay, "function")
assert.equal(typeof commonJsSkaperUI.createSkaperRelay, "function")
assert.equal(typeof createSkaperMcp, "function")
assert.equal(typeof commonJsMcp.createSkaperMcp, "function")

const packageMcp = await createSkaperMcp({
  openapi: {
    openapi: "3.1.0",
    info: { title: "Package MCP", version: "1.0.0" },
    paths: {},
  },
})
assert.equal(packageMcp.model.info.title, "Package MCP")
await packageMcp.close()

const commonJsPackageMcp = await commonJsMcp.createSkaperMcp({
  openapi: {
    openapi: "3.0.3",
    info: { title: "CommonJS MCP", version: "1.0.0" },
    paths: {},
  },
})
assert.equal(commonJsPackageMcp.model.info.title, "CommonJS MCP")
await commonJsPackageMcp.close()

const cliMode = (await stat(new URL("../dist/package/cli.js", import.meta.url)))
  .mode
assert.ok(cliMode & 0o100)

const handler = skaperUI({
  url: "/docs/openapi.json",
  title: "Example API",
  nonce: "test-nonce",
})
const html = handler({ html: (content) => content })

assert.match(html, /^<!doctype html>/)
assert.match(html, /<title>Example API<\/title>/)
assert.match(html, /const openApiUrl = "\/docs\/openapi.json"/)
assert.match(html, /const workspaceId = "auto-[a-f0-9]{24}"/)
assert.match(html, /globalThis\.__SKAPER_WORKSPACE_ID__ = workspaceId/)
assert.match(html, /<style nonce="test-nonce">/)
assert.match(html, /<script type="module" nonce="test-nonce">/)
assert.doesNotMatch(html, /process\.env/)

// Test password option validation
assert.throws(() => {
  skaperUI({
    url: "/docs/openapi.json",
    password: 123,
  })
}, TypeError)

assert.throws(() => {
  skaperUI({
    url: "/docs/openapi.json",
    workspaceId: " ",
  })
}, TypeError)

const isolatedHtml = skaperUI({
  url: "/docs/openapi.json",
  workspaceId: "repo-billing",
})({ html: (content) => content })
assert.match(isolatedHtml, /const workspaceId = "repo-billing"/)

// Test password hashing and HTML injection
const expectedHash = crypto
  .createHash("sha256")
  .update("supersecretpassword")
  .digest("hex")
const passwordHandler = skaperUI({
  url: "/docs/openapi.json",
  password: "supersecretpassword",
})
const passwordHtml = passwordHandler({ html: (content) => content })
assert.match(passwordHtml, new RegExp(`const passwordHash = "${expectedHash}"`))
assert.match(passwordHtml, /class=\\"skaper-login-container\\"/)
assert.match(passwordHtml, /id=\\"skaper-password-input\\"/)

let expressType
let expressHtml
handler(
  {},
  {
    type(value) {
      expressType = value
    },
    send(content) {
      expressHtml = content
    },
  }
)
assert.equal(expressType, "html")
assert.equal(expressHtml, html)

const standardResponse = handler()
assert.ok(standardResponse instanceof Response)
assert.match(standardResponse.headers.get("content-type"), /^text\/html/)

assert.throws(
  () =>
    createSkaperRelay({
      path: "relative",
      allowedOrigins: ["https://api.example.com"],
    }),
  /absolute relay path/
)
assert.throws(
  () => createSkaperRelay({ path: "/docs/_relay" }),
  /allowedOrigins or allowDestination/
)

const upstreamServer = createServer((request, response) => {
  response.statusCode = 201
  response.setHeader("content-type", "application/json")
  response.setHeader("x-upstream", "yes")
  let body = ""
  request.setEncoding("utf8")
  request.on("data", (chunk) => {
    body += chunk
  })
  request.on("end", () => {
    response.end(JSON.stringify({ method: request.method, body }))
  })
})
let upstreamWebSocketAuthorization
const upstreamWebSocketServer = new WebSocketServer({ server: upstreamServer })
upstreamWebSocketServer.on("connection", (socket, request) => {
  upstreamWebSocketAuthorization = request.headers.authorization
  socket.on("message", (message, isBinary) => {
    socket.send(message, { binary: isBinary })
  })
})
await new Promise((resolve) => upstreamServer.listen(0, "127.0.0.1", resolve))
const upstreamAddress = upstreamServer.address()
assert.ok(upstreamAddress && typeof upstreamAddress === "object")
const upstreamOrigin = `http://127.0.0.1:${upstreamAddress.port}`
const relay = createSkaperRelay({
  path: "/docs/_relay",
  allowedOrigins: [upstreamOrigin],
})
const relayHtml = skaperUI({
  url: `${upstreamOrigin}/openapi.json`,
  relay,
})({ html: (content) => content })
assert.match(relayHtml, /globalThis\.__SKAPER_RELAY__ = relay/)
assert.match(relayHtml, /"path":"\/docs\/_relay"/)

const relayMetadata = Buffer.from(
  JSON.stringify({
    url: `${upstreamOrigin}/echo`,
    method: "POST",
    headers: [["content-type", "text/plain"]],
  })
).toString("base64url")
const relayedResponse = await relay.handler(
  new Request("http://docs.local/docs/_relay", {
    method: "POST",
    headers: {
      "x-skaper-relay-request": relayMetadata,
      "x-skaper-relay-token": relay.token,
    },
    body: "relay body",
    duplex: "half",
  })
)
assert.equal(relayedResponse.status, 201)
assert.equal(relayedResponse.headers.get("x-upstream"), "yes")
assert.deepEqual(await relayedResponse.json(), {
  method: "POST",
  body: "relay body",
})

const deniedMetadata = Buffer.from(
  JSON.stringify({
    url: "https://not-allowed.example/path",
    method: "GET",
    headers: [],
  })
).toString("base64url")
const deniedResponse = await relay.handler(
  new Request("http://docs.local/docs/_relay", {
    method: "POST",
    headers: {
      "x-skaper-relay-request": deniedMetadata,
      "x-skaper-relay-token": relay.token,
    },
  })
)
assert.equal(deniedResponse.status, 403)
assert.equal(deniedResponse.headers.get("x-skaper-relay-error"), "1")

const relayServer = createServer((request, response) => {
  relay.handler(request, response)
})
relayServer.on("upgrade", (request, socket, head) => {
  if (!relay.handleUpgrade(request, socket, head)) socket.destroy()
})
await new Promise((resolve) => relayServer.listen(0, "127.0.0.1", resolve))
const relayAddress = relayServer.address()
assert.ok(relayAddress && typeof relayAddress === "object")

const webSocketEcho = await new Promise((resolve, reject) => {
  const socket = new WebSocket(
    `ws://127.0.0.1:${relayAddress.port}${relay.path}`
  )
  socket.on("open", () => {
    socket.send(
      JSON.stringify({
        type: "skaper.connect",
        token: relay.token,
        request: {
          url: `ws://127.0.0.1:${upstreamAddress.port}`,
          headers: [["authorization", "Bearer websocket-token"]],
        },
      })
    )
  })
  socket.on("message", (message) => {
    const value = message.toString()
    if (value === JSON.stringify({ type: "skaper.ready" })) {
      socket.send("websocket relay body")
      return
    }
    socket.close()
    resolve(value)
  })
  socket.on("error", reject)
})
assert.equal(webSocketEcho, "websocket relay body")
assert.equal(upstreamWebSocketAuthorization, "Bearer websocket-token")

await new Promise((resolve, reject) =>
  relayServer.close((error) => (error ? reject(error) : resolve()))
)

await new Promise((resolve, reject) =>
  upstreamServer.close((error) => (error ? reject(error) : resolve()))
)

console.log("package server and browser-safety smoke tests passed")
