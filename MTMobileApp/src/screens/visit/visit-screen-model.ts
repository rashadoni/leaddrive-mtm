import { isTabletWidth } from "../../theme/layoutBreakpoints"

export type VisitScreenLanguage = "ru" | "az" | "en"
export type VisitScreenLayout = "phone" | "tablet"

export type VisitCustomerSearchItem = {
  id: string
  name: string
}

export function visitScreenLanguage(language: string): VisitScreenLanguage {
  if (language.toLowerCase().startsWith("az")) return "az"
  if (language.toLowerCase().startsWith("en")) return "en"
  return "ru"
}

export function visitScreenLayout(width: number): VisitScreenLayout {
  return isTabletWidth(width) ? "tablet" : "phone"
}

export function filterVisitCustomers<T extends VisitCustomerSearchItem>(
  customers: T[],
  query: string,
  limit = 20,
): T[] {
  const normalized = query.trim().toLocaleLowerCase()
  const filtered = normalized
    ? customers.filter((customer) => customer.name.toLocaleLowerCase().includes(normalized))
    : customers
  return filtered.slice(0, Math.max(0, limit))
}
