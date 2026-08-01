import { describe, expect, it } from "vitest"
import { formatBytes, formatDate, formatTimestamp } from "./format.js"

// pCloud's datetimes are RFC-1123, never ISO. Everything here exists because a
// helper that assumed otherwise shipped, and "Thu, 14 Ma" reached the screen.

describe("formatDate", () => {
  it("reads pCloud's RFC-1123 datetimes", () => {
    expect(formatDate("Thu, 14 May 2026 09:12:00 +0000")).toBe("14 May 2026")
  })

  // The same string as toUTCString writes it — the mock's shape.
  it("reads the GMT spelling of the same format", () => {
    expect(formatDate("Thu, 14 May 2026 09:12:00 GMT")).toBe("14 May 2026")
  })

  it("does not slice ten characters off the front", () => {
    expect(formatDate("Thu, 14 May 2026 09:12:00 +0000")).not.toContain("Thu")
  })

  it("pads the day, so a column of dates lines up", () => {
    expect(formatDate("Fri, 01 Jan 2027 00:00:00 +0000")).toBe("01 Jan 2027")
  })

  it("is short enough to survive a narrow column", () => {
    expect(formatDate("Thu, 14 May 2026 09:12:00 +0000").length).toBe(11)
  })

  it("returns nothing rather than throwing on absent or unparseable input", () => {
    expect(formatDate(undefined)).toBe("")
    expect(formatDate("")).toBe("")
    expect(formatDate("not a date")).toBe("")
  })
})

describe("formatTimestamp", () => {
  it("drops the weekday and the offset, which every row shares", () => {
    expect(formatTimestamp("Thu, 30 Jul 2026 20:46:27 +0000")).toBe(
      "30 Jul 2026 20:46:27",
    )
  })

  it("marks an absent time rather than rendering an empty column", () => {
    expect(formatTimestamp(undefined)).toBe("-")
  })
})

describe("formatBytes", () => {
  it("scales to the largest unit that keeps the number small", () => {
    expect(formatBytes(2_048)).toBe("2 KB")
    expect(formatBytes(3_355_443)).toBe("3.2 MB")
  })

  it("names zero rather than dividing by it", () => {
    expect(formatBytes(0)).toBe("0 Bytes")
  })
})
