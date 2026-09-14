import {
  NOTES_ACTION_MIN_HEIGHT,
  NOTES_INPUT_MIN_HEIGHT,
  notesModalLayout,
} from "../../src/components/notes-modal-layout"

/**
 * The check-out note dialog on the devices it was measured on (2026-09-14).
 * On the Galaxy S23 held on its side the keyboard pushed «Təsdiq et» below the
 * screen; the dialog has to shrink there and nowhere else.
 */
describe("check-out note dialog fits the window", () => {
  it("puts field and buttons in one row on a phone on its side", () => {
    expect(notesModalLayout(823, 384)).toEqual({
      short: true,
      inline: true,
      inputMinHeight: NOTES_INPUT_MIN_HEIGHT.short,
    })
  })

  it("keeps the roomy stacked card on a phone upright and on the tablet", () => {
    const upright = { short: false, inline: false, inputMinHeight: NOTES_INPUT_MIN_HEIGHT.regular }
    expect(notesModalLayout(384, 823)).toEqual(upright)
    expect(notesModalLayout(686, 1097)).toEqual(upright)
    expect(notesModalLayout(1097, 686)).toEqual(upright)
  })

  it("stacks a short but narrow window instead of squeezing the field", () => {
    // Split screen: short like a phone on its side, narrow like one upright.
    expect(notesModalLayout(400, 384)).toEqual({
      short: true,
      inline: false,
      inputMinHeight: NOTES_INPUT_MIN_HEIGHT.short,
    })
  })

  it("keeps the field at least two lines and the buttons a full touch target", () => {
    expect(NOTES_INPUT_MIN_HEIGHT.short).toBeGreaterThanOrEqual(48)
    expect(NOTES_INPUT_MIN_HEIGHT.regular).toBeGreaterThan(NOTES_INPUT_MIN_HEIGHT.short)
    expect(NOTES_ACTION_MIN_HEIGHT).toBeGreaterThanOrEqual(48)
  })
})
