import { describe, expect, test } from "bun:test"
import {
  type PokemonInstance,
  pokemonInstanceSchema,
} from "../../../../../src/domain/pokemon/model.js"
import { pokemonStats } from "../../../../../src/domain/pokemon/stats.js"
import { speciesIdSchema } from "../../../../../src/domain/shared/identifiers.js"

function pokemon(
  overrides: Omit<Partial<PokemonInstance>, "speciesId"> & { speciesId?: string } = {},
): PokemonInstance {
  const { speciesId = "mew", ...otherOverrides } = overrides
  return pokemonInstanceSchema.parse({
    id: "00000000-0000-4000-8000-000000000001",
    speciesId: speciesIdSchema.parse(speciesId),
    name: "Mew",
    gender: "genderless",
    level: 100,
    experience: 0,
    ability: "Synchronize",
    nature: "Hardy",
    shiny: false,
    ivs: { hp: 31, attack: 31, defense: 31, specialAttack: 31, specialDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
    moves: [],
    ...otherOverrides,
  })
}

describe("Pokémon stat calculation", () => {
  test("matches the known level-50 Charizard stat line", () => {
    // GIVEN
    const instance = pokemon({ speciesId: "charizard", level: 50 })

    // WHEN
    const stats = pokemonStats(instance)

    // THEN
    expect(stats).toEqual({
      hp: 153,
      attack: 104,
      defense: 98,
      specialAttack: 129,
      specialDefense: 105,
      speed: 120,
    })
  })

  test("floors level and IV scaling before applying a nature", () => {
    // GIVEN
    const instance = pokemon({
      speciesId: "charizard",
      level: 37,
      nature: "Modest",
      ivs: { hp: 1, attack: 2, defense: 3, specialAttack: 4, specialDefense: 5, speed: 6 },
    })

    // WHEN
    const stats = pokemonStats(instance)

    // THEN
    expect(stats).toEqual({
      hp: 105,
      attack: 60,
      defense: 63,
      specialAttack: 95,
      specialDefense: 69,
      speed: 81,
    })
  })

  test("computes minimum-level stats with zero IVs", () => {
    // GIVEN
    const instance = pokemon({
      speciesId: "bulbasaur",
      level: 1,
      ivs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
    })

    // WHEN
    const stats = pokemonStats(instance)

    // THEN
    expect(stats).toEqual({
      hp: 11,
      attack: 5,
      defense: 5,
      specialAttack: 6,
      specialDefense: 6,
      speed: 5,
    })
  })

  test.each([
    ["Hardy", 236, 236, 236, 236, 236],
    ["Lonely", 259, 212, 236, 236, 236],
    ["Brave", 259, 236, 236, 236, 212],
    ["Adamant", 259, 236, 212, 236, 236],
    ["Naughty", 259, 236, 236, 212, 236],
    ["Bold", 212, 259, 236, 236, 236],
    ["Docile", 236, 236, 236, 236, 236],
    ["Relaxed", 236, 259, 236, 236, 212],
    ["Impish", 236, 259, 212, 236, 236],
    ["Lax", 236, 259, 236, 212, 236],
    ["Timid", 212, 236, 236, 236, 259],
    ["Hasty", 236, 212, 236, 236, 259],
    ["Serious", 236, 236, 236, 236, 236],
    ["Jolly", 236, 236, 212, 236, 259],
    ["Naive", 236, 236, 236, 212, 259],
    ["Modest", 212, 236, 259, 236, 236],
    ["Mild", 236, 212, 259, 236, 236],
    ["Quiet", 236, 236, 259, 236, 212],
    ["Bashful", 236, 236, 236, 236, 236],
    ["Rash", 236, 236, 259, 212, 236],
    ["Calm", 212, 236, 236, 259, 236],
    ["Gentle", 236, 212, 236, 259, 236],
    ["Sassy", 236, 236, 236, 259, 212],
    ["Careful", 236, 236, 212, 259, 236],
    ["Quirky", 236, 236, 236, 236, 236],
  ] as const)(
    "applies the canonical %s nature modifiers",
    (nature, attack, defense, specialAttack, specialDefense, speed) => {
      // GIVEN
      const instance = pokemon({ nature })

      // WHEN
      const stats = pokemonStats(instance)

      // THEN
      expect(stats).toEqual({ hp: 341, attack, defense, specialAttack, specialDefense, speed })
    },
  )

  test.each([1, 100])("keeps Shedinja HP at one at level %i", (level) => {
    // GIVEN
    const instance = pokemon({ speciesId: "shedinja", level })

    // WHEN
    const stats = pokemonStats(instance)

    // THEN
    expect(stats.hp).toBe(1)
  })

  test.each([
    { name: "unknown species", speciesId: "missing-species", nature: "Hardy" },
    { name: "noncanonical nature", speciesId: "mew", nature: "Modeste" },
  ])("rejects a $name", ({ speciesId, nature }) => {
    // GIVEN
    const instance = pokemon({ speciesId, nature })

    // WHEN
    const calculate = () => pokemonStats(instance)

    // THEN
    expect(calculate).toThrow(RangeError)
  })
})
