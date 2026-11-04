/** A desk's pairing QR: 256 random bits its browser made (leaddrive-v2 attendance-desk-screen.ts). No imports: the scanner reads it. */
export const validAttendanceDeskToken = (value: unknown): value is string => typeof value === "string" && /^mtmd1\.[A-Za-z0-9_-]{43}$/.test(value)
