import { buildSentryConfig } from "../../src/services/sentry-config"

describe("buildSentryConfig (M1-3)", () => {
  const valid = {
    dsn: "https://abc@sentry.io/123",
    environment: "production",
    release: "MTMobileApp@1.2.0",
  }

  it("returns null when DSN is missing (skip init on dev)", () => {
    expect(buildSentryConfig({ ...valid, dsn: null })).toBeNull()
    expect(buildSentryConfig({ ...valid, dsn: undefined })).toBeNull()
    expect(buildSentryConfig({ ...valid, dsn: "" })).toBeNull()
    expect(buildSentryConfig({ ...valid, dsn: "   " })).toBeNull()
  })

  it("returns config with correct shape when DSN present", () => {
    const cfg = buildSentryConfig(valid)
    expect(cfg).not.toBeNull()
    expect(cfg!.dsn).toBe(valid.dsn)
    expect(cfg!.environment).toBe("production")
    expect(cfg!.release).toBe("MTMobileApp@1.2.0")
    expect(cfg!.sendDefaultPii).toBe(false)
    expect(cfg!.sampleRate).toBe(1.0)
  })

  it("production tracesSampleRate = 0.1 (high-volume rollout)", () => {
    const cfg = buildSentryConfig({ ...valid, environment: "production" })
    expect(cfg!.tracesSampleRate).toBe(0.1)
  })

  it("staging tracesSampleRate = 0.5 (pilot bursting)", () => {
    const cfg = buildSentryConfig({ ...valid, environment: "staging" })
    expect(cfg!.tracesSampleRate).toBe(0.5)
  })

  it("development tracesSampleRate = 1.0 (sample everything in dev)", () => {
    const cfg = buildSentryConfig({ ...valid, environment: "development" })
    expect(cfg!.tracesSampleRate).toBe(1.0)
  })

  it("unknown environment defaults to staging-like 0.5", () => {
    const cfg = buildSentryConfig({ ...valid, environment: "qa" })
    expect(cfg!.tracesSampleRate).toBe(0.5)
  })

  it("attaches agentId as user.id when provided", () => {
    const cfg = buildSentryConfig({ ...valid, agentId: "agent-123" })
    expect(cfg!.initialScope?.user?.id).toBe("agent-123")
  })

  it("attaches organizationId as a tag when provided", () => {
    const cfg = buildSentryConfig({ ...valid, organizationId: "org-mars" })
    expect(cfg!.initialScope?.tags?.organization_id).toBe("org-mars")
  })

  it("attaches BOTH agentId + organizationId together", () => {
    const cfg = buildSentryConfig({
      ...valid,
      agentId: "agent-123",
      organizationId: "org-mars",
    })
    expect(cfg!.initialScope?.user?.id).toBe("agent-123")
    expect(cfg!.initialScope?.tags?.organization_id).toBe("org-mars")
  })

  it("no initialScope when neither agentId nor organizationId present", () => {
    const cfg = buildSentryConfig(valid)
    expect(cfg!.initialScope).toBeUndefined()
  })

  it("sendDefaultPii is HARD-CODED false (privacy: never auto-attach IP / headers)", () => {
    const cfg = buildSentryConfig(valid)
    expect(cfg!.sendDefaultPii).toBe(false)
  })

  it("trims whitespace around DSN before checking emptiness", () => {
    const cfg = buildSentryConfig({ ...valid, dsn: "  https://x@sentry.io/1  " })
    expect(cfg).not.toBeNull()
    expect(cfg!.dsn).toBe("https://x@sentry.io/1")
  })
})
