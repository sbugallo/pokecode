import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import { checkArchitecture } from "../../support/architecture/import-boundary-checker.js"

describe("runtime dependency graphs", () => {
  test("keeps the current domain, application, server, TUI, and RPC graphs within their boundaries", () => {
    // GIVEN
    const sourceRoot = resolve(import.meta.dir, "../../../src")

    // WHEN
    const violations = checkArchitecture(sourceRoot)

    // THEN
    expect(violations).toEqual([])
  })
})
