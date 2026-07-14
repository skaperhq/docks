const UI_SCRIPT = null
const UI_STYLES = null

export function skaperUI(options) {
  if (!options || typeof options.url !== "string" || !options.url.trim()) {
    throw new TypeError("skaperUI requires a non-empty OpenAPI url.")
  }

  if (options.password !== undefined && typeof options.password !== "string") {
    throw new TypeError("skaperUI password option must be a string.")
  }

  const hashedPassword = options.password ? sha256(options.password) : null
  const html = renderSkaperHtml(options, hashedPassword)

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

function renderSkaperHtml(options, hashedPassword) {
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
      // Apply theme immediately
      const savedTheme = localStorage.getItem("docks-ui-theme") || "system";
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
        const isAuthenticated = sessionStorage.getItem("__skaper_auth") === passwordHash;
        if (isAuthenticated) {
          loadSkaper();
        } else {
          const root = document.getElementById("skaper-root");
          root.innerHTML = \`
            <style>
              .skaper-login-container {
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                background: radial-gradient(circle at top right, rgba(124, 58, 237, 0.04), transparent 40%),
                            radial-gradient(circle at bottom left, rgba(59, 130, 246, 0.04), transparent 40%),
                            var(--background);
                color: var(--foreground);
                font-family: "Inter Variable", system-ui, -apple-system, sans-serif;
              }
              .skaper-login-card {
                background-color: var(--card);
                border: 1px solid var(--border);
                border-radius: 1rem;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                padding: 2.5rem 2rem;
                width: 100%;
                max-width: 400px;
                box-sizing: border-box;
                animation: skaperLoginFadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
              }
              @keyframes skaperLoginFadeIn {
                from { opacity: 0; transform: translateY(16px); }
                to { opacity: 1; transform: translateY(0); }
              }
              .skaper-login-header {
                display: flex;
                flex-direction: column;
                align-items: center;
                text-align: center;
                margin-bottom: 2rem;
              }
              .skaper-login-icon {
                width: 3rem;
                height: 3rem;
                border-radius: 50%;
                background: linear-gradient(135deg, rgba(124, 58, 237, 0.1) 0%, rgba(59, 130, 246, 0.05) 100%);
                color: var(--primary);
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 1rem;
                border: 1px solid rgba(124, 58, 237, 0.15);
              }
              .skaper-login-title {
                font-size: 1.25rem;
                font-weight: 600;
                margin: 0 0 0.5rem 0;
                letter-spacing: -0.025em;
              }
              .skaper-login-subtitle {
                font-size: 0.875rem;
                color: var(--muted-foreground);
                line-height: 1.25rem;
                margin: 0;
              }
              .skaper-form-group {
                margin-bottom: 1.25rem;
              }
              .skaper-form-input {
                width: 100%;
                padding: 0.75rem 1rem;
                background-color: var(--background);
                border: 1px solid var(--border);
                border-radius: 0.5rem;
                color: var(--foreground);
                font-size: 0.875rem;
                outline: none;
                transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                box-sizing: border-box;
              }
              .skaper-form-input:focus {
                border-color: var(--primary);
                box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.15);
              }
              .skaper-submit-btn {
                width: 100%;
                padding: 0.75rem;
                background: linear-gradient(135deg, var(--primary) 0%, #7c3aed 100%);
                color: #ffffff;
                border: none;
                border-radius: 0.5rem;
                font-size: 0.875rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                box-shadow: 0 4px 6px -1px rgba(124, 58, 237, 0.1), 0 2px 4px -1px rgba(124, 58, 237, 0.06);
                box-sizing: border-box;
              }
              .skaper-submit-btn:hover {
                opacity: 0.95;
                box-shadow: 0 10px 15px -3px rgba(124, 58, 237, 0.15), 0 4px 6px -2px rgba(124, 58, 237, 0.05);
              }
              .skaper-submit-btn:active {
                transform: scale(0.98);
              }
              .skaper-error-message {
                color: var(--destructive);
                font-size: 0.75rem;
                margin-top: 0.75rem;
                text-align: center;
                display: none;
              }
              .skaper-shake {
                animation: skaperLoginShake 0.4s cubic-bezier(.36,.07,.19,.97) both;
              }
              @keyframes skaperLoginShake {
                10%, 90% { transform: translate3d(-1px, 0, 0); }
                20%, 80% { transform: translate3d(2px, 0, 0); }
                30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
                40%, 60% { transform: translate3d(4px, 0, 0); }
              }
            </style>
            <div class="skaper-login-container">
              <div class="skaper-login-card">
                <div class="skaper-login-header">
                  <div class="skaper-login-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 20px; height: 20px;">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 00-2.25 2.25z" />
                    </svg>
                  </div>
                  <h1 class="skaper-login-title">Protected Workspace</h1>
                  <p class="skaper-login-subtitle">Please enter the password to access the API documentation.</p>
                </div>
                <form id="skaper-login-form" onsubmit="return false;">
                  <div class="skaper-form-group">
                    <input type="password" id="skaper-password-input" class="skaper-form-input" placeholder="Enter password" autofocus required />
                  </div>
                  <button type="submit" class="skaper-submit-btn">Unlock Workspace</button>
                  <div id="skaper-error-message" class="skaper-error-message">Incorrect password. Please try again.</div>
                </form>
              </div>
            </div>
          \`;

          const form = document.getElementById("skaper-login-form");
          const input = document.getElementById("skaper-password-input");
          const errorMsg = document.getElementById("skaper-error-message");

          form.addEventListener("submit", (e) => {
            e.preventDefault();
            const inputHash = sha256(input.value);
            if (inputHash === passwordHash) {
              sessionStorage.setItem("__skaper_auth", passwordHash);
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
    return (value >>> amount) | (value << (32 - amount));
  }
  
  var mathPow = Math.pow;
  var maxWord = mathPow(2, 32);
  var lengthProperty = 'length'
  var i, j;

  var result = ''

  var words = [];
  var asciiLength = ascii[lengthProperty] * 8;
  
  var hash = sha256.h = sha256.h || [];
  var k = sha256.k = sha256.k || [];
  var primeCounter = k[lengthProperty];

  var isComposite = {};
  for (var candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = 1;
      }
      hash[primeCounter] = (mathPow(candidate, .5)*maxWord)|0;
      k[primeCounter++] = (mathPow(candidate, 1/3)*maxWord)|0;
    }
  }
  
  ascii += '\x80'
  while (ascii[lengthProperty] % 64 - 56) ascii += '\x00'
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return; // ASCII only: reject high-order chars
    words[i >> 2] |= j << ((3 - i % 4) * 8);
  }
  words[words[lengthProperty]] = ((asciiLength / maxWord) | 0);
  words[words[lengthProperty]] = (asciiLength | 0);
  
  for (j = 0; j < words[lengthProperty];) {
    var w = words.slice(j, j += 16);
    var oldHash = hash;
    hash = hash.slice(0);
    
    for (i = 0; i < 64; i++) {
      var wItem = w[i];
      if (i >= 16) {
        var a1 = w[i - 15];
        var s0 = rightRotate(a1, 7) ^ rightRotate(a1, 18) ^ (a1 >>> 3);
        var a2 = w[i - 2];
        var s1 = rightRotate(a2, 17) ^ rightRotate(a2, 19) ^ (a2 >>> 10);
        wItem = w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      
      var ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      var maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      var sigma0 = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
      var sigma1 = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
      
      var temp1 = hash[7] + sigma1 + ch + k[i] + (wItem || 0);
      var temp2 = sigma0 + maj;
      
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
      hash.length = 8;
    }
    
    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }
  
  for (i = 0; i < 8; i++) {
    var val = hash[i];
    if (val < 0) val += maxWord;
    var str = val.toString(16);
    while (str[lengthProperty] < 8) str = '0' + str;
    result += str;
  }
  return result;
}

