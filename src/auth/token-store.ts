import fs from "fs"
import path from "path"
import os from "os"
import { randomBytes } from "crypto"

export interface StoredTokens {
  access_token?: string
  auth?: string
  hostname?: string
  expiresAt?: number
}

// Best effort: chmod is largely a no-op on Windows, and a file owned by
// someone else cannot be tightened from here.
const tighten = (target: string, mode: number): void => {
  try {
    fs.chmodSync(target, mode)
  } catch {
    // ignore
  }
}

export class TokenStore {
  private tokenPath: string

  constructor() {
    const configDir = path.join(os.homedir(), ".config", "pcloud")
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 })
    }
    tighten(configDir, 0o700)
    this.tokenPath = path.join(configDir, "tokens.json")
    // Files written by earlier versions were briefly world-readable and may
    // have kept a wider mode; bring them in line.
    if (fs.existsSync(this.tokenPath)) tighten(this.tokenPath, 0o600)
  }

  // The credential never exists on disk with a wider mode than 0600: it is
  // written to a fresh private temp file and renamed over the old one, so a
  // reader sees either the previous file or the complete new one.
  save(tokens: StoredTokens): void {
    const tmp = `${this.tokenPath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`
    const fd = fs.openSync(tmp, "wx", 0o600)
    try {
      fs.writeFileSync(fd, JSON.stringify(tokens, null, 2), "utf-8")
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    try {
      tighten(tmp, 0o600)
      fs.renameSync(tmp, this.tokenPath)
    } catch (err) {
      fs.rmSync(tmp, { force: true })
      throw err
    }
  }

  load(): StoredTokens | null {
    try {
      if (!fs.existsSync(this.tokenPath)) return null
      return JSON.parse(fs.readFileSync(this.tokenPath, "utf-8"))
    } catch {
      return null
    }
  }

  delete(): void {
    if (fs.existsSync(this.tokenPath)) fs.unlinkSync(this.tokenPath)
  }

  exists(): boolean {
    return fs.existsSync(this.tokenPath)
  }
}
