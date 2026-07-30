import os from "os"
import { PCloudAPI } from "../api.js"

const PLATFORM_NAMES: Record<string, string> = {
  darwin: "macOS",
  linux: "Linux",
  win32: "Windows",
}

// This string is the whole basis on which a session gets recognised months later
// in pcloud.com → Settings → Devices, sitting beside entries like "Web (node)"
// and "pCloud Drive". Router-assigned suffixes (.local, .home, .lan) carry no
// information and only crowd out the part that identifies the machine.
const describeHost = (): string => {
  const host = os.hostname().replace(/\.(local|home|lan|localdomain)$/i, "")
  const platform = PLATFORM_NAMES[os.platform()] ?? os.platform()
  return `${host} · ${platform}`
}

export interface SessionLoginOptions {
  username: string
  password: string
  apiServer?: string
  trustDevice?: boolean
  expireSeconds?: number
  inactiveExpireSeconds?: number
  deviceName?: string
  requestCode?: (tfaType?: number) => Promise<string>
}

export interface SessionLoginResult {
  auth: string
  apiServer: string
  expiresAt?: number
}

export const sessionLogin = async ({
  username,
  password,
  apiServer = "https://eapi.pcloud.com",
  trustDevice = false,
  expireSeconds,
  inactiveExpireSeconds,
  deviceName,
  requestCode,
}: SessionLoginOptions): Promise<SessionLoginResult> => {
  const api = new PCloudAPI(apiServer)

  const loginOptions = {
    expireSeconds,
    inactiveExpireSeconds,
    deviceName: deviceName ?? `pCloud CLI · ${describeHost()}`,
    deviceId: `pcloud-cli-${os.hostname()}`,
  }

  const first = await api.login(username, password, loginOptions)
  if (first.auth)
    return { auth: first.auth, apiServer, expiresAt: first.expiresAt }

  if (!first.needsCode) {
    throw new Error(
      "pCloud returned neither a session token nor a 2FA challenge",
    )
  }

  if (!requestCode) {
    throw new Error(
      "This account has two-factor authentication enabled, but no way to ask for the code was provided.",
    )
  }

  const code = await requestCode(first.tfaType)

  // Exchange the token when pCloud issued one; otherwise the challenge was a
  // plain refusal and the code belongs on a repeat of the original call.
  const second = first.tfaToken
    ? await api.tfaLogin(first.tfaToken, code, trustDevice, loginOptions)
    : await api.loginWithCode(username, password, code, loginOptions)

  if (!second.auth) {
    throw new Error(
      `Two-factor authentication did not return a session token. pCloud returned: ${JSON.stringify(second.raw ?? {})}`,
    )
  }

  return { auth: second.auth, apiServer, expiresAt: second.expiresAt }
}
