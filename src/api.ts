import {
  PCloudAuthResponse,
  PCloudDiffOptions,
  PCloudDiffResponse,
  PCloudLoginOptions,
  PCloudLoginResponse,
  PCloudLoginResult,
  PCloudLogoutResponse,
  PCloudChecksumResponse,
  PCloudFileLinkResponse,
  PCloudFolderResponse,
  PCloudPublinkResponse,
  PCloudPublinksResponse,
  PCloudResponse,
  PCloudRevisionsResponse,
  PCloudSharesResponse,
  PCloudUserInfo,
  PCloudZipLinkResponse,
} from "./types.js"

// pCloud's error pages echo the full request URL back in the body, query string
// included — so an error body carries the caller's access_token in plaintext
// unless it is scrubbed before it reaches a message, a log, or scrollback.
const redactSecrets = (text: string): string =>
  text.replace(
    /\b(access_token|auth|password|client_secret)=[^&\s"'<]*/gi,
    "$1=REDACTED",
  )

// pCloud's own defaults are authexpire 31536000 (a year) and authinactiveexpire
// 2678400 (31 days). A year-long credential sitting in a dotfile is not a default
// worth inheriting, so both are always sent: 30 days absolute, 7 days idle.
const DEFAULT_EXPIRE_SECONDS = 30 * 24 * 60 * 60
const DEFAULT_INACTIVE_EXPIRE_SECONDS = 7 * 24 * 60 * 60

// Field names and non-secret scalars only. `auth` and `token` are credentials,
// so they are reported as presence, never value — a diagnostic that leaks the
// thing it is diagnosing is worse than no diagnostic.
const SECRET_FIELDS = new Set(["auth", "token", "password", "passworddigest"])

const safeSummary = (
  response: Record<string, unknown>,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(response).map(([key, value]) => [
      key,
      SECRET_FIELDS.has(key) ? `<present: ${typeof value}>` : value,
    ]),
  )

export class PCloudAPI {
  private auth?: string
  private accessToken?: string
  private apiServer: string

  constructor(apiServer: string = "https://eapi.pcloud.com") {
    this.apiServer = apiServer
  }

  setAccessToken(accessToken: string, apiServer?: string): void {
    this.accessToken = accessToken
    if (apiServer) {
      this.apiServer = apiServer
    }
  }

  setAuth(auth: string, apiServer?: string): void {
    this.auth = auth
    if (apiServer) {
      this.apiServer = apiServer
    }
  }

  // A session token outranks an OAuth access token: listrevisions, revertrevision,
  // getziplink, trash_* and downloads all answer result 1000 "Log in required" to
  // an access_token no matter its app permissions, and only accept `auth`.
  private adopt(
    response: PCloudLoginResponse,
    expireSeconds?: number,
  ): PCloudLoginResult {
    if (response.result === 0 && response.auth) {
      this.auth = response.auth
      if (response.apiserver) {
        this.apiServer = `https://${response.apiserver}`
      }
      return {
        auth: response.auth,
        expiresAt: expireSeconds
          ? Date.now() + expireSeconds * 1000
          : undefined,
      }
    }

    // Two shapes for the same challenge: some flows hand back a token to exchange
    // via tfa_login, others simply refuse and ask for 'code' on the original call.
    // Both mean the same thing to a caller — go and get a code from the user.
    if (response.token || /\bcode\b/i.test(response.error ?? "")) {
      return {
        tfaToken: response.token,
        tfaType: response.tfatype,
        needsCode: true,
        raw: safeSummary(response),
      }
    }

    throw new Error(
      `${response.error || "Login failed"} (result ${response.result}) — pCloud returned: ${JSON.stringify(safeSummary(response))}`,
    )
  }

  async login(
    username: string,
    password: string,
    options: PCloudLoginOptions = {},
  ): Promise<PCloudLoginResult> {
    const {
      expireSeconds = DEFAULT_EXPIRE_SECONDS,
      inactiveExpireSeconds = DEFAULT_INACTIVE_EXPIRE_SECONDS,
      deviceName = "pCloud SDK",
      deviceId = "pcloud-sdk",
      os = "4",
    } = options

    return this.adopt(
      await this.post<PCloudLoginResponse>("login", {
        getauth: 1,
        logout: 1,
        username,
        password,
        deviceid: deviceId,
        device: deviceName,
        os,
        authexpire: expireSeconds,
        authinactiveexpire: inactiveExpireSeconds,
      }),
      expireSeconds,
    )
  }

  // Revokes the session token server-side. Deleting the local copy is not a
  // logout: without this the token stays live on pCloud until it expires.
  async logout(): Promise<PCloudLogoutResponse> {
    return this.request<PCloudLogoutResponse>("logout", this.getAuthParams())
  }

  // The no-token variant: re-send the original credentials with the code added.
  async loginWithCode(
    username: string,
    password: string,
    code: string,
    options: PCloudLoginOptions = {},
  ): Promise<PCloudLoginResult> {
    const {
      expireSeconds = DEFAULT_EXPIRE_SECONDS,
      inactiveExpireSeconds = DEFAULT_INACTIVE_EXPIRE_SECONDS,
      deviceName = "pCloud SDK",
    } = options

    return this.adopt(
      await this.post<PCloudLoginResponse>("userinfo", {
        getauth: 1,
        logout: 1,
        username,
        password,
        code,
        device: deviceName,
        authexpire: expireSeconds,
        authinactiveexpire: inactiveExpireSeconds,
      }),
      expireSeconds,
    )
  }

  async tfaLogin(
    tfaToken: string,
    code: string,
    trustDevice = false,
    options: PCloudLoginOptions = {},
  ): Promise<PCloudLoginResult> {
    const {
      expireSeconds = DEFAULT_EXPIRE_SECONDS,
      inactiveExpireSeconds = DEFAULT_INACTIVE_EXPIRE_SECONDS,
      deviceName = "pCloud SDK",
      deviceId = "pcloud-sdk",
      os = "4",
    } = options

    // The token is minted by whichever call last succeeds, so on a 2FA account
    // that is this one — device naming and expiry sent only on the first leg are
    // silently discarded, leaving pCloud's year-long default under the name it
    // infers from the user agent ("Web (node)").
    return this.adopt(
      await this.post<PCloudLoginResponse>("tfa_login", {
        getauth: 1,
        token: tfaToken,
        code,
        trustdevice: trustDevice ? 1 : 0,
        deviceid: deviceId,
        device: deviceName,
        os,
        authexpire: expireSeconds,
        authinactiveexpire: inactiveExpireSeconds,
      }),
      expireSeconds,
    )
  }

  async sendTfaCodeViaSms(tfaToken: string): Promise<PCloudResponse> {
    return this.request("tfa_sendcodeviasms", { token: tfaToken })
  }

  async authenticate(username: string, password: string): Promise<void> {
    const response = await this.post<PCloudAuthResponse>("userinfo", {
      getauth: 1,
      logout: 1,
      username,
      password,
    })

    if (response.result !== 0) {
      throw new Error(
        `Authentication failed: ${response.error || "Unknown error"}`,
      )
    }

    this.auth = response.auth
    if (response.apiserver) {
      this.apiServer = `https://${response.apiserver}`
    }
  }

  async userInfo(): Promise<PCloudUserInfo> {
    return this.request<PCloudUserInfo>("userinfo", this.getAuthParams())
  }

  async diff(options: PCloudDiffOptions = {}): Promise<PCloudDiffResponse> {
    return this.request<PCloudDiffResponse>("diff", {
      ...this.getAuthParams(),
      ...options,
    })
  }

  async listFolder(path: string = "/"): Promise<PCloudFolderResponse> {
    return this.request<PCloudFolderResponse>("listfolder", {
      ...this.getAuthParams(),
      path,
    })
  }

  async stat(path: string): Promise<PCloudResponse> {
    return this.request("stat", {
      ...this.getAuthParams(),
      path,
    })
  }

  async createFolder(path: string): Promise<PCloudFolderResponse> {
    return this.request<PCloudFolderResponse>("createfolderifnotexists", {
      ...this.getAuthParams(),
      path,
    })
  }

  async deleteFolder(folderid: number): Promise<PCloudResponse> {
    return this.request("deletefolderrecursive", {
      ...this.getAuthParams(),
      folderid,
    })
  }

  async copyFile(fileid: number, topath: string): Promise<PCloudResponse> {
    return this.request("copyfile", {
      ...this.getAuthParams(),
      fileid,
      topath,
    })
  }

  async moveFile(fileid: number, topath: string): Promise<PCloudResponse> {
    return this.request("renamefile", {
      ...this.getAuthParams(),
      fileid,
      topath,
    })
  }

  async renameFile(fileid: number, toname: string): Promise<PCloudResponse> {
    return this.request("renamefile", {
      ...this.getAuthParams(),
      fileid,
      toname,
    })
  }

  async deleteFile(fileid: number): Promise<PCloudResponse> {
    return this.request("deletefile", {
      ...this.getAuthParams(),
      fileid,
    })
  }

  async getFileLink(fileid: number): Promise<PCloudFileLinkResponse> {
    return this.request<PCloudFileLinkResponse>("getfilelink", {
      ...this.getAuthParams(),
      fileid,
    })
  }

  async checksumFile(fileid: number): Promise<PCloudChecksumResponse> {
    return this.request<PCloudChecksumResponse>("checksumfile", {
      ...this.getAuthParams(),
      fileid,
    })
  }

  async listRevisions(fileid: number): Promise<PCloudRevisionsResponse> {
    return this.request<PCloudRevisionsResponse>("listrevisions", {
      ...this.getAuthParams(),
      fileid,
    })
  }

  async revertRevision(
    fileid: number,
    revisionid: number,
  ): Promise<PCloudResponse> {
    return this.request("revertrevision", {
      ...this.getAuthParams(),
      fileid,
      revisionid,
    })
  }

  async listShares(): Promise<PCloudSharesResponse> {
    return this.request<PCloudSharesResponse>(
      "listshares",
      this.getAuthParams(),
    )
  }

  async shareFolder(
    folderid: number,
    mail: string,
    permissions: number,
  ): Promise<PCloudResponse> {
    return this.request("sharefolder", {
      ...this.getAuthParams(),
      folderid,
      mail,
      permissions,
    })
  }

  async acceptShare(sharerequestid: number): Promise<PCloudResponse> {
    return this.request("acceptshare", {
      ...this.getAuthParams(),
      sharerequestid,
    })
  }

  async declineShare(sharerequestid: number): Promise<PCloudResponse> {
    return this.request("declineshare", {
      ...this.getAuthParams(),
      sharerequestid,
    })
  }

  async removeShare(sharerequestid: number): Promise<PCloudResponse> {
    return this.request("removeshare", {
      ...this.getAuthParams(),
      sharerequestid,
    })
  }

  async getFilePublink(
    fileid: number,
    expire?: string,
    maxdownloads?: number,
  ): Promise<PCloudPublinkResponse> {
    return this.request<PCloudPublinkResponse>("getfilepublink", {
      ...this.getAuthParams(),
      fileid,
      ...(expire !== undefined && { expire }),
      ...(maxdownloads !== undefined && { maxdownloads }),
    })
  }

  async getFolderPublink(
    folderid: number,
    expire?: string,
  ): Promise<PCloudPublinkResponse> {
    return this.request<PCloudPublinkResponse>("getfolderpublink", {
      ...this.getAuthParams(),
      folderid,
      ...(expire !== undefined && { expire }),
    })
  }

  async listPublinks(): Promise<PCloudPublinksResponse> {
    return this.request<PCloudPublinksResponse>(
      "listpublinks",
      this.getAuthParams(),
    )
  }

  async deletePublink(code: string): Promise<PCloudResponse> {
    return this.request("deletepublink", {
      ...this.getAuthParams(),
      code,
    })
  }

  async getZipLink(
    fileids: number[],
    folderids?: number[],
    filename?: string,
  ): Promise<PCloudZipLinkResponse> {
    return this.request<PCloudZipLinkResponse>("getziplink", {
      ...this.getAuthParams(),
      fileids: fileids.join(","),
      ...(folderids !== undefined && { folderids: folderids.join(",") }),
      ...(filename !== undefined && { filename }),
    })
  }

  async listTrash(): Promise<PCloudResponse> {
    return this.request("trash_list", this.getAuthParams())
  }

  async restoreFromTrash(fileid: number): Promise<PCloudResponse> {
    return this.request("trash_restore", { ...this.getAuthParams(), fileid })
  }

  async listRewindFiles(path: string): Promise<PCloudResponse> {
    return this.request("listrewindevents", {
      ...this.getAuthParams(),
      path,
    })
  }

  async restoreFromRewind(
    fileid: number,
    topath: string,
  ): Promise<PCloudResponse> {
    return this.request("file_restore", {
      ...this.getAuthParams(),
      fileid,
      topath,
    })
  }

  private getAuthParams(): Record<string, string> {
    if (this.accessToken) {
      return { access_token: this.accessToken }
    }
    if (this.auth) {
      return { auth: this.auth }
    }
    return {}
  }

  // Credential-bearing calls go in a POST body, never the query string: pCloud
  // accepts both, but a URL carrying a password is recorded verbatim by every
  // access log, proxy and error page between here and the server.
  async post<T = any>(
    method: string,
    params: Record<string, any> = {},
  ): Promise<T> {
    const body = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        body.append(key, String(value))
      }
    }

    const response = await fetch(`${this.apiServer}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    })
    const text = await response.text()
    try {
      return JSON.parse(text) as T
    } catch {
      throw new Error(
        `pCloud API returned non-JSON (HTTP ${response.status}) for ${method}: ${redactSecrets(text).slice(0, 200)}`,
      )
    }
  }

  async request<T = any>(
    method: string,
    params: Record<string, any> = {},
  ): Promise<T> {
    const url = new URL(`${this.apiServer}/${method}`)

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value))
      }
    }

    const response = await fetch(url.toString())
    const text = await response.text()
    try {
      return JSON.parse(text) as T
    } catch {
      throw new Error(
        `pCloud API returned non-JSON (HTTP ${response.status}) for ${method}: ${redactSecrets(text).slice(0, 200)}`,
      )
    }
  }
}
