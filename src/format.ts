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

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

// The date alone, for lists too narrow to carry a time of day.
//
// Built from UTC parts rather than sliced: `modified.slice(0, 10)` reads as an
// equivalent shortcut and is not, because it assumes ISO. Against pCloud's
// RFC-1123 it produced "Thu, 14 Ma" — a value that looks like a date, sorts
// like a date, and is neither.
export const formatDate = (time?: string): string => {
  if (!time) return ""
  const at = new Date(time)
  if (Number.isNaN(at.getTime())) return ""
  const day = String(at.getUTCDate()).padStart(2, "0")
  return `${day} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`
}
