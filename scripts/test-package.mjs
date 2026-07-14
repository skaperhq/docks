import assert from "node:assert/strict"
import crypto from "node:crypto"
import { createRequire } from "node:module"
import skaperUI, { skaperUI as namedSkaperUI } from "../dist/package/index.js"

const require = createRequire(import.meta.url)
const commonJsSkaperUI = require("../dist/package/index.cjs")

assert.equal(skaperUI, namedSkaperUI)
assert.equal(commonJsSkaperUI, commonJsSkaperUI.skaperUI)

const handler = skaperUI({
  url: "/docs/openapi.json",
  title: "Example API",
  nonce: "test-nonce",
})
const html = handler({ html: (content) => content })

assert.match(html, /^<!doctype html>/)
assert.match(html, /<title>Example API<\/title>/)
assert.match(html, /const openApiUrl = "\/docs\/openapi.json"/)
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

// Test password hashing and HTML injection
const expectedHash = crypto.createHash("sha256").update("supersecretpassword").digest("hex")
const passwordHandler = skaperUI({
  url: "/docs/openapi.json",
  password: "supersecretpassword",
})
const passwordHtml = passwordHandler({ html: (content) => content })
assert.match(passwordHtml, new RegExp(`const passwordHash = "${expectedHash}"`))
assert.match(passwordHtml, /class="skaper-login-container"/)
assert.match(passwordHtml, /id="skaper-password-input"/)


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

console.log("package server and browser-safety smoke tests passed")
