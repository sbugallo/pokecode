import { describe, expect, test } from "bun:test"
import { createSidebarActions } from "../../../src/adapters/opencode/tui/sidebar/actions.js"
import { createTuiStateCoordinator } from "../../../src/adapters/opencode/tui/state/coordinator.js"
import { pokemonInstanceSchema } from "../../../src/domain/pokemon/model.js"
import { speciesIdSchema } from "../../../src/domain/shared/identifiers.js"
import { deferred, makeTuiClient, makeTuiState } from "../../support/tui.js"

describe("sidebar actions", () => {
  test("publishes the state change before the catch result toast", async () => {
    // GIVEN
    const encounter = {
      id: "00000000-0000-4000-8000-000000000001",
      kind: "ordinary" as const,
      speciesId: speciesIdSchema.parse("pidgey"),
      name: "Pidgey",
      level: 2,
      gender: "female" as const,
      shiny: false,
      spriteUrl: "https://example.test/pidgey.png",
    }
    const initial = makeTuiState({ pendingEncounter: encounter })
    const notifications: string[] = []
    const coordinator = createTuiStateCoordinator(initial, (notification) =>
      notifications.push(notification.message),
    )
    const caughtPokemon = pokemonInstanceSchema.parse({
      id: "00000000-0000-4000-8000-000000000003",
      speciesId: "bulbasaur",
      name: "Bulbasaur",
      level: 5,
      experience: 0,
      ability: "Overgrow",
      nature: "Hardy",
      shiny: false,
      ivs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
      evs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
      moves: [],
    })
    const next = makeTuiState({
      location: "kanto-route-1",
      pendingEncounter: encounter,
      party: [
        { position: 1, pokemon: caughtPokemon },
        ...[2, 3, 4, 5, 6].map((position) => ({ position, pokemon: null })),
      ],
    })
    const actionInputs: unknown[] = []
    const actions = createSidebarActions({
      rpc: makeTuiClient({
        catchEncounter: async (input) => {
          actionInputs.push(input)
          return { kind: "caught", state: next }
        },
      }),
      state: coordinator,
      toast: (notification) => notifications.push(notification.message),
    })

    // WHEN
    await actions.resolveEncounter(encounter.id, encounter, true)

    // THEN
    expect(coordinator.state()).toEqual(next)
    expect(actionInputs).toEqual([{ encounterId: encounter.id }])
    expect(notifications).toEqual([
      "Arrived at Route 1.",
      "Your party has changed.",
      "Pidgey caught! Added to your party.",
    ])
  })

  test("dispatches the rendered encounter ID and snapshot, guarding duplicate in-flight actions", async () => {
    // GIVEN
    const first = {
      id: "00000000-0000-4000-8000-000000000011",
      kind: "ordinary" as const,
      speciesId: speciesIdSchema.parse("pidgey"),
      name: "Pidgey",
      level: 2,
      gender: "female" as const,
      shiny: false,
      spriteUrl: "https://example.test/pidgey.png",
    }
    const second = { ...first, id: "00000000-0000-4000-8000-000000000012", name: "Rattata" }
    const coordinator = createTuiStateCoordinator(
      makeTuiState({ pendingEncounter: second, pendingEncounterCount: 1 }),
      () => {},
    )
    const response = deferred<{ kind: "caught"; state: ReturnType<typeof makeTuiState> }>()
    const inputs: unknown[] = []
    const notifications: string[] = []
    const actions = createSidebarActions({
      rpc: makeTuiClient({
        catchEncounter: async (input) => {
          inputs.push(input)
          return response.promise
        },
      }),
      state: coordinator,
      toast: (notification) => notifications.push(notification.message),
    })

    // WHEN
    const staleAction = actions.resolveEncounter(first.id, first, true)
    const duplicate = actions.resolveEncounter(second.id, second, true)
    response.resolve({ kind: "caught", state: makeTuiState({ pendingEncounterCount: 0 }) })
    await Promise.all([staleAction, duplicate])

    // THEN
    expect(inputs).toEqual([{ encounterId: first.id }])
    expect(notifications).toEqual(["Pidgey caught! Added to your party."])
  })

  test("does not apply a deferred action response after state disposal", async () => {
    // GIVEN
    const initial = makeTuiState()
    const response = deferred<unknown>()
    const coordinator = createTuiStateCoordinator(initial, () => {})
    const actions = createSidebarActions({
      rpc: makeTuiClient({ travelTo: async () => response.promise }),
      state: coordinator,
      toast: () => {},
    })
    const completion = actions.travelToLocation("kanto-route-1")

    // WHEN
    try {
      coordinator.dispose()
      response.resolve({ kind: "teleported", state: makeTuiState({ location: "kanto-route-1" }) })
      await completion

      // THEN
      expect(coordinator.state()).toBe(initial)
    } finally {
      response.resolve({ kind: "teleported", state: makeTuiState({ location: "kanto-route-1" }) })
      await completion
    }
  })

  test("allows retry after a failed request and never toasts a stale encounter result", async () => {
    const encounter = {
      id: "00000000-0000-4000-8000-000000000021",
      kind: "ordinary" as const,
      speciesId: speciesIdSchema.parse("pidgey"),
      name: "Pidgey",
      level: 2,
      gender: "female" as const,
      shiny: false,
      spriteUrl: "https://example.test/pidgey.png",
    }
    const initial = makeTuiState({ pendingEncounter: encounter, pendingEncounterCount: 1 })
    const coordinator = createTuiStateCoordinator(initial, () => {})
    const refreshed = makeTuiState({ pendingEncounterCount: 0 })
    let calls = 0
    const notifications: string[] = []
    const actions = createSidebarActions({
      rpc: makeTuiClient({
        catchEncounter: async () => {
          calls += 1
          if (calls === 1) throw new Error("request failed")
          return { kind: "no-encounter", state: refreshed }
        },
      }),
      state: coordinator,
      toast: (notification) => notifications.push(notification.message),
    })

    await expect(actions.resolveEncounter(encounter.id, encounter, true)).rejects.toThrow(
      "request failed",
    )
    expect(coordinator.state()).toBe(initial)
    await actions.resolveEncounter(encounter.id, encounter, true)
    expect(calls).toBe(2)
    expect(coordinator.state()).toEqual(refreshed)
    expect(notifications).toEqual([])
  })
})
