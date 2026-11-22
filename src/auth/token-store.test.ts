import fs from "fs"
import os from "os"
import path from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TokenStore } from "./token-store.js"

const mode = (p: string) => fs.statSync(p).mode & 0o777

describe.skipIf(process.platform === "win32")("TokenStore permissions", () => {
  let home: string
  let dir: string
  let file: string

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "pcloud-home-"))
    vi.spyOn(os, "homedir").mockReturnValue(home)
    dir = path.join(home, ".config", "pcloud")
    file = path.join(dir, "tokens.json")
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(home, { recursive: true, force: true })
  })

  it("creates the config directory 0700", () => {
    new TokenStore()
    expect(mode(dir)).toBe(0o700)
  })

  it("never writes the token file with a mode wider than 0600", () => {
    const opened: unknown[] = []
    const realOpen = fs.openSync
    vi.spyOn(fs, "openSync").mockImplementation(((...args: Parameters<typeof fs.openSync>) => {
      opened.push(args[2])
      return realOpen(...args)
    }) as typeof fs.openSync)
    const writes = vi.spyOn(fs, "writeFileSync")

    new TokenStore().save({ auth: "secret" })

    expect(opened).toEqual([0o600])
    // No path-based write: that would create the file with the umask default.
    for (const call of writes.mock.calls) expect(typeof call[0]).toBe("number")
    expect(mode(file)).toBe(0o600)
    expect(JSON.parse(fs.readFileSync(file, "utf-8"))).toEqual({ auth: "secret" })
    expect(fs.readdirSync(dir)).toEqual(["tokens.json"])
  })

  it("tightens an existing directory and token file", () => {
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 })
    fs.chmodSync(dir, 0o755)
    fs.writeFileSync(file, "{}")
    fs.chmodSync(file, 0o644)

    new TokenStore()

    expect(mode(dir)).toBe(0o700)
    expect(mode(file)).toBe(0o600)
  })

  it("replaces an existing token file", () => {
    const store = new TokenStore()
    store.save({ auth: "one" })
    store.save({ auth: "two" })
    expect(store.load()).toEqual({ auth: "two" })
    expect(mode(file)).toBe(0o600)
  })
})
