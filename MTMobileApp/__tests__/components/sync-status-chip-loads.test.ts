/**
 * Loads the sync centre component. That is the whole test, and it exists
 * because of a real crash that 647 green tests did not see.
 *
 * `StyleSheet.create` runs when the module is imported, not when a screen
 * renders. A style referencing an identifier nobody imported — here
 * `fieldTheme`, added with the offline notice (task T8) — is therefore a
 * ReferenceError at load: the chip does not merely look wrong, the module
 * fails and takes the screen with it. Jest stayed green because the suite
 * covered only the pure modules pulled out of this component
 * (`sync-chip-label`, `sync-centre-availability`, `sync-centre-pipelines`)
 * and never loaded the component itself. TypeScript caught it as TS2304 —
 * "cannot find name" is never just a type.
 *
 * Extracting logic into testable modules is right, and it left the file that
 * assembles them unexercised. One import closes that.
 */
describe("SyncStatusChip module", () => {
  it("loads, so its module-level styles actually evaluate", () => {
    const module = require("../../src/components/SyncStatusChip")
    expect(typeof (module.default ?? module.SyncStatusChip)).toBe("function")
  })
})
