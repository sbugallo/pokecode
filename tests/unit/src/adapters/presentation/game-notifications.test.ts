import { describe, expect, test } from "bun:test"
import type { Plugin } from "@opencode/plugin/tui"
import {
  captureNotification,
  gameNotifications,
} from "../../../../../src/adapters/presentation/game-notifications.js"
import { type GameState, gameStateSchema } from "../../../../../src/application/contracts/game.js"
import { regions } from "../../../../../src/domain/content/catalog.js"
import { pokemonInstanceSchema } from "../../../../../src/domain/pokemon/model.js"

function pokemon(index: number, speciesId = "bulbasaur", level = 5) {
  return pokemonInstanceSchema.parse({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    speciesId,
    name: speciesId,
    gender: "male",
    level,
    experience: 0,
    ability: "Overgrow",
    nature: "Hardy",
    shiny: false,
    ivs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
    moves: [],
  })
}

function state(overrides: Partial<GameState> = {}): GameState {
  return gameStateSchema.parse({
    phase: "active",
    locale: "en",
    message: "Ready",
    region: "kanto",
    location: "pallet-town",
    party: [1, 2, 3, 4, 5, 6].map((position) => ({
      position,
      pokemon: position === 1 ? pokemon(1) : null,
    })),
    pendingChoices: [],
    pendingEncounter: null,
    exploration: {
      locations: [
        { id: "pallet-town", name: "Pallet Town", unlocked: true, encounterless: true },
        { id: "route-1", name: "Route 1", unlocked: false, encounterless: false },
      ],
      locationUnlockProgress: 0,
      locationUnlockThreshold: 100_000,
      regionComplete: false,
    },
    ...overrides,
  })
}

function encounter(
  overrides: Partial<NonNullable<GameState["pendingEncounter"]>> = {},
): NonNullable<GameState["pendingEncounter"]> {
  return {
    id: "00000000-0000-4000-8000-000000000100",
    kind: "ordinary",
    speciesId: pokemon(1).speciesId,
    name: "Bulbasaur",
    level: 5,
    gender: "male",
    shiny: false,
    spriteUrl: "https://example.com/bulbasaur.png",
    caught: false,
    ...overrides,
  }
}

describe("game-state notification projections", () => {
  test.each(["en", "es"] as const)(
    "announces completion of all nine regions once (%s)",
    (language) => {
      const previous = state({ locale: language })
      if (previous.exploration === null) throw new Error("Expected exploration")
      previous.exploration.regions = regions(language).map((region) => ({
        ...region,
        visited: true,
        completed: region.id !== "kanto",
        locations: [],
      }))
      const next = structuredClone(previous)
      if (next.exploration === null) throw new Error("Expected exploration")
      next.exploration.regionComplete = true
      next.exploration.regions = next.exploration.regions.map((region) => ({
        ...region,
        completed: true,
      }))
      expect(
        gameNotifications(previous, next).map((notification) => notification.message),
      ).toContain(
        language === "es"
          ? "¡Has completado las nueve regiones! Sigue explorando las ubicaciones desbloqueadas."
          : "You've completed all nine regions! Keep exploring your unlocked locations.",
      )
      expect(gameNotifications(next, structuredClone(next))).toEqual([])
    },
  )

  test("ignores initial, unchanged, and progress-only snapshots", () => {
    // GIVEN
    const previous = state()
    const onboarding = state({ phase: "onboarding", region: null, location: null })
    const progressed = structuredClone(previous)
    if (progressed.exploration !== null) progressed.exploration.locationUnlockProgress = 42
    const member = progressed.party[0]?.pokemon
    if (member !== null && member !== undefined) member.experience = 12

    // WHEN
    const results = [
      gameNotifications(onboarding, previous),
      gameNotifications(previous, previous),
      gameNotifications(previous, progressed),
      gameNotifications(previous, state({ locale: "es" })),
    ]

    // THEN
    expect(results).toEqual([[], [], [], []])
  })

  test.each([
    { name: "ordinary", kind: "ordinary" as const, shiny: false, variant: "info" as const },
    { name: "special", kind: "special" as const, shiny: false, variant: "warning" as const },
    { name: "shiny", kind: "ordinary" as const, shiny: true, variant: "warning" as const },
  ])("announces a new $name encounter with the appropriate severity", (scenario) => {
    // GIVEN
    const previous = state()
    const next = state({ pendingEncounter: encounter(scenario) })

    // WHEN
    const notifications = gameNotifications(previous, next)

    // THEN
    expect(notifications).toHaveLength(1)
    expect(notifications[0]?.variant).toBe(scenario.variant)
    expect(notifications[0]?.message).toContain("Bulbasaur")
    expect(gameNotifications(next, structuredClone(next))).toEqual([])
    expect(
      gameNotifications(
        next,
        state({
          pendingEncounter: encounter({ ...scenario, id: "00000000-0000-4000-8000-000000000101" }),
        }),
      ),
    ).toHaveLength(1)
  })

  test("does not infer a catch or run from an encounter disappearing", () => {
    // GIVEN
    const withEncounter = state({ pendingEncounter: encounter() })
    const fullParty = structuredClone(withEncounter)
    fullParty.party = fullParty.party.map(({ position }) => ({
      position,
      pokemon: pokemon(position),
    }))

    // WHEN
    const afterEmptyPartyResolution = { ...withEncounter, pendingEncounter: null }
    const afterFullPartyResolution = { ...fullParty, pendingEncounter: null }

    // THEN
    expect(gameNotifications(withEncounter, afterEmptyPartyResolution)).toEqual([])
    expect(gameNotifications(fullParty, afterFullPartyResolution)).toEqual([])
  })

  test("matches level gains and evolution by Pokémon identity rather than slot", () => {
    // GIVEN
    const previous = state()
    const next = structuredClone(previous)
    next.party[0] = { position: 1, pokemon: null }
    next.party[1] = { position: 2, pokemon: pokemon(1, "ivysaur", 16) }
    const sameLevelEvolution = state()
    sameLevelEvolution.party[0] = { position: 1, pokemon: pokemon(1, "ivysaur") }
    const replacedIdentity = state()
    replacedIdentity.party[0] = { position: 1, pokemon: pokemon(7, "ivysaur", 16) }

    // WHEN
    const notifications = gameNotifications(previous, next)
    const sameLevelNotifications = gameNotifications(previous, sameLevelEvolution)
    const replacementNotifications = gameNotifications(previous, replacedIdentity)

    // THEN
    expect(notifications.map(({ variant }) => variant)).toEqual(["success", "success"])
    expect(notifications[0]?.message).toContain("Lv.5 → Lv.16")
    expect(notifications[1]?.message).toContain("Ivysaur")
    expect(sameLevelNotifications.map(({ variant }) => variant)).toEqual(["success"])
    expect(replacementNotifications.map(({ variant }) => variant)).toEqual(["info"])
  })

  test("notifies party membership changes but not reordering", () => {
    // GIVEN
    const previous = state({
      party: [
        { position: 1, pokemon: pokemon(1) },
        { position: 2, pokemon: pokemon(2, "pidgey") },
        ...[3, 4, 5, 6].map((position) => ({ position, pokemon: null })),
      ],
    })
    const reordered = structuredClone(previous)
    reordered.party[0] = { position: 1, pokemon: pokemon(2, "pidgey") }
    reordered.party[1] = { position: 2, pokemon: pokemon(1) }
    const added = structuredClone(previous)
    added.party[2] = { position: 3, pokemon: pokemon(3, "pidgey") }

    // WHEN
    const reorderNotifications = gameNotifications(previous, reordered)
    const additionNotifications = gameNotifications(previous, added)

    // THEN
    expect(reorderNotifications).toEqual([])
    expect(additionNotifications.map(({ variant }) => variant)).toEqual(["info"])
  })

  test("announces only newly queued move and evolution choices", () => {
    // GIVEN
    const previous = state()
    const next = state({
      pendingChoices: ["move", "evolution", "catch", "region"].map((kind, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 200).padStart(12, "0")}`,
        kind,
        payload: "{}",
      })),
    })

    // WHEN
    const notifications = gameNotifications(previous, next)

    // THEN
    expect(notifications.map(({ message }) => message)).toEqual([
      "A new move choice is available.",
      "Choose an evolution",
    ])
    expect(gameNotifications(next, structuredClone(next))).toEqual([])
  })

  test("announces location unlocks, region completion, and travel", () => {
    // GIVEN
    const previous = state()
    const completed = structuredClone(previous)
    if (completed.exploration !== null) {
      completed.exploration.locations = completed.exploration.locations.map((location) =>
        location.id === "route-1" ? { ...location, unlocked: true } : location,
      )
      completed.exploration.regionComplete = true
    }
    const traveled = state({ location: "route-1" })

    // WHEN
    const completionNotifications = gameNotifications(previous, completed)
    const travelNotifications = gameNotifications(previous, traveled)
    const regionTravelNotifications = gameNotifications(previous, state({ region: "johto" }))

    // THEN
    expect(completionNotifications.map(({ message }) => message)).toEqual([
      "Location unlocked: Route 1.",
      "You've completed Kanto!",
    ])
    expect(travelNotifications.map(({ message }) => message)).toEqual(["Arrived at Route 1."])
    expect(gameNotifications(completed, structuredClone(completed))).toEqual([])
    expect(regionTravelNotifications.map(({ message }) => message)).toEqual([
      "Arrived at Pallet Town.",
    ])
  })

  test.each([
    {
      language: "en" as const,
      encounterMessage: "✨ Wild Bulbasaur ♂ Lv.5",
      moveChoice: "A new move choice is available.",
      evolutionChoice: "Choose an evolution",
      partyCapture: "Bulbasaur caught! Added to your party.",
      pcCapture: "Bulbasaur caught! Sent to the PC.",
    },
    {
      language: "es" as const,
      encounterMessage: "✨ Bulbasaur salvaje ♂ Nv.5",
      moveChoice: "Hay una nueva elección de movimiento.",
      evolutionChoice: "Elige una evolución",
      partyCapture: "¡Bulbasaur capturado! Añadido a tu equipo.",
      pcCapture: "¡Bulbasaur capturado! Enviado al PC.",
    },
  ])("localizes encounter and capture notifications in $language", (scenario) => {
    // GIVEN
    const previous = state({ locale: scenario.language })
    const next = state({
      locale: scenario.language,
      pendingEncounter: encounter({ shiny: true }),
      pendingChoices: ["move", "evolution"].map((kind, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 300).padStart(12, "0")}`,
        kind,
        payload: "{}",
      })),
    })

    // WHEN
    const notifications = gameNotifications(previous, next)
    const encounterNotification = notifications[0]
    const partyCapture = captureNotification(encounter(), "party", scenario.language)
    const pcCapture = captureNotification(encounter(), "pc", scenario.language)

    // THEN
    expect(encounterNotification?.message).toBe(scenario.encounterMessage)
    expect(notifications[1]?.message).toBe(scenario.moveChoice)
    expect(notifications[2]?.message).toBe(scenario.evolutionChoice)
    expect(partyCapture).toMatchObject({ variant: "success", message: scenario.partyCapture })
    expect(pcCapture).toMatchObject({ variant: "success", message: scenario.pcCapture })
    for (const notification of [encounterNotification, partyCapture, pcCapture]) {
      if (notification === undefined) throw new Error("Expected an encounter notification")
      const compatible: Parameters<Plugin.Context["ui"]["toast"]["show"]>[0] = notification
      expect(compatible).toBe(notification)
    }
  })
})
