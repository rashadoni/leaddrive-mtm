import { create } from "zustand"

export interface CartItem {
  skuId: string
  name: string
  unit: string
  price: number   // unit price in AZN
  qty: number
  thumbnailUrl?: string | null
}

interface CartState {
  items: CartItem[]
  customerId: string | null
  customerName: string | null
  notes: string

  // Computed helpers (not reactive — call after mutations)
  getTotal: () => number
  getItemCount: () => number

  // Actions
  setCustomer: (id: string, name: string) => void
  setNotes: (notes: string) => void
  addItem: (item: Omit<CartItem, "qty"> & { qty?: number }) => void
  removeItem: (skuId: string) => void
  setQty: (skuId: string, qty: number) => void
  /**
   * Reset cart contents (items + notes) but PRESERVE the
   * customerId/customerName binding so the agent can submit a second
   * order at the same visit without re-checking in. The check-out
   * lifecycle (VisitScreen check-out success) is the only path that
   * should wipe the customer binding via `resetCart()`.
   */
  clearCart: () => void
  /**
   * Fully reset every field — called when the visit ends (check-out)
   * or when switching between checked-in customers.
   */
  resetCart: () => void
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  customerId: null,
  customerName: null,
  notes: "",

  getTotal: () =>
    get().items.reduce((sum, it) => sum + it.price * it.qty, 0),

  getItemCount: () =>
    get().items.reduce((sum, it) => sum + it.qty, 0),

  setCustomer: (id, name) => set({ customerId: id, customerName: name }),

  setNotes: (notes) => set({ notes }),

  addItem: (item) => {
    set((state) => {
      const existing = state.items.find((i) => i.skuId === item.skuId)
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.skuId === item.skuId ? { ...i, qty: i.qty + (item.qty ?? 1) } : i
          ),
        }
      }
      return {
        items: [...state.items, { ...item, qty: item.qty ?? 1 }],
      }
    })
  },

  removeItem: (skuId) =>
    set((state) => ({ items: state.items.filter((i) => i.skuId !== skuId) })),

  setQty: (skuId, qty) => {
    if (qty <= 0) {
      get().removeItem(skuId)
      return
    }
    set((state) => ({
      items: state.items.map((i) => (i.skuId === skuId ? { ...i, qty } : i)),
    }))
  },

  // Preserve customer binding across `clearCart` — see the JSDoc on the
  // interface for the lifecycle reasoning. End-of-visit cleanup uses
  // `resetCart()` instead.
  clearCart: () => set({ items: [], notes: "" }),

  resetCart: () => set({ items: [], notes: "", customerId: null, customerName: null }),
}))
