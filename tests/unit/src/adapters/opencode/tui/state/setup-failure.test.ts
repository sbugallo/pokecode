import { describe, expect, test } from "bun:test"
import { cleanupAfterSetupFailure } from "../../../../../../../src/adapters/opencode/tui/state/setup-failure.js"

describe("TUI setup failure cleanup", () => {
  test("preserves the setup error when cleanup succeeds", async () => {
    // GIVEN
    const setupError = new Error("initial status failed")

    // WHEN
    const completion = cleanupAfterSetupFailure(async () => {}, setupError)

    // THEN
    await expect(completion).rejects.toBe(setupError)
  })

  test("retains setup and cleanup errors when both fail", async () => {
    // GIVEN
    const setupError = new Error("initial status failed")
    const cleanupError = new AggregateError([
      new Error("unsubscribe failed"),
      new Error("clipboard disposal failed"),
    ])

    // WHEN
    const completion = cleanupAfterSetupFailure(async () => {
      throw cleanupError
    }, setupError)

    // THEN
    await expect(completion).rejects.toMatchObject({
      errors: [setupError, cleanupError],
      cause: setupError,
    })
  })
})
