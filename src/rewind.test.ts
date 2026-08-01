import { describe, expect, it, vi } from "vitest"
import { planRewind, applyRewind } from "./rewind.js"
import type { PCloudAPI } from "./api.js"

// planRewind and applyRewind restore deletions and revert files. They are the
// only code here that destroys anything, and until now the only code here with
// nothing pinning its behaviour — both bugs found on 2026-07-31 lived in a
// second copy of this logic that had drifted from it.

const at = (iso: string) => new Date(iso).toUTCString()

const entry = (event: string, iso: string, metadata: object) => ({
  diffid: Math.floor(Math.random() * 1e6),
  event,
  time: at(iso),
  metadata,
})

const api = (entries: unknown[], overrides: Partial<PCloudAPI> = {}) =>
  ({
    diff: vi.fn(async () => ({ result: 0, entries })),
    listFolderById: vi.fn(async () => ({ result: 0, metadata: {} })),
    ...overrides,
  }) as unknown as PCloudAPI

const SINCE = new Date("2026-07-31T12:00:00Z")

describe("planRewind", () => {
  it("classifies a deletion as a restore and an edit as a revert", async () => {
    const plan = await planRewind(
      api([
        entry("deletefile", "2026-07-31T13:00:00Z", {
          fileid: 1,
          name: "gone.txt",
        }),
        entry("modifyfile", "2026-07-31T14:00:00Z", {
          fileid: 2,
          name: "edited.txt",
        }),
      ]),
      SINCE,
    )
    expect(plan.actions.map((a) => a.kind)).toEqual(["restore", "revert"])
  })

  // The asymmetry is deliberate: the only way to undo a creation is to delete
  // real data, which is indistinguishable from the accident being repaired.
  it("reports a creation but never acts on it", async () => {
    const plan = await planRewind(
      api([
        entry("createfile", "2026-07-31T13:00:00Z", {
          fileid: 3,
          name: "new.txt",
        }),
      ]),
      SINCE,
    )
    expect(plan.actions.map((a) => a.kind)).toEqual(["created"])
  })

  it("ignores events older than the cutoff", async () => {
    const plan = await planRewind(
      api([
        entry("deletefile", "2026-07-31T11:00:00Z", { fileid: 1, name: "old" }),
        entry("deletefile", "2026-07-31T13:00:00Z", { fileid: 2, name: "new" }),
      ]),
      SINCE,
    )
    expect(plan.actions).toHaveLength(1)
    expect(plan.actions[0].name).toBe("new")
  })

  // A folder deletion carries no fileid, and both recovery paths key off one.
  // Its children arrive as their own events, so nothing is lost by skipping it.
  it("skips a folder deletion rather than inventing an id for it", async () => {
    const plan = await planRewind(
      api([
        entry("deletefolder", "2026-07-31T13:00:00Z", {
          folderid: 9,
          name: "docs",
        }),
      ]),
      SINCE,
    )
    expect(plan.actions).toEqual([])
  })

  it("filters by path prefix when given one", async () => {
    const plan = await planRewind(
      api([
        entry("deletefile", "2026-07-31T13:00:00Z", {
          fileid: 1,
          name: "a",
          path: "/Keep/a",
        }),
        entry("deletefile", "2026-07-31T13:00:00Z", {
          fileid: 2,
          name: "b",
          path: "/Other/b",
        }),
      ]),
      SINCE,
      "/Keep",
    )
    expect(plan.actions.map((a) => a.name)).toEqual(["a"])
  })

  it("surfaces a diff failure rather than planning against nothing", async () => {
    const failing = {
      diff: vi.fn(async () => ({ result: 2000, error: "Log in failed." })),
    } as unknown as PCloudAPI
    await expect(planRewind(failing, SINCE)).rejects.toThrow("Log in failed.")
  })

  // A rewind that silently ignored part of its own window would be worse than
  // one that refuses: you would believe it had undone everything.
  it("refuses when the window reaches past the scan limit", async () => {
    const entries = Array.from({ length: 5000 }, () =>
      entry("modifyfile", "2026-07-31T13:00:00Z", { fileid: 1, name: "x" }),
    )
    await expect(planRewind(api(entries), SINCE)).rejects.toThrow(
      /was not scanned/,
    )
  })
})

describe("applyRewind", () => {
  const plan = (actions: unknown[]) =>
    ({
      actions,
      since: SINCE.toISOString(),
      scanned: actions.length,
    }) as never

  it("restores a deletion from trash", async () => {
    const restore = vi.fn(async () => ({ result: 0 }))
    const outcomes = await applyRewind(
      { restoreFromTrash: restore } as unknown as PCloudAPI,
      plan([
        { kind: "restore", fileid: 7, name: "gone", path: "/gone", at: "" },
      ]),
    )
    expect(restore).toHaveBeenCalledWith(7)
    expect(outcomes[0]).toMatchObject({ ok: true })
  })

  it("never touches a creation", async () => {
    const restore = vi.fn()
    const outcomes = await applyRewind(
      { restoreFromTrash: restore } as unknown as PCloudAPI,
      plan([{ kind: "created", name: "new", path: "/new", at: "" }]),
    )
    expect(restore).not.toHaveBeenCalled()
    expect(outcomes).toEqual([])
  })

  // pCloud promises no order here. Taking whichever revision arrived first is
  // the bug that shipped twice — it reverts far further back than the cutoff.
  it("reverts to the newest revision at or before the cutoff", async () => {
    const revert = vi.fn(async () => ({ result: 0 }))
    await applyRewind(
      {
        listRevisions: vi.fn(async () => ({
          result: 0,
          revisions: [
            { revisionid: 3, created: at("2026-07-31T09:00:00Z"), size: 1 },
            { revisionid: 9, created: at("2026-07-31T11:00:00Z"), size: 1 },
            // After the cutoff — part of what is being undone, not a target.
            { revisionid: 12, created: at("2026-07-31T13:00:00Z"), size: 1 },
          ],
        })),
        revertRevision: revert,
      } as unknown as PCloudAPI,
      plan([{ kind: "revert", fileid: 4, name: "f", path: "/f", at: "" }]),
    )
    expect(revert).toHaveBeenCalledWith(4, 9)
  })

  it("reports a file with no revision old enough rather than guessing", async () => {
    const revert = vi.fn()
    const outcomes = await applyRewind(
      {
        listRevisions: vi.fn(async () => ({
          result: 0,
          revisions: [
            { revisionid: 12, created: at("2026-07-31T13:00:00Z"), size: 1 },
          ],
        })),
        revertRevision: revert,
      } as unknown as PCloudAPI,
      plan([{ kind: "revert", fileid: 4, name: "f", path: "/f", at: "" }]),
    )
    expect(revert).not.toHaveBeenCalled()
    expect(outcomes[0]).toMatchObject({ ok: false })
    expect(outcomes[0].detail).toMatch(/no revision/i)
  })

  it("carries a failure through instead of reporting success", async () => {
    const outcomes = await applyRewind(
      {
        restoreFromTrash: vi.fn(async () => ({
          result: 2009,
          error: "File not found.",
        })),
      } as unknown as PCloudAPI,
      plan([{ kind: "restore", fileid: 7, name: "g", path: "/g", at: "" }]),
    )
    expect(outcomes[0]).toMatchObject({ ok: false, detail: "File not found." })
  })
})
