import { describe, expect, it } from "vitest"
import { createMockAPI, mockSyncPairs, mockSettings } from "./mock.js"
import { planRewind } from "./rewind.js"

// The mock exists so screenshots and demos never show a real drive. It is only
// worth having if it answers the same shapes the real client does — a fixture
// that drifts from the API it stands in for is worse than no fixture, because
// it makes a broken screenshot look like a working one.

describe("createMockAPI", () => {
  it("lists a root with folders sorted before files", async () => {
    const contents = (await createMockAPI().listFolder("/")).metadata
      ?.contents as { name: string; isfolder: boolean }[]
    expect(contents.length).toBeGreaterThan(4)
    const lastFolder = contents.findLastIndex((i) => i.isfolder)
    const firstFile = contents.findIndex((i) => !i.isfolder)
    expect(lastFolder).toBeLessThan(firstFile)
  })

  it("walks into a folder rather than returning the same listing", async () => {
    const api = createMockAPI()
    const root = (await api.listFolder("/")).metadata?.contents as unknown[]
    const docs = (await api.listFolder("/Documents")).metadata
      ?.contents as unknown[]
    expect(docs).not.toEqual(root)
    expect(docs.length).toBeGreaterThan(0)
  })

  it("returns an empty listing for a path it has no fixture for", async () => {
    const contents = (await createMockAPI().listFolder("/nowhere")).metadata
      ?.contents as unknown[]
    expect(contents).toEqual([])
  })

  // The shape that broke in the real client: two objects split by direction,
  // never a flat array.
  it("answers listShares with both directions", async () => {
    const res = await createMockAPI().listShares()
    expect(res.shares?.outgoing?.length).toBeGreaterThan(0)
    expect(res.shares?.incoming?.length).toBeGreaterThan(0)
    expect(res.shares?.outgoing?.[0].shareid).toBeTypeOf("number")
    expect(res.shares?.outgoing?.[0].tomail).toContain("@example.com")
  })

  it("carries a folder in the trash, which is the case that used to crash", async () => {
    const contents = (await createMockAPI().listTrash()).contents as {
      folderid?: number
      deletetime?: number
    }[]
    const folder = contents.find((i) => i.folderid !== undefined)
    expect(folder).toBeDefined()
    // A trashed folder has no deletetime, and new Date(NaN) throws.
    expect(folder?.deletetime).toBeUndefined()
  })

  it("is real enough to plan a rewind against", async () => {
    const plan = await planRewind(
      createMockAPI(),
      new Date("2026-07-30T00:00:00Z"),
    )
    expect(plan.actions.map((a) => a.kind)).toContain("restore")
    expect(plan.actions.map((a) => a.kind)).toContain("revert")
    expect(plan.actions.map((a) => a.kind)).toContain("created")
  })

  it("reports success on writes without doing anything", async () => {
    expect((await createMockAPI().deleteFile(1)).result).toBe(0)
  })
})

describe("the fixtures leak nothing real", () => {
  it("uses example.com addresses only", async () => {
    const json = JSON.stringify(await createMockAPI().listShares())
    const addresses = json.match(/[\w.+-]+@[\w.-]+/g) ?? []
    expect(addresses.length).toBeGreaterThan(0)
    for (const address of addresses) expect(address).toMatch(/@example\.com$/)
  })

  it("names no real host", async () => {
    const link = await createMockAPI().getFileLink(1)
    expect(link.hosts?.[0]).toMatch(/\.test$/)
  })
})

describe("providers for the browser's local tabs", () => {
  // One unhealthy pair, so a screenshot shows what a problem looks like rather
  // than only the happy path.
  it("includes a pair with a stuck queue", () => {
    const unhealthy = mockSyncPairs().filter((p) => p.issues.length > 0)
    expect(unhealthy).toHaveLength(1)
    expect(unhealthy[0].queued).toBeGreaterThan(0)
  })

  it("offers ignore rules in both lists", () => {
    const settings = mockSettings()
    expect(settings.ignorePatterns).toContain("node_modules")
    expect(settings.ignorePaths.length).toBeGreaterThan(0)
  })
})
