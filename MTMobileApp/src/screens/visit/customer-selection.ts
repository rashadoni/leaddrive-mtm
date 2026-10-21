/**
 * The client an unplanned visit is about to start with. A second tap on the
 * chosen client lets it go (owner, 2026-10-20: «когда нажимаю, выбирается с
 * кружком, но при повторном нажатии не убирается»).
 */
export function toggledCustomer(current: string | null, tapped: string): string | null {
  return current === tapped ? null : tapped
}
