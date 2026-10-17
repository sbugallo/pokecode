import { describe, expect, test } from "bun:test"
import {
  generatedContentCatalog,
  localizedPokemonName,
  ordinaryEncountersForLocation,
  specialEncountersForRegion,
} from "../../../src/domain/content/catalog.js"
import { availablePokemonGendersSchema } from "../../../src/domain/pokemon/types.js"

const allSpecies = [...generatedContentCatalog.species, ...generatedContentCatalog.regionalForms]
const speciesById = new Map(allSpecies.map((species) => [species.id, species]))

describe("catalog gender contracts", () => {
  test("defines valid gender options for every species and inherits options across forms", () => {
    // GIVEN
    // WHEN
    const validOptions = allSpecies.every(
      (species) => availablePokemonGendersSchema.safeParse(species.availableGenders).success,
    )

    // THEN
    expect(generatedContentCatalog.species).toHaveLength(1025)
    expect(generatedContentCatalog.regionalForms).toHaveLength(41)
    expect(validOptions).toBe(true)
    for (const form of generatedContentCatalog.regionalForms) {
      const baseSpecies = speciesById.get(form.baseSpeciesId)
      expect(baseSpecies).toBeDefined()
      if (baseSpecies !== undefined) {
        expect(form.availableGenders).toEqual(baseSpecies.availableGenders)
      }
    }
  })

  test("keeps gender-specific species IDs while localizing Nidoran display names", () => {
    // GIVEN
    // WHEN
    const names = [
      localizedPokemonName("nidoran-f", "en", "Nidoran♀"),
      localizedPokemonName("nidoran-m", "en", "Nidoran♂"),
      localizedPokemonName("nidoran-f", "es", "Nidoran♀"),
      localizedPokemonName("nidoran-m", "es", "Nidoran♂"),
    ]

    // THEN
    expect(names).toEqual(["Nidoran", "Nidoran", "Nidoran", "Nidoran"])
    expect(speciesById.get("nidoran-f")?.pokedexNumber).toBe(29)
    expect(speciesById.get("nidoran-m")?.pokedexNumber).toBe(32)
  })

  test("resolves encounter gender options from species catalogs", () => {
    // GIVEN
    const candidates = [
      ...ordinaryEncountersForLocation("kanto-route-1"),
      ...specialEncountersForRegion("galar"),
    ]

    // WHEN
    const optionsMatchSpecies = candidates.every(
      (candidate) =>
        JSON.stringify(candidate.availableGenders) ===
        JSON.stringify(speciesById.get(candidate.speciesId)?.availableGenders),
    )

    // THEN
    expect(optionsMatchSpecies).toBe(true)
    expect(candidates.map(({ speciesId }) => String(speciesId))).toContain("articuno-galar")
  })
})
