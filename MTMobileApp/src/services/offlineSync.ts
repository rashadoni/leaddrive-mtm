import NetInfo from "@react-native-community/netinfo"
import { useSyncQueueStore } from "../store/syncQueue"

let _unsubscribe: (() => void) | null = null

export function startOfflineSync(): void {
  if (_unsubscribe) return
  _unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected && !state.isInternetReachable === false) {
      useSyncQueueStore.getState().processQueue()
    }
  })
}

export function stopOfflineSync(): void {
  _unsubscribe?.()
  _unsubscribe = null
}

export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch()
  return !!state.isConnected
}
