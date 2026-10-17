import { describe, expect, test } from "bun:test"
import { validatePartyReplacement } from "../../../../../src/domain/party/party.js"

describe("party replacement validation", () => {
  test.each([
    {
      name: "an empty party",
      facts: { pokemonIds: [] },
      expected: { valid: false, reason: "empty" },
    },
    {
      name: "more than six Pokémon",
      facts: { pokemonIds: ["1", "2", "3", "4", "5", "6", "7"] },
      expected: { valid: false, reason: "too-large" },
    },
    {
      name: "duplicate Pokémon",
      facts: { pokemonIds: ["owned", "owned"] },
      expected: { valid: false, reason: "duplicate" },
    },
    {
      name: "a Pokémon the trainer does not own",
      facts: { pokemonIds: ["owned", "other"], ownedPokemonCount: 1 },
      expected: { valid: false, reason: "not-owned" },
    },
    {
      name: "a valid selected order",
      facts: { pokemonIds: ["second", "first"], ownedPokemonCount: 2 },
      expected: { valid: true, pokemonIds: ["second", "first"] },
    },
  ] as const)("validates $name", ({ facts, expected }) => {
    // GIVEN
    // WHEN
    const result = validatePartyReplacement(facts)

    // THEN
    expect(result).toEqual(expected)
  })
})
