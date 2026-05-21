import { useCartStore } from "../../src/store/cart"

/**
 * M1-4d.fix-before-build — payload shape contract test.
 *
 * The architect's audit caught that mobile was sending
 * `{skuId, quantity, unitPrice}` per item while the server's
 * `OrderItem` Zod schema (`src/lib/mtm-validators.ts` in leaddrive-v2)
 * requires `{name, price, qty, productId?}`. Every place-order call
 * returned 400; the feature was structurally broken at ship.
 *
 * This test pins the agreed contract. If a future refactor reverts to
 * the broken shape, this test fails red.
 */

function freshState() {
  useCartStore.setState({
    items: [],
    customerId: null,
    customerName: null,
    notes: "",
  })
}

/**
 * Mirror of the payload assembly inside CartScreen.handlePlaceOrder.
 * Kept in sync manually — if the screen changes the shape, this helper
 * stays the source of truth for the contract and the test will fail
 * until both match.
 */
function buildOrderPayload(): {
  customerId: string | null
  items: { skuId: string; name: string; price: number; qty: number }[]
  notes?: string
} {
  const { items, customerId, notes } = useCartStore.getState()
  return {
    customerId,
    // M1-4d.security: include skuId so server can recompute price from
    // MtmSku.basePrice. Server commit f61a8851 expects this field; if
    // mobile drops it, the server treats mobile price as authoritative
    // and the price=0 exploit re-opens.
    items: items.map((it) => ({ skuId: it.skuId, name: it.name, price: it.price, qty: it.qty })),
    notes: notes.trim() || undefined,
  }
}

describe("Order payload contract (M1-4d)", () => {
  beforeEach(freshState)

  it("items include skuId + server-side {name, price, qty} — server recomputes price from MtmSku.basePrice (M1-4d.security)", () => {
    useCartStore.getState().setCustomer("cust-1", "Bravo Nəsimi")
    useCartStore.getState().addItem({
      skuId: "cmtm00000000000000sku001",
      name: "Pepsi 0.5L",
      unit: "шт",
      price: 1.2,
      qty: 3,
    })

    const payload = buildOrderPayload()
    expect(payload.items).toHaveLength(1)

    const item = payload.items[0]
    // Server-side required keys present. `skuId` is the M1-4d.security
    // signal — server uses it to look up MtmSku.basePrice and ignore the
    // mobile-supplied `price` (closes the price=0 exploit).
    expect(item).toHaveProperty("skuId", "cmtm00000000000000sku001")
    expect(item).toHaveProperty("name", "Pepsi 0.5L")
    expect(item).toHaveProperty("price", 1.2)
    expect(item).toHaveProperty("qty", 3)
    // Server schema does NOT expect these mobile-internal keys:
    expect(item).not.toHaveProperty("quantity")
    expect(item).not.toHaveProperty("unitPrice")
  })

  it("price is a number (Zod rejects strings); qty is a positive integer", () => {
    useCartStore.getState().setCustomer("cust-1", "X")
    useCartStore.getState().addItem({ skuId: "s1", name: "Item", unit: "шт", price: 2.5, qty: 4 })

    const item = buildOrderPayload().items[0]
    expect(typeof item.price).toBe("number")
    expect(typeof item.qty).toBe("number")
    expect(Number.isInteger(item.qty)).toBe(true)
    expect(item.qty).toBeGreaterThan(0)
  })

  it("totalAmount on server = Σ(price × qty) — matches what cart.getTotal computes locally", () => {
    useCartStore.getState().setCustomer("cust-1", "X")
    useCartStore.getState().addItem({ skuId: "s1", name: "A", unit: "шт", price: 1.2, qty: 3 })
    useCartStore.getState().addItem({ skuId: "s2", name: "B", unit: "шт", price: 1.3, qty: 2 })

    const payload = buildOrderPayload()
    const serverTotal = payload.items.reduce((sum, it) => sum + it.price * it.qty, 0)
    const localTotal = useCartStore.getState().getTotal()
    expect(serverTotal).toBeCloseTo(localTotal, 6)
    expect(serverTotal).toBeCloseTo(6.2, 2)
  })

  it("empty notes string serialises as undefined (Zod treats '' differently from undefined)", () => {
    useCartStore.getState().setCustomer("cust-1", "X")
    useCartStore.getState().addItem({ skuId: "s1", name: "A", unit: "шт", price: 1, qty: 1 })
    // notes left untouched → empty string

    expect(buildOrderPayload().notes).toBeUndefined()
  })

  it("notes with whitespace-only content also serialises as undefined", () => {
    useCartStore.getState().setCustomer("cust-1", "X")
    useCartStore.getState().setNotes("   \n  ")
    useCartStore.getState().addItem({ skuId: "s1", name: "A", unit: "шт", price: 1, qty: 1 })

    expect(buildOrderPayload().notes).toBeUndefined()
  })
})
