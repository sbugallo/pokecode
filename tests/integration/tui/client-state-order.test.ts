import { describe, expect, test } from "bun:test"
import { createPokemonTuiClient } from "../../../src/adapters/opencode/tui/client.js"
import { createTuiStateCoordinator } from "../../../src/adapters/opencode/tui/state/coordinator.js"
import { makeTuiRpcTransport, makeTuiState } from "../../support/tui.js"

describe("TUI state response and event collaboration", () => {
  test.each([
    { name: "the RPC response arrives before its cloned status event", first: "response" as const },
    { name: "the cloned status event arrives before the RPC response", first: "event" as const },
  ])("deduplicates notifications when $name", async ({ first }) => {
    // GIVEN
    const initial = makeTuiState()
    const updated = makeTuiState({
      location: "kanto-route-1",
      pendingChoices: [{ id: "00000000-0000-4000-8000-000000000011", kind: "move", payload: "{}" }],
    })
    let emit: ((event: { readonly data: unknown }) => void) | undefined
    const transport = makeTuiRpcTransport({
      travelTo: async () => ({ kind: "teleported", state: structuredClone(updated) }),
      events: {
        on: (_event, listener) => {
          emit = listener
          return () => {
            emit = undefined
          }
        },
      },
    })
    const notifications: string[] = []
    const coordinator = createTuiStateCoordinator(initial, (notification) =>
      notifications.push(notification.message),
    )
    const client = createPokemonTuiClient(transport)
    const unsubscribe = client.onStatusChanged(coordinator.apply)

    // WHEN
    try {
      if (first === "response") {
        const response = await client.travelTo({ locationId: "kanto-route-1" })
        coordinator.apply(response.state)
        emit?.({ data: structuredClone(updated) })
      } else {
        emit?.({ data: structuredClone(updated) })
        const response = await client.travelTo({ locationId: "kanto-route-1" })
        coordinator.apply(response.state)
      }

      // THEN
      expect(coordinator.state()).toEqual(updated)
      expect(notifications).toEqual(["A new move choice is available.", "Arrived at Route 1."])
    } finally {
      unsubscribe()
    }
  })
})
