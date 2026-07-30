// Presentation helpers live in the core, not in each surface: the CLI, the Ink
// components and the MCP server must render the same byte count the same way,
// and three private copies of this drifted apart is exactly how that breaks.
const UNITS = ["Bytes", "KB", "MB", "GB", "TB"]

export const formatBytes = (bytes: number): string => {
  if (!bytes) return "0 Bytes"
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    UNITS.length - 1,
  )
  const value = Math.round((bytes / Math.pow(1024, exponent)) * 100) / 100
  return `${value} ${UNITS[exponent]}`
}

// pCloud sends RFC-1123 datetimes ("Thu, 30 Jul 2026 20:46:27 +0000"). The
// weekday and offset are noise in a list where every row shares them.
export const formatTimestamp = (time?: string): string =>
  time?.replace(/^\w{3}, /, "").replace(/ \+\d{4}$/, "") ?? "-"
