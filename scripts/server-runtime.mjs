const UI_SCRIPT = null
const UI_STYLES = null

export function skaperUI(options) {
  if (!options || typeof options.url !== "string" || !options.url.trim()) {
    throw new TypeError("skaperUI requires a non-empty OpenAPI url.")
  }

  const html = renderSkaperHtml(options)

  return function skaperHandler(context, response) {
    if (context && typeof context.html === "function") {
      return context.html(html)
    }

    if (response && typeof response.send === "function") {
      if (typeof response.type === "function") response.type("html")
      return response.send(html)
    }

    return new Response(html, {
      headers: { "content-type": "text/html; charset=UTF-8" },
    })
  }
}

export default skaperUI

function renderSkaperHtml(options) {
  const title = escapeHtml(options.title || "Skaper · API Workspace")
  const url = JSON.stringify(options.url).replaceAll("<", "\\u003c")
  const nonceAttribute = options.nonce
    ? ` nonce="${escapeHtml(options.nonce)}"`
    : ""

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style${nonceAttribute}>${UI_STYLES}</style>
  </head>
  <body>
    <div id="skaper-root"></div>
    <script type="module"${nonceAttribute}>
      try {
        const openApiUrl = ${url};
        const response = await fetch(openApiUrl, { credentials: "same-origin" });
        if (!response.ok) {
          throw new Error("Unable to load OpenAPI document (" + response.status + ")");
        }
        globalThis.__SKAPER_OPENAPI_SPEC__ = await response.json();
        ${UI_SCRIPT}
      } catch (error) {
        const root = document.getElementById("skaper-root");
        if (root) {
          root.innerHTML =
            '<main style="font-family:system-ui;padding:32px"><h1>Unable to load Skaper</h1><p></p></main>';
          root.querySelector("p").textContent = error instanceof Error
            ? error.message
            : String(error);
        }
      }
    </script>
  </body>
</html>`
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}
