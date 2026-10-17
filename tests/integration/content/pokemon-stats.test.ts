import { describe, expect, test } from "bun:test"
import { nationalDex } from "../../../src/domain/content/catalog.js"
import { pokemonCatalog } from "../../../src/domain/content/catalogs/pokemon-catalog.js"
import { type PokemonInstance, pokemonInstanceSchema } from "../../../src/domain/pokemon/model.js"
import { pokemonStats } from "../../../src/domain/pokemon/stats.js"

function pokemon(speciesId: string): PokemonInstance {
  return pokemonInstanceSchema.parse({
    id: "00000000-0000-4000-8000-000000000001",
    speciesId,
    name: speciesId,
    gender: "genderless",
    level: 50,
    experience: 0,
    ability: "Test",
    nature: "Hardy",
    shiny: false,
    ivs: { hp: 31, attack: 31, defense: 31, specialAttack: 31, specialDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
    moves: [],
  })
}

describe("Pokémon stats content contract", () => {
  test("computes six positive integer stats for each National Dex species", () => {
    // GIVEN
    const dex = nationalDex()

    // WHEN
    const stats = dex.map(({ speciesId }) => pokemonStats(pokemon(speciesId)))

    // THEN
    expect(dex).toHaveLength(1025)
    expect(pokemonCatalog.map(({ id }) => id).toSorted()).toEqual(
      dex.map(({ speciesId }) => speciesId).toSorted(),
    )
    for (const entry of pokemonCatalog) {
      expect(entry.baseStats).toHaveLength(6)
      expect(entry.baseStats.every((value) => Number.isInteger(value) && value > 0)).toBe(true)
    }
    for (const value of stats.flatMap((entry) => Object.values(entry))) {
      expect(Number.isInteger(value) && value > 0).toBe(true)
    }
  })

  test("retains independent base-stat references for representative species", () => {
    // GIVEN
    const referenceSpecies = ["deoxys", "wormadam", "terapagos"]

    // WHEN
    const baseStats = referenceSpecies.map(
      (id) => pokemonCatalog.find((entry) => entry.id === id)?.baseStats,
    )

    // THEN
    expect(baseStats).toEqual([
      [50, 150, 50, 150, 50, 150],
      [60, 59, 85, 79, 105, 36],
      [90, 65, 85, 65, 85, 60],
    ])
  })
})
