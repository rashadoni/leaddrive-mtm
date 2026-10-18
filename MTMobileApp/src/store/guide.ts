import { create } from "zustand"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { GUIDE_TOURS, guideStep, type GuideRect, type GuideTourId } from "../guide/tour"

/**
 * The first-run guide's state: who has seen which tour, the tour running now,
 * the focused route and where the controls it points at stand.
 *
 * Kept per signed-in person, as the bell's read marks are: one phone can be
 * signed in to by several people in turn, and each sees the guide once. Only
 * a sign-in arms it — someone who updates the app while signed in is not shown
 * a tour of an app he already uses; «Bələdçi» in «Daha çox» and the profile
 * opens it for anyone.
 */

const STORAGE_KEY = "@mtm_guide_v1"

export type GuideOutcome = "finished" | "skipped"

/** `pending`: armed by a sign-in and not finished or skipped since. */
export type GuideRecord = { pending?: boolean } & Partial<Record<GuideTourId, GuideOutcome>>

/** `step` -1 is the welcome card; the steps count from 0. */
export type GuideRun = { scope: string; tour: GuideTourId; step: number }

type SpotEntry = GuideRect & { owner: number }

interface GuideState {
  scope: string | null
  record: GuideRecord
  loaded: boolean
  /** The person a sign-in in this session armed, before storage has answered. */
  armedScope: string | null
  run: GuideRun | null
  route: string | null
  spots: Record<string, SpotEntry>
  load: (scope: string) => Promise<void>
  arm: (scope: string | null) => void
  start: (scope: string, tour: GuideTourId, options?: { welcome?: boolean }) => void
  next: () => void
  end: (outcome: GuideOutcome) => void
  stop: () => void
  setRoute: (name: string | null) => void
  reportSpot: (id: string, owner: number, rect: GuideRect) => void
  dropSpot: (id: string, owner: number) => void
}

function storageKey(scope: string): string {
  return `${STORAGE_KEY}:${scope}`
}

function parseRecord(raw: string | null | undefined): GuideRecord {
  if (!raw) return {}
  try {
    const value = JSON.parse(raw)
    if (!value || typeof value !== "object") return {}
    const record: GuideRecord = {}
    if (value.pending === true) record.pending = true
    for (const tour of Object.keys(GUIDE_TOURS) as GuideTourId[]) {
      if (value[tour] === "finished" || value[tour] === "skipped") record[tour] = value[tour]
    }
    return record
  } catch {
    return {}
  }
}

async function readRecord(scope: string): Promise<GuideRecord> {
  try {
    return parseRecord(await AsyncStorage.getItem(storageKey(scope)))
  } catch {
    return {}
  }
}

async function writeRecord(scope: string, record: GuideRecord): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(scope), JSON.stringify(record))
  } catch {
    // Not critical: the worst case is the guide offered once more.
  }
}

/** The record once a tour is finished or skipped: that tour answered, nothing armed any more. */
function settled(record: GuideRecord, tour: GuideTourId, outcome: GuideOutcome): GuideRecord {
  const next: GuideRecord = { ...record }
  next[tour] = outcome
  delete next.pending
  return next
}

export const useGuideStore = create<GuideState>((set, get) => ({
  scope: null,
  record: {},
  loaded: false,
  armedScope: null,
  run: null,
  route: null,
  spots: {},

  load: async (scope) => {
    if (get().scope !== scope) set({ scope, record: {}, loaded: false })
    const record = await readRecord(scope)
    if (get().scope !== scope) return
    // A sign-in that armed this person while storage was read keeps its mark.
    set((state) => ({ record: { ...record, ...(state.record.pending ? { pending: true } : {}) }, loaded: true }))
  },

  arm: (scope) => {
    if (!scope) return
    set((state) => ({
      armedScope: scope,
      record: state.scope === scope ? { ...state.record, pending: true } : state.record,
    }))
    void readRecord(scope).then((record) => writeRecord(scope, { ...record, pending: true }))
  },

  start: (scope, tour, options) => {
    set({ run: { scope, tour, step: options?.welcome ? -1 : 0 }, spots: {} })
  },

  next: () => {
    const run = get().run
    if (!run) return
    if (run.step + 1 >= GUIDE_TOURS[run.tour].length) {
      get().end("finished")
      return
    }
    set({ run: { ...run, step: run.step + 1 } })
  },

  end: (outcome) => {
    const { run, scope, record } = get()
    if (!run) return
    const next = settled(scope === run.scope ? record : {}, run.tour, outcome)
    set((state) => ({
      run: null,
      spots: {},
      armedScope: state.armedScope === run.scope ? null : state.armedScope,
      record: state.scope === run.scope ? next : state.record,
    }))
    void readRecord(run.scope).then((stored) => writeRecord(run.scope, settled(stored, run.tour, outcome)))
  },

  stop: () => {
    if (get().run) set({ run: null, spots: {} })
  },

  setRoute: (name) => {
    if (get().route !== name) set({ route: name })
  },

  reportSpot: (id, owner, rect) => {
    const known = get().spots[id]
    if (known && known.owner === owner && known.x === rect.x && known.y === rect.y
      && known.width === rect.width && known.height === rect.height) return
    set((state) => ({ spots: { ...state.spots, [id]: { ...rect, owner } } }))
  },

  dropSpot: (id, owner) => {
    if (get().spots[id]?.owner !== owner) return
    set((state) => {
      const spots = { ...state.spots }
      delete spots[id]
      return { spots }
    })
  },
}))

/** The spot the running step points at, or null between steps and on the welcome card. */
export function guideTargetSpot(state: Pick<GuideState, "run">): string | null {
  const run = state.run
  return run ? guideStep(run.tour, run.step)?.spot ?? null : null
}

/** Whether this person's tour should open by itself: armed by a sign-in, and never finished or skipped. */
export function guideDue(
  state: Pick<GuideState, "scope" | "loaded" | "record" | "armedScope" | "run">,
  scope: string | null,
  tour: GuideTourId | null,
): boolean {
  if (!scope || !tour || state.run || state.scope !== scope || !state.loaded) return false
  if (state.record[tour]) return false
  return state.record.pending === true || state.armedScope === scope
}

/** Called by every way in once the server says yes. */
export function armGuideAfterSignIn(scope: string | null): void {
  useGuideStore.getState().arm(scope)
}
