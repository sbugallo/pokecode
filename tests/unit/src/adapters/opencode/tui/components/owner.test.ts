import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import {
  createOwnerBoundCallback,
  createOwnerGuard,
} from "../../../../../../../src/adapters/opencode/tui/components/owner.js"

describe("TUI owner-bound callbacks", () => {
  test("does not run a deferred callback after its Solid owner is disposed", () => {
    // GIVEN
    const writes: string[] = []
    let resolveAfterCleanup!: (value: string) => void
    const dispose = createRoot((rootDispose) => {
      resolveAfterCleanup = createOwnerBoundCallback((value: string) => writes.push(value))
      return rootDispose
    })

    // WHEN
    dispose()
    resolveAfterCleanup("late sprite response")

    // THEN
    expect(writes).toEqual([])
  })

  test("marks the owner guard inactive on disposal", () => {
    // GIVEN
    let isOwned!: () => boolean
    const dispose = createRoot((rootDispose) => {
      isOwned = createOwnerGuard()
      return rootDispose
    })
    let disposed = false
    const disposeOnce = () => {
      if (disposed) return
      disposed = true
      dispose()
    }
    // WHEN
    try {
      expect(isOwned()).toBe(true)
      disposeOnce()
    } finally {
      disposeOnce()
    }

    // THEN
    expect(isOwned()).toBe(false)
  })
})
