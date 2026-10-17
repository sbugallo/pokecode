import { describe, expect, test } from "bun:test"
import { locationTravelProjection } from "../../../../../../../src/adapters/opencode/tui/travel/projection.js"
import { pokemonDexSchema } from "../../../../../../../src/application/contracts/game.js"
import { specialEncountersForRegion } from "../../../../../../../src/domain/content/catalog.js"
import { makeTuiState } from "../../../../../../support/tui.js"

describe("location travel projection", () => {
  test("excludes roamers from Pueblo Yarda while retaining fixed specials and roaming gameplay", () => {
    const locationId = "postwick"
    const state = makeTuiState({
      region: "galar",
      location: "postwick",
      exploration: {
        locations: [{ id: "postwick", name: "Pueblo Yarda", unlocked: true, encounterless: true }],
        locationUnlockProgress: 0,
        locationUnlockThreshold: 100,
        regionComplete: false,
      },
    })
    const dex = pokemonDexSchema.parse({
      pokemon: [],
      discoveries: [{ speciesId: "moltres", status: "caught" }],
    })
    const preview = locationTravelProjection(state, dex)?.pokemonByLocation[locationId] ?? []
    expect(preview.map((entry) => String(entry.speciesId))).toEqual([
      "charmander",
      "grookey",
      "scorbunny",
      "sobble",
    ])
    for (const speciesId of ["articuno-galar", "zapdos-galar", "moltres-galar", "zarude"]) {
      expect(preview.some((entry) => entry.speciesId === speciesId)).toBe(false)
      expect(
        specialEncountersForRegion("galar", "postwick").some(
          (entry) => entry.speciesId === speciesId,
        ),
      ).toBe(true)
    }
  })

  test("groups unlocked locations across visited regions and uses each region's encounters", () => {
    const locations = [
      { id: "pallet-town", name: "Pueblo Paleta", unlocked: true, encounterless: true },
      { id: "kanto-route-1", name: "Ruta 1", unlocked: false, encounterless: false },
    ]
    const state = makeTuiState({
      locale: "es",
      region: "kanto",
      location: "pallet-town",
      exploration: {
        locations,
        regions: [
          { id: "kanto", name: "Kanto", visited: true, completed: true, locations },
          {
            id: "galar",
            name: "Galar",
            visited: true,
            completed: false,
            locations: [
              {
                id: "fields-of-honor",
                name: "Prado Reverencia",
                unlocked: true,
                encounterless: false,
              },
            ],
          },
          { id: "unova", name: "Teselia", visited: false, completed: false, locations: [] },
        ],
        locationUnlockProgress: 0,
        locationUnlockThreshold: 100,
        regionComplete: true,
      },
    })
    const projection = locationTravelProjection(
      state,
      pokemonDexSchema.parse({ pokemon: [], discoveries: [] }),
    )
    expect(projection?.regions).toEqual([
      { id: "kanto", name: "Kanto" },
      { id: "galar", name: "Galar" },
    ])
    expect(projection?.locations.map((location) => String(location.id))).toEqual([
      "pallet-town",
      "fields-of-honor",
    ])
    expect(
      projection?.pokemonByLocation["fields-of-honor"]?.some(
        (pokemon) => pokemon.speciesId === "raichu-alola",
      ),
    ).toBe(true)
    expect(projection?.locations[1]).toMatchObject({ regionId: "galar" })
  })

  test("deduplicates encounter species and defaults unknown entries to localized names", () => {
    // GIVEN
    const state = makeTuiState({
      region: "kanto",
      location: "pallet-town",
      exploration: {
        locations: [{ id: "kanto-route-1", name: "Route 1", unlocked: true, encounterless: false }],
        locationUnlockProgress: 0,
        locationUnlockThreshold: 100,
        regionComplete: false,
      },
    })

    // WHEN
    const projection = locationTravelProjection(
      state,
      pokemonDexSchema.parse({ pokemon: [], discoveries: [] }),
    )
    const preview = projection?.pokemonByLocation["kanto-route-1"] ?? []

    // THEN
    expect(new Set(preview.map((pokemon) => pokemon.speciesId)).size).toBe(preview.length)
    expect(preview.length).toBeGreaterThan(0)
    expect(
      preview.every((pokemon) => pokemon.status === "unknown" && pokemon.name.length > 0),
    ).toBe(true)
    expect(projection?.currentLocationId).toBe("pallet-town")
  })

  test.each([
    { status: undefined, expected: "unknown" },
    { status: "seen", expected: "seen" },
    { status: "caught", expected: "caught" },
  ])(
    "uses exact regional form discovery status ($expected), not its base species",
    ({ status, expected }) => {
      // GIVEN
      const state = makeTuiState({
        region: "galar",
        location: "fields-of-honor",
        exploration: {
          locations: [
            {
              id: "fields-of-honor",
              name: "Fields of Honor",
              unlocked: true,
              encounterless: false,
            },
          ],
          locationUnlockProgress: 0,
          locationUnlockThreshold: 100,
          regionComplete: false,
        },
      })
      const dex = pokemonDexSchema.parse({
        pokemon: [{ number: 26, speciesId: "raichu", name: "Raichu", status: "caught" }],
        discoveries: [
          { speciesId: "raichu", status: "caught" },
          ...(status === undefined ? [] : [{ speciesId: "raichu-alola", status }]),
        ],
      })

      // WHEN
      const form = locationTravelProjection(state, dex)?.pokemonByLocation["fields-of-honor"]?.find(
        (pokemon) => pokemon.speciesId === "raichu-alola",
      )

      // THEN
      expect(form).toMatchObject({ speciesId: "raichu-alola", status: expected })
    },
  )

  test("requires both active exploration and a selected region", () => {
    // GIVEN
    const state = makeTuiState({ region: null, location: null })

    // WHEN
    const projection = locationTravelProjection(
      state,
      pokemonDexSchema.parse({ pokemon: [], discoveries: [] }),
    )

    // THEN
    expect(projection).toBeNull()
  })
})
