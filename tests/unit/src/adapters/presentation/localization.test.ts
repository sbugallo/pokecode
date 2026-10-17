import { describe, expect, test } from "bun:test"
import {
  localizeDex,
  localizeGameState,
  localizePokemon,
} from "../../../../../src/adapters/presentation/localization.js"
import { gameStateSchema, pokemonDexSchema } from "../../../../../src/application/contracts/game.js"
import { locationsForRegion } from "../../../../../src/domain/content/catalog.js"
import { pokemonInstanceSchema } from "../../../../../src/domain/pokemon/model.js"
import { pokemonStats } from "../../../../../src/domain/pokemon/stats.js"
import { languageSchema } from "../../../../../src/domain/shared/language.js"

function pokemon(speciesId: string, name: string, ability: string) {
  return pokemonInstanceSchema.parse({
    id: "11111111-1111-4111-8111-111111111111",
    speciesId,
    name,
    gender: "male",
    level: 50,
    experience: 0,
    ability,
    nature: "Modest",
    shiny: false,
    ivs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
    moves: [{ id: "vine-whip", name: "Vine Whip" }],
  })
}

describe("localized presentation projections", () => {
  test("preserves exact-form discoveries through localized Dex serialization", () => {
    const dex = pokemonDexSchema.parse({
      pokemon: [{ number: 146, speciesId: "moltres", name: "Moltres", status: "caught" }],
      discoveries: [
        { speciesId: "moltres", status: "caught" },
        { speciesId: "moltres-galar", status: "seen" },
      ],
    })
    const roundTrip = pokemonDexSchema.parse(JSON.parse(JSON.stringify(localizeDex(dex, "es"))))
    expect(roundTrip.discoveries).toEqual(dex.discoveries)
    expect(roundTrip.discoveries.find((entry) => entry.speciesId === "moltres-galar")?.status).toBe(
      "seen",
    )
  })

  test("accepts only supported language codes", () => {
    // GIVEN
    const supported = ["en", "es"]

    // WHEN
    const results = supported.map((language) => languageSchema.safeParse(language).success)

    // THEN
    expect(results).toEqual([true, true])
    expect(languageSchema.safeParse("fr").success).toBe(false)
  })

  test("localizes stored Pokémon, abilities, moves, and game-state locations", () => {
    // GIVEN
    const bulbasaur = pokemon("bulbasaur", "Bulbasaur", "Overgrow")
    const state = gameStateSchema.parse({
      phase: "active",
      message: "Ready",
      region: "kanto",
      location: "pallet-town",
      party: [
        { position: 1, pokemon: bulbasaur },
        ...[2, 3, 4, 5, 6].map((position) => ({ position, pokemon: null })),
      ],
      pendingChoices: [],
      choicePokemon: [bulbasaur],
      pendingEncounter: null,
      exploration: {
        locations: [
          { id: "pallet-town", name: "Pallet Town", unlocked: true, encounterless: true },
        ],
        locationUnlockProgress: 0,
        locationUnlockThreshold: 100_000,
        regionComplete: false,
      },
    })

    // WHEN
    const localizedPokemon = localizePokemon(bulbasaur, "es")
    const localizedState = localizeGameState(state, "es")

    // THEN
    expect(localizedPokemon).toMatchObject({
      name: "Bulbasaur",
      ability: "Espesura",
      moves: [{ id: "vine-whip", name: "Látigo Cepa" }],
    })
    expect(localizedState).toMatchObject({
      locale: "es",
      choicePokemon: [{ name: "Bulbasaur", ability: "Espesura", moves: [{ name: "Látigo Cepa" }] }],
      exploration: { locations: [{ name: "Pueblo Paleta" }] },
    })
    expect(locationsForRegion("kanto", "es")[0]?.name).toBe("Pueblo Paleta")
  })

  test("localizes regional forms without changing computed battle stats", () => {
    // GIVEN
    const regionalRaichu = pokemon("raichu-alola", "Alolan Raichu", "Surge Surfer")
    const expectedStats = pokemonStats(regionalRaichu)

    // WHEN
    const localized = localizePokemon(regionalRaichu, "es")

    // THEN
    expect(localized).toMatchObject({ name: "Raichu de Alola", ability: "Cola Surf" })
    expect(pokemonStats(localized)).toEqual(expectedStats)
  })
})
