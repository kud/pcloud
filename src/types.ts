export interface PCloudAuthResponse {
  result: number
  auth: string
  locationid?: number
  apiserver?: string
  error?: string
}

export interface PCloudFile {
  fileid: number
  name: string
  path: string
  isfolder: boolean
  size?: number
  modified?: string
}

export interface PCloudTrashItem extends PCloudFile {
  deletetime: number
}

export interface PCloudRewindItem {
  fileid: number
  name: string
  path: string
  time: number
}

export interface PCloudLoginResponse {
  result: number
  error?: string
  auth?: string
  token?: string
  tfatype?: number
  apiserver?: string
  [key: string]: unknown
}

export interface PCloudLoginResult {
  auth?: string
  tfaToken?: string
  tfaType?: number
  needsCode?: boolean
  expiresAt?: number
  // pCloud's reply, minus the credential fields. Carried so a caller can report
  // what actually came back instead of inferring it from a failure message.
  raw?: Record<string, unknown>
}

export interface PCloudLogoutResponse {
  result: number
  error?: string
  auth_deleted?: boolean
}

export interface PCloudLoginOptions {
  // Seconds from now. pCloud's own default is undocumented, so both are always
  // sent explicitly rather than inherited — an unbounded credential on disk is
  // not something to acquire by omission.
  expireSeconds?: number
  inactiveExpireSeconds?: number
  // `device` is a documented global parameter and surfaces in pcloud.com →
  // Settings → Devices, which is where a session gets revoked from. `deviceId`
  // and `os` are not documented anywhere, but the `login` endpoint rejects the
  // request without them, and it is the only endpoint that performs the 2FA
  // handshake — `userinfo` re-asks for the code forever (result 1022).
  deviceName?: string
  deviceId?: string
  os?: string
}

export interface PCloudDiffMetadata {
  fileid?: number
  folderid?: number
  parentfolderid?: number
  name?: string
  path?: string
  isfolder?: boolean
  size?: number
  modified?: string
  ismine?: boolean
}

export interface PCloudDiffEntry {
  diffid: number
  event: string
  time: string
  metadata?: PCloudDiffMetadata
}

export interface PCloudDiffResponse {
  result: number
  error?: string
  diffid?: number
  entries?: PCloudDiffEntry[]
}

export interface PCloudDiffOptions {
  after?: string
  diffid?: number
  last?: number
  limit?: number
}

export interface PCloudResponse<T = any> {
  result: number
  error?: string
  metadata?: T
  contents?: T[]
}

export interface PCloudUserInfo {
  result: number
  email: string
  quota: number
  usedquota: number
  plan: number
  error?: string
}

export interface PCloudFolderItem {
  fileid?: number
  folderid?: number
  name: string
  isfolder: boolean
  size?: number
  modified?: string
  created?: string
  contenttype?: string
}

export interface PCloudFolderMetadata {
  folderid: number
  name: string
  path: string
  contents?: PCloudFolderItem[]
}

export interface PCloudFolderResponse {
  result: number
  error?: string
  metadata?: PCloudFolderMetadata
}

export interface PCloudFileLinkResponse {
  result: number
  error?: string
  hosts: string[]
  path: string
}

export interface PCloudChecksumResponse {
  result: number
  error?: string
  sha256: string
  sha1: string
  md5: string
}

// An accepted share, keyed by shareid — which is what removeshare wants, and
// not the sharerequestid that accept/decline take. Permissions arrive as four
// booleans here rather than the bitmask sharefolder is handed.
export interface PCloudShareItem {
  shareid: number
  folderid: number
  foldername?: string
  /** Outgoing only — who you shared it with. */
  tomail?: string
  /** Incoming only — who shared it with you. */
  frommail?: string
  touserid?: number
  fromuserid?: number
  owneruserid?: number
  folderowneruserid?: number
  canread?: boolean
  cancreate?: boolean
  canmodify?: boolean
  candelete?: boolean
  created?: string
}

// A share offered but not yet accepted: a different id, a different mail field,
// and permissions as the bitmask. Conflating the two is what made `list-shares`
// print columns no active share has.
export interface PCloudShareRequest {
  sharerequestid: number
  folderid: number
  sharename?: string
  mail?: string
  message?: string
  permissions?: number
  created?: string
  expires?: string
}

export interface PCloudShareDirections<T> {
  outgoing?: T[]
  incoming?: T[]
}

// listshares answers with two objects, each split by direction — never the flat
// array this was declared as. The wrong type was the whole bug: `.forEach` on
// `response.shares` typechecked, then threw at runtime.
export interface PCloudSharesResponse {
  result: number
  error?: string
  shares?: PCloudShareDirections<PCloudShareItem>
  requests?: PCloudShareDirections<PCloudShareRequest>
}

export interface PCloudPublink {
  code: string
  link: string
  fileid?: number
  folderid?: number
  name?: string
  expire?: string
  downloads?: number
  maxdownloads?: number
}

export interface PCloudPublinkResponse {
  result: number
  error?: string
  link: string
  code: string
}

export interface PCloudPublinksResponse {
  result: number
  error?: string
  publinks: PCloudPublink[]
}

export interface PCloudRevision {
  revisionid: number
  size: number
  created?: string
  modified?: string
}

export interface PCloudRevisionsResponse {
  result: number
  error?: string
  revisions: PCloudRevision[]
}

export interface PCloudZipLinkResponse {
  result: number
  error?: string
  hosts: string[]
  path: string
}
