import { describe, expect, test } from "bun:test"
import { createTuiCleanup } from "../../../../../../../src/adapters/opencode/tui/state/cleanup.js"
import { createTuiStateCoordinator } from "../../../../../../../src/adapters/opencode/tui/state/coordinator.js"
import { makeTuiState } from "../../../../../../support/tui.js"

describe("TUI resource cleanup", () => {
  test("invalidates state before teardown and waits for asynchronous disposal", async () => {
    // GIVEN
    const state = createTuiStateCoordinator(makeTuiState(), () => {})
    const next = makeTuiState({ location: "kanto-route-1" })
    const calls: string[] = []
    let finishClipboard!: () => void
    const clipboardDisposal = new Promise<void>((resolve) => {
      finishClipboard = resolve
    })
    const cleanup = createTuiCleanup({
      state,
      unsubscribe: () => {
        calls.push("unsubscribe")
        expect(state.isDisposed()).toBe(true)
      },
      unregisterSlot: () => calls.push("slot"),
      disposeClipboard: () => {
        calls.push("clipboard")
        return clipboardDisposal
      },
    })

    // WHEN
    const completion = cleanup()
    try {
      state.apply(next)
      finishClipboard()
      await completion

      // THEN
      expect(state.state().location).toBe("pallet-town")
      expect(calls).toEqual(["unsubscribe", "slot", "clipboard"])
    } finally {
      finishClipboard()
      await completion
    }
  })

  test("attempts every disposer once, memoizes cleanup, and aggregates failures", async () => {
    // GIVEN
    const state = createTuiStateCoordinator(makeTuiState(), () => {})
    const calls: string[] = []
    const errors = [
      new Error("event unsubscribe failed"),
      new Error("slot removal failed"),
      new Error("clipboard disposal failed"),
    ]
    const cleanup = createTuiCleanup({
      state,
      unsubscribe: () => {
        calls.push("unsubscribe")
        throw errors[0]
      },
      unregisterSlot: () => {
        calls.push("slot")
        throw errors[1]
      },
      disposeClipboard: async () => {
        calls.push("clipboard")
        throw errors[2]
      },
    })

    // WHEN
    const first = cleanup()
    const second = cleanup()

    // THEN
    expect(second).toBe(first)
    expect(state.isDisposed()).toBe(true)
    await expect(first).rejects.toMatchObject({ errors })
    await expect(cleanup()).rejects.toMatchObject({ errors })
    expect(calls).toEqual(["unsubscribe", "slot", "clipboard"])
  })

  test("preserves a single disposer error without wrapping it", async () => {
    // GIVEN
    const state = createTuiStateCoordinator(makeTuiState(), () => {})
    const error = new Error("slot removal failed")
    const cleanup = createTuiCleanup({
      state,
      unregisterSlot: () => {
        throw error
      },
    })

    // WHEN
    const completion = cleanup()

    // THEN
    await expect(completion).rejects.toBe(error)
  })
})
