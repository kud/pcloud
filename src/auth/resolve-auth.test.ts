import fs from "fs"
import os from "os"
import path from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { resolveAuth } from "./resolve-auth.js"

// The session token is the first thing resolveAuth looks for, so an error that
// leaves it out sends people to the weaker credential.
describe("resolveAuth with nothing to go on", () => {
  let home: string

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "pcloud-home-"))
    vi.spyOn(os, "homedir").mockReturnValue(home)
    for (const name of [
      "PCLOUD_AUTH",
      "PCLOUD_ACCESS_TOKEN",
      "PCLOUD_CLIENT_ID",
      "PCLOUD_CLIENT_SECRET",
    ]) {
      vi.stubEnv(name, "")
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    fs.rmSync(home, { recursive: true, force: true })
  })

  it("names every variable it would have read", async () => {
    await expect(resolveAuth()).rejects.toThrow(
      /PCLOUD_AUTH.*PCLOUD_ACCESS_TOKEN.*PCLOUD_CLIENT_ID.*PCLOUD_CLIENT_SECRET/,
    )
  })

  it("follows a renamed session-token variable", async () => {
    await expect(resolveAuth({ authEnvVar: "MY_AUTH" })).rejects.toThrow(
      /MY_AUTH/,
    )
  })
})
