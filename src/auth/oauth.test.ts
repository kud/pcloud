import http from "http"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The browser is replaced by the test: `open` hands over the authorize URL, and
// the callback is then driven by hand against the real loopback server.
const opened = vi.hoisted(() => ({ url: undefined as string | undefined }))
vi.mock("open", () => ({
  default: vi.fn(async (url: string) => {
    opened.url = url
  }),
}))

import { OAuthFlow } from "./oauth.js"

interface TokenCall {
  url: string
  method?: string
  body?: string
}

const get = (
  port: number,
  pathAndQuery: string,
  host = "127.0.0.1",
): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    http
      .get({ host, port, path: pathAndQuery }, (res) => {
        let body = ""
        res.on("data", (chunk) => (body += chunk))
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }))
      })
      .on("error", reject)
  })

const waitForAuthorizeUrl = async (): Promise<URL> => {
  for (let i = 0; i < 200 && !opened.url; i++) {
    await new Promise((r) => setTimeout(r, 5))
  }
  if (!opened.url) throw new Error("authorize URL was never opened")
  return new URL(opened.url)
}

const start = async () => {
  const flow = new OAuthFlow("client-id", "client-secret", "https://my.pcloud.com", 0)
  const result = flow.authenticate()
  result.catch(() => {})
  const authorize = await waitForAuthorizeUrl()
  const redirect = new URL(authorize.searchParams.get("redirect_uri")!)
  return {
    result,
    port: Number(redirect.port),
    state: authorize.searchParams.get("state")!,
  }
}

describe("OAuthFlow callback", () => {
  let calls: TokenCall[]

  beforeEach(() => {
    opened.url = undefined
    calls = []
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, method: init?.method, body: init?.body?.toString() })
        return {
          ok: true,
          status: 200,
          json: async () => ({ result: 0, access_token: "tok", uid: 1 }),
        } as Response
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("puts a random state in the authorize URL", async () => {
    const { state, port, result } = await start()
    expect(state).toMatch(/^[0-9a-f]{64}$/)
    await get(port, `/oauth/callback?code=c&state=${state}`)
    await result
  })

  it("rejects a callback without the matching state and keeps waiting", async () => {
    const { port, state, result } = await start()

    const missing = await get(port, "/oauth/callback?code=c&hostname=evil.example")
    expect(missing.status).toBe(400)
    const wrong = await get(port, `/oauth/callback?code=c&state=${"0".repeat(64)}`)
    expect(wrong.status).toBe(400)
    const cancel = await get(port, "/oauth/callback?error=access_denied")
    expect(cancel.status).toBe(400)
    expect(calls).toHaveLength(0)

    const ok = await get(port, `/oauth/callback?code=c&state=${state}`)
    expect(ok.status).toBe(200)
    await expect(result).resolves.toMatchObject({ access_token: "tok" })
  })

  it("never sends the client secret to a host outside pCloud's API hosts", async () => {
    const { port, state, result } = await start()
    const res = await get(
      port,
      `/oauth/callback?code=c&state=${state}&hostname=attacker.example`,
    )
    expect(res.status).toBe(400)
    await expect(result).rejects.toThrow(/unexpected pCloud API host/)
    expect(calls).toHaveLength(0)
  })

  it("accepts the EU API host from the callback", async () => {
    const { port, state, result } = await start()
    await get(port, `/oauth/callback?code=c&state=${state}&hostname=eapi.pcloud.com`)
    await expect(result).resolves.toMatchObject({ hostname: "eapi.pcloud.com" })
    expect(new URL(calls[0]!.url).host).toBe("eapi.pcloud.com")
  })

  it("sends the token exchange as a POST body, not a query string", async () => {
    const { port, state, result } = await start()
    await get(port, `/oauth/callback?code=the-code&state=${state}`)
    await result
    const call = calls[0]!
    const url = new URL(call.url)
    expect(url.host).toBe("api.pcloud.com")
    expect(url.pathname).toBe("/oauth2_token")
    expect(url.search).toBe("")
    expect(call.method).toBe("POST")
    const body = new URLSearchParams(call.body)
    expect(body.get("client_secret")).toBe("client-secret")
    expect(body.get("client_id")).toBe("client-id")
    expect(body.get("code")).toBe("the-code")
  })

  it("escapes reflected error text", async () => {
    const { port, state, result } = await start()
    const res = await get(
      port,
      `/oauth/callback?state=${state}&error=${encodeURIComponent("<script>x</script>")}`,
    )
    expect(res.status).toBe(400)
    expect(res.body).not.toContain("<script>")
    expect(res.body).toContain("&lt;script&gt;")
    await expect(result).rejects.toThrow()
  })

  it("escapes a reflected token-exchange error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ error: "<img src=x onerror=y>" }),
      })),
    )
    const { port, state, result } = await start()
    const res = await get(port, `/oauth/callback?code=c&state=${state}`)
    expect(res.status).toBe(500)
    expect(res.body).not.toContain("<img")
    await expect(result).rejects.toThrow()
  })

  it("listens on loopback only", async () => {
    const os = await import("os")
    const external = Object.values(os.networkInterfaces())
      .flat()
      .find((i) => i && i.family === "IPv4" && !i.internal)
    const { port, state, result } = await start()
    if (external) {
      await expect(get(port, "/oauth/callback", external.address)).rejects.toThrow()
    }
    await get(port, `/oauth/callback?code=c&state=${state}`)
    await result
  })
})
