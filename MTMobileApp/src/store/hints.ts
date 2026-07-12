import { create } from "zustand"
import AsyncStorage from "@react-native-async-storage/async-storage"

/**
 * Dismissible UI hints ("подсказки").
 *
 * Each hint has a stable string id. The agent can dismiss any hint with ✕;
 * dismissals persist across app restarts. The Profile screen has a master
 * switch: turning hints OFF hides all of them, turning hints back ON also
 * clears previous dismissals so every hint returns.
 */
const STORAGE_KEY = "mtm.hints.v1"

interface HintsState {
  enabled: boolean
  dismissed: string[]
  hydrated: boolean
  hydrate: () => Promise<void>
  dismiss: (id: string) => void
  setEnabled: (on: boolean) => void
  isVisible: (id: string) => boolean
}

async function save(enabled: boolean, dismissed: string[]) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled, dismissed }))
  } catch {
    // non-critical — hints just reappear on next launch
  }
}

export const useHintsStore = create<HintsState>((set, get) => ({
  enabled: true,
  dismissed: [],
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        set({
          enabled: parsed.enabled !== false,
          dismissed: Array.isArray(parsed.dismissed) ? parsed.dismissed : [],
          hydrated: true,
        })
        return
      }
    } catch {
      // corrupted storage — fall through to defaults
    }
    set({ hydrated: true })
  },

  dismiss: (id: string) => {
    const { enabled, dismissed } = get()
    if (dismissed.includes(id)) return
    const next = [...dismissed, id]
    set({ dismissed: next })
    void save(enabled, next)
  },

  setEnabled: (on: boolean) => {
    // Re-enabling brings every dismissed hint back — that's the "вернуть".
    const dismissed = on ? [] : get().dismissed
    set({ enabled: on, dismissed })
    void save(on, dismissed)
  },

  isVisible: (id: string) => {
    const { enabled, dismissed, hydrated } = get()
    return hydrated && enabled && !dismissed.includes(id)
  },
}))
