import { useCartStore } from "../../src/store/cart"

/**
 * M1-4d.fix-before-build — pure Zustand store tests for the cart.
 *
 * Locks the cart-lifecycle contract that VisitScreen + SkuCatalogScreen +
 * CartScreen rely on:
 *   - check-in success calls setCustomer; cart binds to that customer
 *   - clearCart resets items+notes BUT preserves customer binding
 *   - resetCart wipes everything (called on check-out)
 *   - setQty(0) and setQty(negative) remove the item
 *   - addItem merges qty when the same skuId is added twice
 */

const SKU_A = { skuId: "sku-a", name: "Pepsi 0.5L", unit: "шт", price: 1.2 }
const SKU_B = { skuId: "sku-b", name: "Mirinda 0.5L", unit: "шт", price: 1.3 }

function freshState() {
  // Zustand store is a module-level singleton; reset between tests so
  // state doesn't leak across cases.
  useCartStore.setState({
    items: [],
    customerId: null,
    customerName: null,
    notes: "",
  })
}

describe("useCartStore — items", () => {
  beforeEach(freshState)

  it("addItem with new sku adds a row with qty=1 by default", () => {
    useCartStore.getState().addItem(SKU_A)
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ skuId: "sku-a", qty: 1 })
  })

  it("addItem respects explicit qty argument", () => {
    useCartStore.getState().addItem({ ...SKU_A, qty: 5 })
    expect(useCartStore.getState().items[0].qty).toBe(5)
  })

  it("addItem merges qty when the same skuId is added twice", () => {
    useCartStore.getState().addItem(SKU_A)
    useCartStore.getState().addItem({ ...SKU_A, qty: 2 })
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0].qty).toBe(3)
  })

  it("setQty(>0) updates the qty in place", () => {
    useCartStore.getState().addItem(SKU_A)
    useCartStore.getState().setQty("sku-a", 7)
    expect(useCartStore.getState().items[0].qty).toBe(7)
  })

  it("setQty(0) removes the item", () => {
    useCartStore.getState().addItem(SKU_A)
    useCartStore.getState().setQty("sku-a", 0)
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it("setQty(negative) also removes the item (guard against negative qty)", () => {
    useCartStore.getState().addItem(SKU_A)
    useCartStore.getState().setQty("sku-a", -3)
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it("removeItem filters by skuId", () => {
    useCartStore.getState().addItem(SKU_A)
    useCartStore.getState().addItem(SKU_B)
    useCartStore.getState().removeItem("sku-a")
    const { items } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0].skuId).toBe("sku-b")
  })
})

describe("useCartStore — totals & counts", () => {
  beforeEach(freshState)

  it("getTotal sums price × qty across all items (decimal-safe)", () => {
    useCartStore.getState().addItem({ ...SKU_A, qty: 3 }) // 1.2 * 3 = 3.6
    useCartStore.getState().addItem({ ...SKU_B, qty: 2 }) // 1.3 * 2 = 2.6
    // 3.6 + 2.6 = 6.2 ± floating-point dust
    expect(useCartStore.getState().getTotal()).toBeCloseTo(6.2, 2)
  })

  it("getTotal returns 0 on empty cart", () => {
    expect(useCartStore.getState().getTotal()).toBe(0)
  })

  it("getItemCount sums qty across all items", () => {
    useCartStore.getState().addItem({ ...SKU_A, qty: 3 })
    useCartStore.getState().addItem({ ...SKU_B, qty: 2 })
    expect(useCartStore.getState().getItemCount()).toBe(5)
  })
})

describe("useCartStore — customer binding lifecycle (M1-4d fix)", () => {
  beforeEach(freshState)

  it("setCustomer sets both id and name", () => {
    useCartStore.getState().setCustomer("cust-1", "Bravo Nəsimi")
    const { customerId, customerName } = useCartStore.getState()
    expect(customerId).toBe("cust-1")
    expect(customerName).toBe("Bravo Nəsimi")
  })

  it("clearCart resets items + notes BUT preserves customer binding", () => {
    // Simulates: check-in → setCustomer → add items → place order → clearCart.
    // Agent should be able to stack a second order at the same visit
    // without re-checking in.
    useCartStore.getState().setCustomer("cust-1", "Bravo Nəsimi")
    useCartStore.getState().addItem(SKU_A)
    useCartStore.getState().setNotes("Wholesale order")
    useCartStore.getState().clearCart()
    const { items, notes, customerId, customerName } = useCartStore.getState()
    expect(items).toHaveLength(0)
    expect(notes).toBe("")
    expect(customerId).toBe("cust-1")
    expect(customerName).toBe("Bravo Nəsimi")
  })

  it("resetCart wipes everything including customer (check-out lifecycle)", () => {
    useCartStore.getState().setCustomer("cust-1", "Bravo Nəsimi")
    useCartStore.getState().addItem(SKU_A)
    useCartStore.getState().setNotes("Special instructions")
    useCartStore.getState().resetCart()
    const { items, notes, customerId, customerName } = useCartStore.getState()
    expect(items).toHaveLength(0)
    expect(notes).toBe("")
    expect(customerId).toBeNull()
    expect(customerName).toBeNull()
  })

  it("setCustomer overwrites previous binding (e.g. multi-visit shift)", () => {
    useCartStore.getState().setCustomer("cust-1", "Bravo Nəsimi")
    useCartStore.getState().setCustomer("cust-2", "Bizim Tarla Xətai")
    const { customerId, customerName } = useCartStore.getState()
    expect(customerId).toBe("cust-2")
    expect(customerName).toBe("Bizim Tarla Xətai")
  })
})
