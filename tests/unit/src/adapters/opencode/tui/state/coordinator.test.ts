import { describe, expect, test } from "bun:test"
import { createTuiStateCoordinator } from "../../../../../../../src/adapters/opencode/tui/state/coordinator.js"
import { makeTuiState } from "../../../../../../support/tui.js"

describe("TUI state coordinator", () => {
  test("updates state before notifying listeners and ignores unchanged snapshots", () => {
    // GIVEN
    const initial = makeTuiState()
    const next = makeTuiState({ location: "kanto-route-1" })
    let coordinator!: ReturnType<typeof createTuiStateCoordinator>
    const observations: Array<{ message: string; location: string | null }> = []
    coordinator = createTuiStateCoordinator(initial, (notification) => {
      observations.push({ message: notification.message, location: coordinator.state().location })
    })
    const previous = coordinator.state()

    // WHEN
    coordinator.apply(next)
    coordinator.apply(next)

    // THEN
    expect(observations).toEqual([{ message: "Arrived at Route 1.", location: "kanto-route-1" }])
    expect(coordinator.state()).toEqual(next)
    expect(previous.location).toBe("pallet-town")
  })

  test("initializes without emitting notifications and ignores changes after disposal", () => {
    // GIVEN
    const initial = makeTuiState({ phase: "onboarding", region: null, location: null })
    const ready = makeTuiState()
    const later = makeTuiState({ location: "kanto-route-1" })
    const notifications: string[] = []
    const coordinator = createTuiStateCoordinator(initial, (notification) => {
      notifications.push(notification.message)
    })

    // WHEN
    coordinator.initialize(ready)
    const initialized = coordinator.state()
    coordinator.dispose()
    coordinator.apply(later)
    coordinator.initialize(later)

    // THEN
    expect(coordinator.isDisposed()).toBe(true)
    expect(coordinator.state()).toBe(initialized)
    expect(notifications).toEqual([])
  })
})
