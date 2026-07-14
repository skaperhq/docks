import * as React from "react"
import { createRoot } from "react-dom/client"
import { SkaperApp } from "./package"

const rootElement = document.getElementById("skaper-root")

if (!rootElement) {
  throw new Error("Skaper could not find its root element.")
}

createRoot(rootElement).render(
  <React.StrictMode>
    <SkaperApp />
  </React.StrictMode>
)
