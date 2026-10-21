import fs from "fs"
import path from "path"
import { toggledCustomer } from "../../src/screens/visit/customer-selection"

/**
 * «Визиты» → «Доступные клиенты» (owner, 2026-10-20): a tap marks the client
 * with the circle, a second tap on the same client takes the mark off.
 */
describe("choosing a client for an unplanned visit", () => {
  it("selects a client, lets a second tap clear it, and moves to another client in one tap", () => {
    let selected: string | null = null
    selected = toggledCustomer(selected, "clinic-a")
    expect(selected).toBe("clinic-a")
    selected = toggledCustomer(selected, "clinic-a")
    expect(selected).toBeNull()
    selected = toggledCustomer(toggledCustomer(selected, "clinic-a"), "clinic-b")
    expect(selected).toBe("clinic-b")
  })

  it("is what the screen's rows call, on the latest selection", () => {
    const screen = fs.readFileSync(path.resolve(__dirname, "../../src/screens/visit/VisitScreen.tsx"), "utf8")
    expect(screen).toContain("onSelectCustomer: (customer: Customer) => setSelectedCustomerId((current) => toggledCustomer(current, customer.id)),")
  })
})
