import { expect, test } from "bun:test"
import {
  gameplayConfigSchema,
  gameStateSchema,
} from "../../../../../src/application/contracts/game.js"

test("gameplay configuration defaults and positive-integer constraints stay stable", () => {
  // GIVEN
  const defaults = gameplayConfigSchema.parse({})

  // WHEN
  const invalidConfigurations = [
    { pauseOnPendingChoice: "false" },
    { encounterMinimumTokens: 1.5 },
    { encounterMaximumTokens: -1 },
    { locationUnlockBaseTokens: 0 },
    { locationUnlockExponent: 0 },
    { pauseOnPendingChoice: 0 },
    { pauseOnPendingChoice: null },
  ]

  // THEN
  expect(defaults).toEqual({
    pauseOnPendingChoice: true,
    encounterMinimumTokens: 200_000,
    encounterMaximumTokens: 400_000,
    locationUnlockBaseTokens: 4_214_000,
    locationUnlockExponent: 2.64,
    locationUnlockRegionExponent: -1.72,
  })
  for (const config of invalidConfigurations)
    expect(gameplayConfigSchema.safeParse(config).success).toBe(false)
})

test("continuous progression is an explicit boolean opt-in", () => {
  expect(gameplayConfigSchema.parse({ pauseOnPendingChoice: false }).pauseOnPendingChoice).toBe(
    false,
  )
})

test("queue projections default to empty for onboarding and older state producers", () => {
  const state = gameStateSchema.parse({
    phase: "onboarding",
    message: "Choose a starter.",
    region: null,
    location: null,
    party: [1, 2, 3, 4, 5, 6].map((position) => ({ position, pokemon: null })),
    pendingChoices: [],
  })

  expect(state.pendingEncounterCount).toBe(0)
  expect(state.choicePokemon).toEqual([])
  expect(state.pendingEncounter).toBeNull()
})
