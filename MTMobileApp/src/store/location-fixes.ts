import { create } from "zustand"
import AsyncStorage from "@react-native-async-storage/async-storage"
import {
  readWaitingLocationFixes,
  waitingLocationFixOf,
  type LocationFixPoint,
  type WaitingLocationFix,
} from "../screens/base/organization-location-fix-model"
import { useAuthStore } from "./auth"

/**
 * «Клиент здесь»: the places this phone knows to be waiting for a manager —
 * one per customer, for the agent who reported it. A check-in is measured
 * against such a place when the agent stands there, so that the app does not
 * stop him with «слишком далеко» or «нет координат» before the server — which
 * lets him in, and marks the visit «адрес на проверке» — is ever asked.
 *
 * Kept across restarts: a request may wait until tomorrow. Each entry carries
 * the agent it belongs to, so a second agent signing in on the same phone
 * inherits nothing. The rules are in organization-location-fix-model.ts.
 */
const STORAGE_KEY = "mtm.locationFixes.v1"

interface LocationFixesState {
  fixes: Record<string, WaitingLocationFix>
  hydrated: boolean
  hydrate: () => Promise<void>
  /** The signed-in agent's request about this customer went out, or is known to be waiting. */
  remember: (customerId: string, place: LocationFixPoint) => void
  /** Answered, withdrawn, or refused by the server: it waits no longer. */
  forget: (customerId: string) => void
}

async function save(fixes: Record<string, WaitingLocationFix>) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(fixes))
  } catch {
    // Non-critical: the customer's card says «на проверке» again the next time it is opened.
  }
}

export const useLocationFixStore = create<LocationFixesState>((set, get) => ({
  fixes: {},
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY)
      if (raw) {
        // What was remembered while the storage was being read is newer than what is in it.
        set({ fixes: { ...readWaitingLocationFixes(JSON.parse(raw), Date.now()), ...get().fixes }, hydrated: true })
        return
      }
    } catch {
      // Corrupted storage: nothing is remembered.
    }
    set({ hydrated: true })
  },

  remember: (customerId, place) => {
    const agentId = useAuthStore.getState().agent?.id
    if (!agentId || !customerId) return
    const fixes = { ...get().fixes, [customerId]: { latitude: place.latitude, longitude: place.longitude, agentId, savedAt: Date.now() } }
    set({ fixes })
    void save(fixes)
  },

  forget: (customerId) => {
    if (!(customerId in get().fixes)) return
    const fixes = { ...get().fixes }
    delete fixes[customerId]
    set({ fixes })
    void save(fixes)
  },
}))

/** The place the signed-in agent reported for this customer, while his request is thought to be waiting. */
export function waitingLocationFixFor(customerId: string): LocationFixPoint | null {
  return waitingLocationFixOf(useLocationFixStore.getState().fixes, useAuthStore.getState().agent?.id, customerId, Date.now())
}
