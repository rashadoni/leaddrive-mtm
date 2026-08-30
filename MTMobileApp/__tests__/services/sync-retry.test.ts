import { retryAfterMsFromError, retryAfterMsFromHeader, retryDelayMs } from "../../src/services/sync-retry"

describe("sync retry policy", () => {
  it("parses delta seconds and HTTP dates without accepting stale values", () => {
    expect(retryAfterMsFromHeader("5", 1_000)).toBe(5_000)
    expect(retryAfterMsFromHeader("Thu, 01 Jan 1970 00:00:06 GMT", 1_000)).toBe(5_000)
    expect(retryAfterMsFromHeader("Thu, 01 Jan 1970 00:00:00 GMT", 1_000)).toBeUndefined()
    expect(retryAfterMsFromHeader("invalid", 1_000)).toBeUndefined()
  })

  it("never retries before a server Retry-After and adds only positive jitter", () => {
    expect(retryDelayMs({ attempts: 1, retryAfterMs: 5_000, jitter: true, random: () => 0 })).toBe(5_000)
    expect(retryDelayMs({ attempts: 1, retryAfterMs: 5_000, jitter: true, random: () => 1 })).toBe(6_000)
  })

  it("uses the bounded legacy outbox exponential backoff when the server gave no hint", () => {
    expect(retryDelayMs({ attempts: 1 })).toBe(2_000)
    expect(retryDelayMs({ attempts: 2 })).toBe(4_000)
    expect(retryDelayMs({ attempts: 20 })).toBe(15 * 60_000)
  })

  it("only trusts a finite, non-negative retry hint from an API error", () => {
    expect(retryAfterMsFromError({ retryAfterMs: 4_000 })).toBe(4_000)
    expect(retryAfterMsFromError({ retryAfterMs: -1 })).toBeUndefined()
    expect(retryAfterMsFromError({ retryAfterMs: Number.NaN })).toBeUndefined()
  })
})
