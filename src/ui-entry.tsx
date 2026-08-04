import * as React from "react"
import { createRoot } from "react-dom/client"
import { DocksApp } from "./package"

const rootElement = document.getElementById("docks-root")

if (!rootElement) {
  throw new Error("Docks could not find its root element.")
}

createRoot(rootElement).render(
  <React.StrictMode>
    <DocksApp />
  </React.StrictMode>
)
