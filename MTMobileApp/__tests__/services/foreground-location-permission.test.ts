import { createForegroundLocationPermission } from "../../src/services/foreground-location-permission"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function setup() {
  const check = jest.fn(async () => false)
  const request = jest.fn(async () => false)
  const permission = createForegroundLocationPermission({ check, request })
  permission.setScope("fictional-server:tenant:field-a")
  return { permission, check, request }
}

it("latches before opening the sheet and ignores overlapping foreground re-entry", async () => {
  const { permission, request } = setup()
  const sheet = deferred<boolean>(); request.mockReturnValue(sheet.promise)
  const first = permission.ensure(() => true)
  await Promise.resolve()
  expect(request).toHaveBeenCalledTimes(1)
  expect(await permission.ensure(() => true)).toBe(false)
  sheet.resolve(false); expect(await first).toBe(false)
  for (let i = 0; i < 20; i++) expect(await permission.ensure(() => true)).toBe(false)
  expect(request).toHaveBeenCalledTimes(1)
})

it("retains denial on repeated scope updates and permits a later manual grant", async () => {
  const { permission, check, request } = setup()
  expect(await permission.ensure(() => true)).toBe(false)
  permission.setScope("fictional-server:tenant:field-a")
  expect(await permission.ensure(() => true)).toBe(false)
  check.mockResolvedValue(true)
  expect(await permission.ensure(() => true)).toBe(true)
  expect(request).toHaveBeenCalledTimes(1)
})

it("never requests an already granted permission", async () => {
  const { permission, check, request } = setup(); check.mockResolvedValue(true)
  expect(await permission.ensure(() => true)).toBe(true)
  expect(request).not.toHaveBeenCalled()
})

it("fences a changed account while the check is pending", async () => {
  const { permission, check, request } = setup()
  const pending = deferred<boolean>(); check.mockReturnValueOnce(pending.promise)
  const first = permission.ensure(() => true)
  permission.setScope("fictional-server:other-tenant:field-b")
  pending.resolve(false)
  expect(await first).toBe(false); expect(request).not.toHaveBeenCalled()
  expect(await permission.ensure(() => true)).toBe(false)
  expect(request).toHaveBeenCalledTimes(1)
})

it("does not overlap an old account's sheet or accept its late answer", async () => {
  const { permission, request } = setup()
  const sheet = deferred<boolean>(); request.mockReturnValueOnce(sheet.promise)
  const first = permission.ensure(() => true); await Promise.resolve()
  permission.setScope("other-server:tenant:field-a")
  expect(await permission.ensure(() => true)).toBe(false)
  expect(request).toHaveBeenCalledTimes(1)
  sheet.resolve(true); expect(await first).toBe(false)
  expect(await permission.ensure(() => true)).toBe(false)
  expect(request).toHaveBeenCalledTimes(2)
})

it("rejects an old generation even if the same principal signs back in", async () => {
  const { permission, check, request } = setup()
  const pending = deferred<boolean>(); check.mockReturnValueOnce(pending.promise)
  const first = permission.ensure(() => true)
  permission.setScope(null); permission.setScope("fictional-server:tenant:field-a")
  pending.resolve(true)
  expect(await first).toBe(false); expect(request).not.toHaveBeenCalled()
})

it("neither requests nor accepts a grant after background/workday cancellation", async () => {
  const { permission, check, request } = setup()
  const pending = deferred<boolean>(); check.mockReturnValueOnce(pending.promise)
  let active = true
  const first = permission.ensure(() => active)
  active = false; pending.resolve(true)
  expect(await first).toBe(false); expect(request).not.toHaveBeenCalled()
})

it("rejects a granted answer if the original effect was cancelled", async () => {
  const { permission, request } = setup()
  const sheet = deferred<boolean>(); request.mockReturnValueOnce(sheet.promise)
  let current = true
  const first = permission.ensure(() => current); await Promise.resolve()
  current = false; sheet.resolve(true)
  expect(await first).toBe(false)
  expect(await permission.ensure(() => true)).toBe(false)
  expect(request).toHaveBeenCalledTimes(1)
})

it("retains the attempt if Android rejects the request promise", async () => {
  const { permission, request } = setup(); request.mockRejectedValue(new Error("fictional native refusal"))
  expect(await permission.ensure(() => true)).toBe(false)
  expect(await permission.ensure(() => true)).toBe(false)
  expect(request).toHaveBeenCalledTimes(1)
})

it("does not request when checking grants fails or no principal is admitted", async () => {
  const { permission, check, request } = setup(); check.mockRejectedValue(new Error("fictional unavailable check"))
  expect(await permission.ensure(() => true)).toBe(false)
  permission.setScope(null); check.mockResolvedValue(true)
  expect(await permission.ensure(() => true)).toBe(false)
  expect(request).not.toHaveBeenCalled()
})
