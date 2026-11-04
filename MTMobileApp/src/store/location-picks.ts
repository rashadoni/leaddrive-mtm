import { create } from "zustand"
import type { LocationFixPoint } from "../screens/base/organization-location-fix-model"

/**
 * The pin an agent has just put on the map for «Адрес и точка», handed from
 * the map screen back to the form that opened it. Per place, in memory only:
 * nothing is sent until the form is.
 */
interface LocationPicksState {
  picks: Record<string, LocationFixPoint>
  pick: (customerId: string, point: LocationFixPoint) => void
  clear: (customerId: string) => void
}

export const useLocationPickStore = create<LocationPicksState>((set) => ({
  picks: {},
  pick: (customerId, point) => set((state) => ({ picks: { ...state.picks, [customerId]: point } })),
  clear: (customerId) => set((state) => {
    if (!(customerId in state.picks)) return state
    const { [customerId]: _gone, ...rest } = state.picks
    return { picks: rest }
  }),
}))
