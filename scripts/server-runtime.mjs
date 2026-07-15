const UI_SCRIPT = null
const UI_STYLES = null

const SKAPER_LOGIN_TEMPLATE = /* HTML */ `
  <style>
    .skaper-login-container {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background:
        radial-gradient(
          circle at top right,
          rgba(124, 58, 237, 0.04),
          transparent 40%
        ),
        radial-gradient(
          circle at bottom left,
          rgba(59, 130, 246, 0.04),
          transparent 40%
        ),
        var(--background);
      color: var(--foreground);
      font-family:
        "Inter Variable",
        system-ui,
        -apple-system,
        sans-serif;
    }

    .skaper-login-card {
      box-sizing: border-box;
      width: 100%;
      max-width: 400px;
      padding: 2.5rem 2rem;
      border: 1px solid var(--border);
      border-radius: 1rem;
      animation: skaperLoginFadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
      background-color: var(--card);
    }

    @keyframes skaperLoginFadeIn {
      from {
        opacity: 0;
        transform: translateY(16px);
      }

      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .skaper-login-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 2rem;
      text-align: center;
    }

    .skaper-login-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 3rem;
      height: 3rem;
      margin-bottom: 1rem;
      border: 1px solid rgba(124, 58, 237, 0.15);
      border-radius: 50%;
      background: linear-gradient(
        135deg,
        rgba(124, 58, 237, 0.1) 0%,
        rgba(59, 130, 246, 0.05) 100%
      );
      color: var(--primary);
    }

    .skaper-login-title {
      margin: 0 0 0.5rem;
      font-size: 1.25rem;
      font-weight: 500;
      letter-spacing: -0.025em;
    }

    .skaper-login-subtitle {
      margin: 0;
      color: var(--muted-foreground);
      font-size: 0.875rem;
      line-height: 1.25rem;
    }

    .skaper-form-group {
      margin-bottom: 1.25rem;
    }

    .skaper-form-input {
      box-sizing: border-box;
      width: 100%;
      padding: 0.75rem 1rem;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      outline: none;
      background-color: var(--background);
      color: var(--foreground);
      font-size: 0.875rem;
    }

    .skaper-form-input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.15);
    }

    .skaper-submit-btn {
      box-sizing: border-box;
      width: 100%;
      padding: 0.75rem;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      cursor: pointer;
      border: none;
      border-radius: 0.5rem;
      background: var(--primary);
      color: #ffffff;
      font-size: 0.875rem;
      font-weight: 500;
      box-shadow:
        0 4px 6px -1px rgba(124, 58, 237, 0.1),
        0 2px 4px -1px rgba(124, 58, 237, 0.06);
    }

    .skaper-submit-btn:hover {
      opacity: 0.95;
      box-shadow:
        0 10px 15px -3px rgba(124, 58, 237, 0.15),
        0 4px 6px -2px rgba(124, 58, 237, 0.05);
    }

    .skaper-submit-btn:active {
      transform: scale(0.98);
    }

    .skaper-error-message {
      display: none;
      margin-top: 0.75rem;
      color: var(--destructive);
      font-size: 0.75rem;
      text-align: center;
    }

    .skaper-shake {
      animation: skaperLoginShake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
    }

    @keyframes skaperLoginShake {
      10%,
      90% {
        transform: translate3d(-1px, 0, 0);
      }

      20%,
      80% {
        transform: translate3d(2px, 0, 0);
      }

      30%,
      50%,
      70% {
        transform: translate3d(-4px, 0, 0);
      }

      40%,
      60% {
        transform: translate3d(4px, 0, 0);
      }
    }
  </style>

  <div class="skaper-login-container">
    <div class="skaper-login-card">
      <div class="skaper-login-header">
        <div class="skaper-login-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 810 810">
            <rect width="810" height="810" rx="180" fill="#2447d8" />
            <g transform="translate(90 90) scale(.7777778)">
              <path
                fill-rule="evenodd"
                clip-rule="evenodd"
                d="M405 0C629 0 810 182 810 405C810 628 629 810 405 810C181 810 0 629 0 405C0 181 182 0 405 0ZM580 68C527 93 468 107 405 107C342 107 284 93 231 68C210 78 191 91 174 104C238 154 318 183 405 183C492 183 573 154 637 104C619 91 600 78 580 68ZM261 54C305 72 354 82 405 82C456 82 505 72 550 54C505 36 457 25 405 25C353 25 305 36 261 54ZM657 121C669 131 680 143 691 155C621 234 519 283 405 283C291 283 190 234 120 155C131 143 142 131 154 121C223 175 310 208 405 208C500 208 588 175 657 121ZM707 174C714 184 722 194 728 205C661 312 541 384 405 384C269 384 150 312 83 205C89 194 96 184 104 174C178 257 286 308 405 308C524 308 633 257 707 174ZM742 229C747 238 751 247 755 256C696 390 562 484 405 484C248 484 115 390 56 256C60 247 64 238 69 229C141 338 265 409 405 409C545 409 669 338 742 229ZM767 288C769 294 770 300 772 306C728 467 580 585 405 585C230 585 83 467 39 306C40 300 42 294 44 288C111 420 248 509 405 509C562 509 700 420 767 288ZM782 355V358C756 543 598 685 405 685C212 685 54 543 28 358L29 355C89 505 235 610 405 610C575 610 722 505 782 355ZM782 456C757 642 598 785 405 785C212 785 54 642 29 456C89 605 235 710 405 710C575 710 722 605 782 456Z"
                fill="white"
              />
            </g>
          </svg>
        </div>
        <h1 class="skaper-login-title">Skaper</h1>
        <p class="skaper-login-subtitle">
          Please enter the password to access the API Workspace.
        </p>
      </div>

      <form id="skaper-login-form" onsubmit="return false;">
        <div class="skaper-form-group">
          <input
            type="password"
            id="skaper-password-input"
            class="skaper-form-input"
            placeholder="Enter password"
            autofocus
            required
          />
        </div>
        <button type="submit" class="skaper-submit-btn">
          Unlock Workspace
        </button>
        <div id="skaper-error-message" class="skaper-error-message">
          Incorrect password. Please try again.
        </div>
      </form>
    </div>
  </div>
`

export function skaperUI(options) {
  if (!options || typeof options.url !== "string" || !options.url.trim()) {
    throw new TypeError("skaperUI requires a non-empty OpenAPI url.")
  }

  if (options.password !== undefined && typeof options.password !== "string") {
    throw new TypeError("skaperUI password option must be a string.")
  }

  if (
    options.workspaceId !== undefined &&
    (typeof options.workspaceId !== "string" || !options.workspaceId.trim())
  ) {
    throw new TypeError(
      "skaperUI workspaceId option must be a non-empty string."
    )
  }

  const workspaceId =
    options.workspaceId?.trim() || createDefaultWorkspaceId(options.url)
  const hashedPassword = options.password ? sha256(options.password) : null
  const html = renderSkaperHtml(options, hashedPassword, workspaceId)

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

function renderSkaperHtml(options, hashedPassword, workspaceId) {
  const title = escapeHtml(options.title || "Skaper · API Workspace")
  const url = JSON.stringify(options.url).replaceAll("<", "\\u003c")
  const loginTemplate = JSON.stringify(SKAPER_LOGIN_TEMPLATE).replaceAll(
    "<",
    "\\u003c"
  )
  const serializedWorkspaceId = JSON.stringify(workspaceId).replaceAll(
    "<",
    "\\u003c"
  )
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
      // Apply theme immediately
      const workspaceId = ${serializedWorkspaceId};
      const themeStorageKey = "skaper:" + encodeURIComponent(workspaceId) + ":ui-theme";
      const authStorageKey = "__skaper_auth:" + encodeURIComponent(workspaceId);
      const savedTheme = localStorage.getItem(themeStorageKey) || "system";
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      const activeTheme = savedTheme === "system" ? systemTheme : savedTheme;
      document.documentElement.classList.add(activeTheme);

      ${sha256.toString()}

      async function loadSkaper() {
        try {
          const openApiUrl = ${url};
          const response = await fetch(openApiUrl, { credentials: "same-origin" });
          if (!response.ok) {
            throw new Error("Unable to load OpenAPI document (" + response.status + ")");
          }
          globalThis.__SKAPER_OPENAPI_SPEC__ = await response.json();
          globalThis.__SKAPER_WORKSPACE_ID__ = workspaceId;
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
      }

      const passwordHash = ${hashedPassword ? JSON.stringify(hashedPassword) : "null"};

      if (passwordHash) {
        const isAuthenticated = sessionStorage.getItem(authStorageKey) === passwordHash;
        if (isAuthenticated) {
          loadSkaper();
        } else {
          const root = document.getElementById("skaper-root");
          root.innerHTML = ${loginTemplate};

          const form = document.getElementById("skaper-login-form");
          const input = document.getElementById("skaper-password-input");
          const errorMsg = document.getElementById("skaper-error-message");

          form.addEventListener("submit", (e) => {
            e.preventDefault();
            const inputHash = sha256(input.value);
            if (inputHash === passwordHash) {
              sessionStorage.setItem(authStorageKey, passwordHash);
              root.innerHTML = "";
              loadSkaper();
            } else {
              errorMsg.style.display = "block";
              errorMsg.classList.remove("skaper-shake");
              void errorMsg.offsetWidth; // trigger reflow
              errorMsg.classList.add("skaper-shake");
              input.value = "";
              input.focus();
            }
          });
        }
      } else {
        loadSkaper();
      }
    </script>
  </body>
</html>`
}

function createDefaultWorkspaceId(openApiUrl) {
  const workingDirectory =
    typeof process !== "undefined" && typeof process.cwd === "function"
      ? process.cwd()
      : "browser"
  const identity = encodeURIComponent(`${workingDirectory}\u0000${openApiUrl}`)

  return `auto-${sha256(identity).slice(0, 24)}`
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function sha256(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount))
  }

  var mathPow = Math.pow
  var maxWord = mathPow(2, 32)
  var lengthProperty = "length"
  var i, j

  var result = ""

  var words = []
  var asciiLength = ascii[lengthProperty] * 8

  var hash = (sha256.h = sha256.h || [])
  var k = (sha256.k = sha256.k || [])
  var primeCounter = k[lengthProperty]

  var isComposite = {}
  for (var candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = 1
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0
    }
  }

  ascii += "\x80"
  while ((ascii[lengthProperty] % 64) - 56) ascii += "\x00"
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i)
    if (j >> 8) return // ASCII only: reject high-order chars
    words[i >> 2] |= j << ((3 - (i % 4)) * 8)
  }
  words[words[lengthProperty]] = (asciiLength / maxWord) | 0
  words[words[lengthProperty]] = asciiLength | 0

  for (j = 0; j < words[lengthProperty];) {
    var w = words.slice(j, (j += 16))
    var oldHash = hash
    hash = hash.slice(0)

    for (i = 0; i < 64; i++) {
      var wItem = w[i]
      if (i >= 16) {
        var a1 = w[i - 15]
        var s0 = rightRotate(a1, 7) ^ rightRotate(a1, 18) ^ (a1 >>> 3)
        var a2 = w[i - 2]
        var s1 = rightRotate(a2, 17) ^ rightRotate(a2, 19) ^ (a2 >>> 10)
        wItem = w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
      }

      var ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6])
      var maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2])
      var sigma0 =
        rightRotate(hash[0], 2) ^
        rightRotate(hash[0], 13) ^
        rightRotate(hash[0], 22)
      var sigma1 =
        rightRotate(hash[4], 6) ^
        rightRotate(hash[4], 11) ^
        rightRotate(hash[4], 25)

      var temp1 = hash[7] + sigma1 + ch + k[i] + (wItem || 0)
      var temp2 = sigma0 + maj

      hash = [(temp1 + temp2) | 0].concat(hash)
      hash[4] = (hash[4] + temp1) | 0
      hash.length = 8
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0
    }
  }

  for (i = 0; i < 8; i++) {
    var val = hash[i]
    if (val < 0) val += maxWord
    var str = val.toString(16)
    while (str[lengthProperty] < 8) str = "0" + str
    result += str
  }
  return result
}
