import {
  pollScanUntilTerminal,
  pollBackoffMs,
  POLL_MAX_ATTEMPTS,
  PROCESSING,
  type ScanBody,
} from "../../src/services/shelf-scan-poll"

const noSleep = (_ms: number) => Promise.resolve()

function processing(): ScanBody {
  return { success: true, data: { status: PROCESSING, analysisId: "an-1" } }
}
function completed(): ScanBody {
  return { success: true, data: { status: "COMPLETED", complianceScore: 80, detectedSkus: [] } }
}
function failed(): ScanBody {
  return { success: true, data: { status: "FAILED", errorMessage: "backstop_exhausted" } }
}

describe("pollBackoffMs", () => {
  it("ramps then caps at 5s", () => {
    expect(pollBackoffMs(0)).toBe(1500)
    expect(pollBackoffMs(1)).toBe(3000)
    expect(pollBackoffMs(2)).toBe(5000) // capped (would be 6000)
    expect(pollBackoffMs(10)).toBe(5000)
  })
  it("never returns a negative/NaN delay", () => {
    expect(pollBackoffMs(-1)).toBe(1500)
  })
})

describe("pollScanUntilTerminal", () => {
  it("resolves terminal=true with the data once status leaves 'processing' (COMPLETED)", async () => {
    const fetchStatus = jest
      .fn<Promise<ScanBody>, [string]>()
      .mockResolvedValueOnce(processing())
      .mockResolvedValueOnce(processing())
      .mockResolvedValueOnce(completed())
    const out = await pollScanUntilTerminal("an-1", fetchStatus, { sleep: noSleep })
    expect(out.terminal).toBe(true)
    expect(out.data).toMatchObject({ status: "COMPLETED", complianceScore: 80 })
    expect(fetchStatus).toHaveBeenCalledTimes(3)
    expect(fetchStatus).toHaveBeenCalledWith("an-1")
  })

  it("treats FAILED as terminal (the poll stops, the screen shows the failure)", async () => {
    const fetchStatus = jest.fn<Promise<ScanBody>, [string]>().mockResolvedValue(failed())
    const out = await pollScanUntilTerminal("an-1", fetchStatus, { sleep: noSleep })
    expect(out.terminal).toBe(true)
    expect((out.data as { status: string }).status).toBe("FAILED")
    expect(fetchStatus).toHaveBeenCalledTimes(1)
  })

  it("gives up (terminal=false) after the attempt budget if it never finishes", async () => {
    const fetchStatus = jest.fn<Promise<ScanBody>, [string]>().mockResolvedValue(processing())
    const out = await pollScanUntilTerminal("an-1", fetchStatus, { sleep: noSleep, maxAttempts: 4 })
    expect(out.terminal).toBe(false)
    expect(out.data).toBeNull()
    expect(fetchStatus).toHaveBeenCalledTimes(4)
  })

  it("swallows a transient fetch error and keeps polling (durable scan)", async () => {
    const fetchStatus = jest
      .fn<Promise<ScanBody>, [string]>()
      .mockRejectedValueOnce(new Error("REQUEST_TIMEOUT"))
      .mockResolvedValueOnce(completed())
    const out = await pollScanUntilTerminal("an-1", fetchStatus, { sleep: noSleep })
    expect(out.terminal).toBe(true)
    expect(fetchStatus).toHaveBeenCalledTimes(2)
  })

  it("stops early when shouldStop() flips (screen unmounted / newer scan)", async () => {
    let stop = false
    const fetchStatus = jest.fn<Promise<ScanBody>, [string]>().mockImplementation(async () => {
      stop = true // a newer scan started after the first poll
      return processing()
    })
    const out = await pollScanUntilTerminal("an-1", fetchStatus, { sleep: noSleep, shouldStop: () => stop })
    expect(out.terminal).toBe(false)
    // first iteration runs (stop checked before fetch is false), then bails before the 2nd fetch
    expect(fetchStatus).toHaveBeenCalledTimes(1)
  })

  it("default attempt budget is bounded (no infinite loop)", async () => {
    const fetchStatus = jest.fn<Promise<ScanBody>, [string]>().mockResolvedValue(processing())
    const out = await pollScanUntilTerminal("an-1", fetchStatus, { sleep: noSleep })
    expect(out.terminal).toBe(false)
    expect(fetchStatus).toHaveBeenCalledTimes(POLL_MAX_ATTEMPTS)
  })
})
