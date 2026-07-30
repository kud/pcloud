import { PCloudAPI } from "../api.js"
import { TokenStore } from "./token-store.js"
import { OAuthFlow } from "./oauth.js"

export interface ResolveAuthOptions {
  tokenEnvVar?: string
  authEnvVar?: string
  clientIdEnvVar?: string
  clientSecretEnvVar?: string
  defaultApiServer?: string
}

// Everything except the interactive OAuth browser round-trip, so callers that
// cannot await (React render paths, sync entrypoints) still get the same
// precedence rules rather than reimplementing them and drifting.
export const resolveStoredAuth = (
  options: ResolveAuthOptions = {},
): PCloudAPI | null => {
  const {
    tokenEnvVar = "PCLOUD_ACCESS_TOKEN",
    authEnvVar = "PCLOUD_AUTH",
    defaultApiServer = "https://eapi.pcloud.com",
  } = options

  const envAuth = process.env[authEnvVar]
  if (envAuth) {
    const api = new PCloudAPI(defaultApiServer)
    api.setAuth(envAuth)
    return api
  }

  const envToken = process.env[tokenEnvVar]
  if (envToken) {
    const api = new PCloudAPI(defaultApiServer)
    api.setAccessToken(envToken)
    return api
  }

  const stored = new TokenStore().load()
  const apiServer = stored?.hostname
    ? `https://${stored.hostname}`
    : defaultApiServer

  // Preferred over an access_token when both are stored: the session token is
  // the strictly more capable tier (revisions, trash, zip, downloads).
  if (stored?.auth) {
    const api = new PCloudAPI(apiServer)
    api.setAuth(stored.auth, apiServer)
    return api
  }

  if (stored?.access_token) {
    const api = new PCloudAPI(apiServer)
    api.setAccessToken(stored.access_token, apiServer)
    return api
  }

  return null
}

export const resolveAuth = async (
  options: ResolveAuthOptions = {},
): Promise<PCloudAPI> => {
  const {
    tokenEnvVar = "PCLOUD_ACCESS_TOKEN",
    clientIdEnvVar = "PCLOUD_CLIENT_ID",
    clientSecretEnvVar = "PCLOUD_CLIENT_SECRET",
    defaultApiServer = "https://eapi.pcloud.com",
  } = options

  const stored = resolveStoredAuth(options)
  if (stored) return stored

  const store = new TokenStore()
  const clientId = process.env[clientIdEnvVar]
  const clientSecret = process.env[clientSecretEnvVar]
  if (clientId && clientSecret) {
    const flow = new OAuthFlow(clientId, clientSecret)
    const tokens = await flow.authenticate()
    store.save({ access_token: tokens.access_token, hostname: tokens.hostname })
    const apiServer = tokens.hostname
      ? `https://${tokens.hostname}`
      : defaultApiServer
    const api = new PCloudAPI(apiServer)
    api.setAccessToken(tokens.access_token, apiServer)
    return api
  }

  throw new Error(
    `No pCloud credentials found. Set ${tokenEnvVar}, or ${clientIdEnvVar} + ${clientSecretEnvVar}, or run \`pcloud login\`.`,
  )
}
