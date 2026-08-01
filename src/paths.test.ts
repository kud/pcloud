import { describe, expect, it, vi } from "vitest"
import { pathResolver } from "./paths.js"
import type { PCloudAPI } from "./api.js"

// diff metadata carries parentfolderid but never a path, so a folder's name is
// all an event gives you. The case that matters most is also the hardest: once
// a folder is deleted, listfolder can no longer resolve it — and its children
// are exactly the files someone is trying to recover.

const entry = (metadata: object) => ({
  diffid: 1,
  event: "deletefile",
  time: new Date().toUTCString(),
  metadata,
})

const api = (
  folders: Record<number, { name: string; parentfolderid?: number }>,
) => {
  const listFolderById = vi.fn(async (id: number) => {
    const folder = folders[id]
    return folder
      ? { result: 0, metadata: folder }
      : { result: 2005, error: "Directory does not exist." }
  })
  return { api: { listFolderById } as unknown as PCloudAPI, listFolderById }
}

describe("pathResolver", () => {
  it("prefers a path the event already carries", async () => {
    const { api: client, listFolderById } = api({})
    const toPath = pathResolver(client)
    expect(await toPath(entry({ name: "a", path: "/Given/a" }))).toBe(
      "/Given/a",
    )
    expect(listFolderById).not.toHaveBeenCalled()
  })

  it("walks parents up to the root", async () => {
    const { api: client } = api({
      10: { name: "Invoices", parentfolderid: 20 },
      20: { name: "Docs", parentfolderid: 0 },
    })
    const toPath = pathResolver(client)
    expect(await toPath(entry({ name: "march.pdf", parentfolderid: 10 }))).toBe(
      "/Docs/Invoices/march.pdf",
    )
  })

  // The case this exists for: the folder is gone, so listfolder cannot resolve
  // it — but its ancestry survives in the diff stream, where every folder event
  // still carries its own folderid, name and parent.
  it("resolves a deleted folder from the diff stream itself", async () => {
    const { api: client, listFolderById } = api({})
    const toPath = pathResolver(client, [
      entry({ folderid: 10, name: "Invoices", parentfolderid: 20 }),
      entry({ folderid: 20, name: "Docs", parentfolderid: 0 }),
    ])
    expect(await toPath(entry({ name: "march.pdf", parentfolderid: 10 }))).toBe(
      "/Docs/Invoices/march.pdf",
    )
    expect(listFolderById).not.toHaveBeenCalled()
  })

  // A bulk deletion produces hundreds of events sharing a handful of parents.
  it("asks about each folder once, however many events share it", async () => {
    const { api: client, listFolderById } = api({
      10: { name: "Docs", parentfolderid: 0 },
    })
    const toPath = pathResolver(client)
    for (const name of ["a", "b", "c", "d"])
      await toPath(entry({ name, parentfolderid: 10 }))
    expect(listFolderById).toHaveBeenCalledTimes(1)
  })

  it("degrades to a bare name when the parent cannot be resolved", async () => {
    const { api: client } = api({})
    const toPath = pathResolver(client)
    expect(
      await toPath(entry({ name: "orphan.txt", parentfolderid: 99 })),
    ).toBe("/orphan.txt")
  })

  // pCloud should never produce one, but a malformed parent chain would
  // otherwise recurse until the stack gives out.
  it("survives a cycle in the parent chain", async () => {
    const { api: client } = api({
      1: { name: "a", parentfolderid: 2 },
      2: { name: "b", parentfolderid: 1 },
    })
    const toPath = pathResolver(client)
    await expect(
      toPath(entry({ name: "f", parentfolderid: 1 })),
    ).resolves.toBeTypeOf("string")
  })

  it("names an event with no metadata rather than throwing", async () => {
    const { api: client } = api({})
    const toPath = pathResolver(client)
    expect(await toPath({ diffid: 1, event: "x", time: "" } as never)).toBe(
      "/?",
    )
  })
})
