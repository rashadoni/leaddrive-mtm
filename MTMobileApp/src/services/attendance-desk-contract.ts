/** A desk's pairing QR: 256 random bits its browser made (leaddrive-v2 attendance-desk-screen.ts). No imports: the scanner reads it. */
export const validAttendanceDeskToken = (value: unknown): value is string => typeof value === "string" && /^mtmd1\.[A-Za-z0-9_-]{43}$/.test(value)

/**
 * The address a computer opens to become a workplace: the screen page of the
 * company's own server, the one this phone signed in to. Nothing when unknown.
 */
export function attendanceDeskScreenLink(serverDomain: string | null | undefined): string | null {
  const domain = (serverDomain ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "")
  if (!domain || /[\s/?#]/.test(domain)) return null
  const local = /^(localhost|127\.|10\.|192\.168\.)/.test(domain)
  return `${local ? "http" : "https"}://${domain}/screen`
}
