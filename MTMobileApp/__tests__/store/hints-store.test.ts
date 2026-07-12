/**
 * useHintsStore — dismissible hints persistence tests
 *
 * Coverage:
 *   - hydrate: empty storage → defaults (enabled, nothing dismissed)
 *   - hydrate: stored state restored; corrupted JSON falls back to defaults
 *   - dismiss: hides the hint, persists, no duplicates
 *   - setEnabled(false): hides everything, keeps dismissed list
 *   - setEnabled(true): re-enabling clears dismissed → all hints return
 *   - isVisible: false until hydrated (no flash of dismissed hints)
 */

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}))

import AsyncStorage from "@react-native-async-storage/async-storage"
import { useHintsStore } from "../../src/store/hints"

const mockGetItem = AsyncStorage.getItem as jest.Mock
const mockSetItem = AsyncStorage.setItem as jest.Mock

const reset = () =>
  useHintsStore.setState({ enabled: true, dismissed: [], hydrated: false })

beforeEach(() => {
  jest.clearAllMocks()
  reset()
})

describe("hydrate", () => {
  it("empty storage → defaults, hydrated", async () => {
    mockGetItem.mockResolvedValue(null)
    await useHintsStore.getState().hydrate()
    const s = useHintsStore.getState()
    expect(s.hydrated).toBe(true)
    expect(s.enabled).toBe(true)
    expect(s.dismissed).toEqual([])
  })

  it("restores stored enabled=false + dismissed list", async () => {
    mockGetItem.mockResolvedValue(JSON.stringify({ enabled: false, dismissed: ["a", "b"] }))
    await useHintsStore.getState().hydrate()
    const s = useHintsStore.getState()
    expect(s.enabled).toBe(false)
    expect(s.dismissed).toEqual(["a", "b"])
    expect(s.hydrated).toBe(true)
  })

  it("corrupted JSON → defaults instead of crash", async () => {
    mockGetItem.mockResolvedValue("{oops")
    await useHintsStore.getState().hydrate()
    const s = useHintsStore.getState()
    expect(s.hydrated).toBe(true)
    expect(s.enabled).toBe(true)
    expect(s.dismissed).toEqual([])
  })
})

describe("dismiss", () => {
  it("hides the hint and persists", () => {
    useHintsStore.setState({ hydrated: true })
    useHintsStore.getState().dismiss("route.pullRefresh")
    expect(useHintsStore.getState().isVisible("route.pullRefresh")).toBe(false)
    expect(mockSetItem).toHaveBeenCalledWith(
      "mtm.hints.v1",
      JSON.stringify({ enabled: true, dismissed: ["route.pullRefresh"] }),
    )
  })

  it("does not duplicate an already-dismissed id", () => {
    useHintsStore.setState({ hydrated: true })
    useHintsStore.getState().dismiss("x")
    useHintsStore.getState().dismiss("x")
    expect(useHintsStore.getState().dismissed).toEqual(["x"])
  })
})

describe("setEnabled", () => {
  it("off hides all hints but keeps the dismissed list", () => {
    useHintsStore.setState({ hydrated: true, dismissed: ["a"] })
    useHintsStore.getState().setEnabled(false)
    const s = useHintsStore.getState()
    expect(s.isVisible("b")).toBe(false)
    expect(s.dismissed).toEqual(["a"])
  })

  it("re-enabling clears dismissals so every hint returns", () => {
    useHintsStore.setState({ hydrated: true, enabled: false, dismissed: ["a", "b"] })
    useHintsStore.getState().setEnabled(true)
    const s = useHintsStore.getState()
    expect(s.dismissed).toEqual([])
    expect(s.isVisible("a")).toBe(true)
    expect(s.isVisible("b")).toBe(true)
  })
})

describe("isVisible", () => {
  it("false before hydration — dismissed hints must not flash on launch", () => {
    expect(useHintsStore.getState().isVisible("a")).toBe(false)
  })
})
