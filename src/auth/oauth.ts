import http from "http"
import { randomBytes, timingSafeEqual } from "crypto"
import { AddressInfo } from "net"
import { URL } from "url"

export interface OAuthTokens {
  access_token: string
  locationId?: number
  hostname?: string
  userId?: number
}

// The callback's `hostname` decides where the client secret is sent, and the
// callback is an unauthenticated request any page or local process can forge,
// so only pCloud's own API hosts are ever accepted (US and EU regions).
const PCLOUD_API_HOSTS = new Set(["api.pcloud.com", "eapi.pcloud.com"])

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const sameState = (received: string | null, expected: string): boolean => {
  if (!received) return false
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

const page = (title: string, message: string): string =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></body></html>`

export class OAuthFlow {
  private port: number
  private clientId: string
  private clientSecret: string
  private authBaseUrl: string

  constructor(
    clientId: string,
    clientSecret: string,
    authBaseUrl: string = "https://my.pcloud.com",
    port: number = 3000,
  ) {
    this.clientId = clientId
    this.clientSecret = clientSecret
    this.authBaseUrl = authBaseUrl
    this.port = port
  }

  async authenticate(): Promise<OAuthTokens> {
    // Ties the callback to the browser round trip this process started; a
    // callback without it was not sent by pCloud on our behalf.
    const state = randomBytes(32).toString("hex")

    return new Promise((resolve, reject) => {
      let settled = false
      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost")

        if (url.pathname !== "/oauth/callback") {
          res.writeHead(404, { "Content-Type": "text/plain" })
          res.end("Not found")
          return
        }

        // A forged or stale callback is answered and otherwise ignored, so a
        // third party can neither complete nor cancel the pending login.
        if (settled || !sameState(url.searchParams.get("state"), state)) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" })
          res.end(
            page(
              "Authentication Failed",
              "This callback does not belong to the pending login.",
            ),
          )
          return
        }

        const fail = (status: number, message: string, err: Error) => {
          settled = true
          res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" })
          res.end(page("Authentication Failed", message))
          server.close()
          reject(err)
        }

        const error = url.searchParams.get("error")
        if (error) {
          fail(400, error, new Error(error))
          return
        }

        const code = url.searchParams.get("code")
        if (!code) {
          fail(
            400,
            "No code received.",
            new Error("No authorization code received"),
          )
          return
        }

        const hostname = url.searchParams.get("hostname") ?? undefined
        if (hostname !== undefined && !PCLOUD_API_HOSTS.has(hostname)) {
          fail(
            400,
            "Unexpected API host in callback.",
            new Error(`Refusing unexpected pCloud API host: ${hostname}`),
          )
          return
        }

        settled = true
        try {
          const tokens = await this.exchangeCode(code, hostname)
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
          res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>pCloud Authentication Success</title>
  <style>body{font-family:system-ui;padding:40px;text-align:center}.success{color:#059669;font-size:48px}</style>
</head>
<body>
  <div class="success">✓</div>
  <h1>Authentication Successful!</h1>
  <p>You can close this window and return to the terminal.</p>
</body>
</html>`)
          setTimeout(() => {
            server.close()
            resolve(tokens)
          }, 1000)
        } catch (err) {
          res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" })
          res.end(
            page(
              "Token Exchange Failed",
              err instanceof Error ? err.message : "Unknown error",
            ),
          )
          server.close()
          reject(err)
        }
      })

      // Loopback only: the callback carries an authorisation code and must not
      // be reachable from the LAN.
      server.listen(this.port, "127.0.0.1", async () => {
        const { port } = server.address() as AddressInfo
        const authUrl = this.getAuthorizationUrl(port, state)
        console.log("\n🔐 Opening browser for authentication...")
        console.log(`If browser doesn't open, visit: ${authUrl}\n`)
        // Imported here rather than at module scope so that consumers holding a
        // token — the MCP server, anything non-interactive — never load it.
        const { default: open } = await import("open")
        await open(authUrl)
      })

      server.on("error", reject)
    })
  }

  private async exchangeCode(
    code: string,
    hostname?: string,
  ): Promise<OAuthTokens> {
    // In the body, not the URL: a query string carrying client_secret ends up
    // in access logs, proxies and pCloud's own echoed error pages.
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
    })
    const apiHost = hostname ?? "api.pcloud.com"
    const response = await fetch(`https://${apiHost}/oauth2_token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    })
    const data = (await response.json()) as Record<string, unknown>

    if (data.error || (typeof data.result === "number" && data.result !== 0)) {
      throw new Error(String(data.error || data.result))
    }

    return {
      access_token: String(data.access_token),
      userId: typeof data.uid === "number" ? data.uid : undefined,
      locationId:
        typeof data.locationid === "number" ? data.locationid : undefined,
      hostname: data.hostname ? String(data.hostname) : hostname,
    }
  }

  private getAuthorizationUrl(port: number, state: string): string {
    // `localhost` rather than 127.0.0.1: it is what registered pCloud apps
    // already list as their redirect URI.
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: "code",
      redirect_uri: `http://localhost:${port}/oauth/callback`,
      state,
    })
    return `${this.authBaseUrl}/oauth2/authorize?${params.toString()}`
  }
}
