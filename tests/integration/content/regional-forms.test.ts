import { describe, expect, test } from "bun:test"
import {
  baseSpeciesIdFor,
  nationalDex,
  ordinaryEncountersForLocation,
  specialEncountersForRegion,
} from "../../../src/domain/content/catalog.js"
import { regionalFormsCatalog } from "../../../src/domain/content/catalogs/regional-forms-catalog.js"
import { pokemonInstanceSchema } from "../../../src/domain/pokemon/model.js"
import { pokemonStats } from "../../../src/domain/pokemon/stats.js"

describe("regional form content contracts", () => {
  test("uses regional PokéAPI stats without adding forms to the National Dex", () => {
    // GIVEN
    const raichu = regionalFormsCatalog.find((form) => form.id === "raichu-alola")
    const regionalRaichu = pokemonInstanceSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      speciesId: "raichu-alola",
      name: "Alolan Raichu",
      gender: "male",
      level: 50,
      experience: 0,
      ability: "Surge Surfer",
      nature: "Hardy",
      shiny: false,
      ivs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
      evs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
      moves: [],
    })

    // WHEN
    const computedHp = pokemonStats(regionalRaichu).hp

    // THEN
    expect(raichu).toMatchObject({
      baseSpeciesId: "raichu",
      pokedexNumber: 26,
      types: ["electric", "psychic"],
      abilities: ["surge-surfer"],
      baseStats: [60, 85, 50, 95, 85, 110],
    })
    expect(nationalDex()).toHaveLength(1025)
    expect(nationalDex().some(({ speciesId }) => speciesId === "raichu-alola")).toBe(false)
    expect(baseSpeciesIdFor("raichu-alola")).toBe("raichu")
    expect(computedHp).toBe(120)
  })

  test("retains representative regional form identities", () => {
    // GIVEN
    // WHEN
    const formIds = regionalFormsCatalog.map(({ id }) => id)

    // THEN
    expect(formIds).toContain("rattata-alola")
    expect(formIds).toContain("meowth-galar")
    expect(formIds).toContain("wooper-paldea")
  })

  test("keeps representative Alola, Galar, and Paldea forms in encounter tables", () => {
    // GIVEN
    const alolaSpecies = ordinaryEncountersForLocation("alola-route-1").map(({ speciesId }) =>
      String(speciesId),
    )
    const galarSpecies = specialEncountersForRegion("galar").map(({ speciesId }) =>
      String(speciesId),
    )
    const paldeaTauros = ordinaryEncountersForLocation("paldea-east-province-area-one").filter(
      ({ speciesId }) => String(speciesId).startsWith("tauros-paldea-"),
    )

    // WHEN
    const taurosWeight = paldeaTauros.reduce((total, encounter) => total + encounter.weight, 0)

    // THEN
    expect(alolaSpecies).toContain("rattata-alola")
    expect(galarSpecies).toContain("articuno-galar")
    expect(
      specialEncountersForRegion("paldea", "cascarrafa").map(({ speciesId }) => String(speciesId)),
    ).toContain("wooper")
    expect(paldeaTauros.map(({ speciesId }) => String(speciesId)).toSorted()).toEqual([
      "tauros-paldea-aqua-breed",
      "tauros-paldea-blaze-breed",
      "tauros-paldea-combat-breed",
    ])
    expect(taurosWeight).toBeCloseTo(0.016801052434734943)
  })
})
