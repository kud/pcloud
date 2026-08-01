import { describe, expect, it, vi, afterEach } from "vitest"
import { PCloudAPI } from "./api.js"

// The share endpoints take three different ids for three similar-sounding
// operations, and all three are numbers — so nothing in the type system can
// catch sending the wrong one. removeShare sent a sharerequestid for months;
// pCloud answered "Please provide 'shareid'." and nothing was ever removed.

const captureParams = () => {
  const seen: URLSearchParams[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      seen.push(new URL(url).searchParams)
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ result: 0 }),
      } as Response
    }),
  )
  return seen
}

const client = () => {
  const api = new PCloudAPI("https://eapi.pcloud.com")
  api.setAuth("test-token")
  return api
}

afterEach(() => vi.unstubAllGlobals())

describe("share endpoints send the id each one actually takes", () => {
  it("removeShare sends shareid — it ends an accepted share", async () => {
    const seen = captureParams()
    await client().removeShare(225308)
    expect(seen[0]?.get("shareid")).toBe("225308")
    expect(seen[0]?.get("sharerequestid")).toBeNull()
  })

  it("acceptShare sends sharerequestid — a pending request is a different thing", async () => {
    const seen = captureParams()
    await client().acceptShare(4242)
    expect(seen[0]?.get("sharerequestid")).toBe("4242")
    expect(seen[0]?.get("shareid")).toBeNull()
  })

  it("declineShare sends sharerequestid", async () => {
    const seen = captureParams()
    await client().declineShare(4242)
    expect(seen[0]?.get("sharerequestid")).toBe("4242")
  })
})

describe("uploadFile", () => {
  it("sets nopartial, so a failed transfer cannot leave a truncated file", async () => {
    const seen = captureParams()
    await client().uploadFile(10, "notes.md", new Uint8Array([1, 2, 3]))
    expect(seen[0]?.get("nopartial")).toBe("1")
    expect(seen[0]?.get("folderid")).toBe("10")
  })

  it("can be told to allow a partial upload explicitly", async () => {
    const seen = captureParams()
    await client().uploadFile(10, "n.md", new Uint8Array([1]), {
      noPartial: false,
    })
    expect(seen[0]?.get("nopartial")).toBe("0")
  })
})

describe("credentials", () => {
  it("sends the session token as auth", async () => {
    const seen = captureParams()
    await client().userInfo()
    expect(seen[0]?.get("auth")).toBe("test-token")
  })

  // An OAuth token and a session token are different parameters, and sending
  // the wrong name reads to pCloud as no credential at all.
  it("sends an OAuth token as access_token, not auth", async () => {
    const seen = captureParams()
    const api = new PCloudAPI("https://eapi.pcloud.com")
    api.setAccessToken("oauth-token")
    await api.userInfo()
    expect(seen[0]?.get("access_token")).toBe("oauth-token")
    expect(seen[0]?.get("auth")).toBeNull()
  })
})

describe("error handling", () => {
  it("does not echo the credential when a body cannot be parsed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        text: async () => "<html>404 Not Found</html>",
      })),
    )
    // A 404 page reaching an error message is how a token ends up in a log or
    // a bug report — the URL that produced it carries the auth parameter.
    await expect(client().userInfo()).rejects.toThrow()
    await expect(client().userInfo()).rejects.not.toThrow(/test-token/)
  })
})
