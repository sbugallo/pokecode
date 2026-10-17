import { describe, expect, test } from "bun:test"
import {
  locationsForRegion,
  ordinaryEncountersForLocation,
  regions,
  specialEncountersForRegion,
  startersForRegion,
} from "../../../src/domain/content/catalog.js"
import { abilitiesCatalog } from "../../../src/domain/content/catalogs/abilities-catalog.js"
import { alolaLocationsCatalog } from "../../../src/domain/content/catalogs/alola-locations-catalog.js"
import { galarLocationsCatalog } from "../../../src/domain/content/catalogs/galar-locations-catalog.js"
import { hoennLocationsCatalog } from "../../../src/domain/content/catalogs/hoenn-locations-catalog.js"
import { johtoLocationsCatalog } from "../../../src/domain/content/catalogs/johto-locations-catalog.js"
import { kalosLocationsCatalog } from "../../../src/domain/content/catalogs/kalos-locations-catalog.js"
import { kantoLocationsCatalog } from "../../../src/domain/content/catalogs/kanto-locations-catalog.js"
import { movesCatalog } from "../../../src/domain/content/catalogs/moves-catalog.js"
import { paldeaLocationsCatalog } from "../../../src/domain/content/catalogs/paldea-locations-catalog.js"
import { pokemonCatalog } from "../../../src/domain/content/catalogs/pokemon-catalog.js"
import { regionalFormsCatalog } from "../../../src/domain/content/catalogs/regional-forms-catalog.js"
import { regionsCatalog } from "../../../src/domain/content/catalogs/regions-catalog.js"
import { sinnohLocationsCatalog } from "../../../src/domain/content/catalogs/sinnoh-locations-catalog.js"
import { typesCatalog } from "../../../src/domain/content/catalogs/types-catalog.js"
import { unovaLocationsCatalog } from "../../../src/domain/content/catalogs/unova-locations-catalog.js"

describe("regional content contracts", () => {
  test("exposes the supported regions, starting towns, and starters", () => {
    // GIVEN
    const expectedStartingLocations = {
      kanto: "pallet-town",
      johto: "new-bark-town",
      hoenn: "littleroot-town",
      sinnoh: "twinleaf-town",
      unova: "nuvema-town",
      kalos: "vaniville-town",
      alola: "iki-town",
      galar: "postwick",
      paldea: "cabo-poco",
    } as const

    // WHEN
    const regionIds = regions().map(({ id }) => String(id))
    const startingLocations = Object.fromEntries(
      regions().map((region) => [String(region.id), String(locationsForRegion(region.id)[0]?.id)]),
    )

    // THEN
    expect(regionIds).toEqual([
      "kanto",
      "johto",
      "hoenn",
      "sinnoh",
      "unova",
      "kalos",
      "alola",
      "galar",
      "paldea",
    ])
    expect(regionIds).not.toContain("hisui")
    expect(startingLocations).toEqual(expectedStartingLocations)
    expect(startersForRegion("johto").map(({ speciesId }) => String(speciesId))).toEqual([
      "chikorita",
      "cyndaquil",
      "totodile",
    ])
  })

  test("keeps curated Kanto encounter versions and fixed-location special encounters", () => {
    // GIVEN
    const kantoSpecials = specialEncountersForRegion("kanto").map(({ speciesId }) =>
      String(speciesId),
    )
    const route16 = specialEncountersForRegion("kanto", "kanto-route-16").map(({ speciesId }) =>
      String(speciesId),
    )
    const route1 = specialEncountersForRegion("kanto", "kanto-route-1").map(({ speciesId }) =>
      String(speciesId),
    )
    const firstKantoLocations = kantoLocationsCatalog.locations.slice(0, 2).map(({ id }) => id)

    // WHEN
    const routeOneSpecies = ordinaryEncountersForLocation("kanto-route-1").map(({ speciesId }) =>
      String(speciesId),
    )

    // THEN
    expect(kantoSpecials).toContain("mewtwo")
    expect(route16).toContain("snorlax")
    expect(route1).not.toContain("snorlax")
    expect(routeOneSpecies).toEqual(["pidgey", "rattata"])
    expect(firstKantoLocations).toEqual(["pallet-town", "kanto-route-1"])
  })

  test("keeps Hoenn's Route 117 special mapping separate from Route 118", () => {
    // GIVEN
    const route117 = specialEncountersForRegion("hoenn", "hoenn-route-117").map(({ speciesId }) =>
      String(speciesId),
    )
    const route118 = specialEncountersForRegion("hoenn", "hoenn-route-118").map(({ speciesId }) =>
      String(speciesId),
    )

    // WHEN
    const curatedRoute117Species = route117.filter((speciesId) =>
      ["azurill", "jirachi", "deoxys"].includes(speciesId),
    )

    // THEN
    expect(curatedRoute117Species).toContain("azurill")
    expect(curatedRoute117Species).toContain("jirachi")
    expect(curatedRoute117Species).not.toContain("deoxys")
    expect(route118).not.toContain("azurill")
  })

  test("normalizes Johto walking encounter probabilities", () => {
    // GIVEN
    const firstRoute = locationsForRegion("johto").find(
      (location) => ordinaryEncountersForLocation(location.id).length > 0,
    )

    // WHEN
    const encounters = firstRoute === undefined ? [] : ordinaryEncountersForLocation(firstRoute.id)
    const totalProbability = encounters.reduce((total, encounter) => total + encounter.weight, 0)

    // THEN
    expect(encounters.length).toBeGreaterThan(0)
    expect(totalProbability).toBeCloseTo(1)
  })

  test("stores English and Spanish names across generated content catalogs", () => {
    // GIVEN
    const locationCatalogs = [
      alolaLocationsCatalog,
      galarLocationsCatalog,
      hoennLocationsCatalog,
      johtoLocationsCatalog,
      kalosLocationsCatalog,
      kantoLocationsCatalog,
      paldeaLocationsCatalog,
      sinnohLocationsCatalog,
      unovaLocationsCatalog,
    ]
    const entries = [
      ...pokemonCatalog,
      ...regionalFormsCatalog,
      ...movesCatalog,
      ...abilitiesCatalog,
      ...typesCatalog,
      ...regionsCatalog,
      ...locationCatalogs.flatMap(({ locations }) =>
        locations.map(({ id, localization }) => ({ id, localization })),
      ),
    ]

    // WHEN
    const invalidLocalizations = entries
      .filter(
        ({ localization }) =>
          JSON.stringify(Object.keys(localization).toSorted()) !== '["en","es"]' ||
          Object.values(localization).some((name) => name.trim().length === 0),
      )
      .map(({ id }) => id)

    // THEN
    expect(invalidLocalizations).toEqual([])
    expect(kantoLocationsCatalog.locations[0]?.localization).toEqual({
      es: "Pueblo Paleta",
      en: "Pallet Town",
    })
    expect(regionsCatalog.find(({ id }) => id === "unova")?.localization).toEqual({
      es: "Teselia",
      en: "Unova",
    })
  })

  test("resolves Pokémon ability and type IDs to canonical localized entries", () => {
    // GIVEN
    const abilityIds = new Set(abilitiesCatalog.map(({ id }) => id))
    const typeIds = new Set(typesCatalog.map(({ id }) => id))
    // WHEN
    const unresolvedSpecies = pokemonCatalog
      .filter(
        (pokemon) =>
          pokemon.abilities.some((id) => !abilityIds.has(id)) ||
          pokemon.types.some((id) => !typeIds.has(id)),
      )
      .map(({ id }) => id)

    // THEN
    expect(unresolvedSpecies).toEqual([])
  })
})
