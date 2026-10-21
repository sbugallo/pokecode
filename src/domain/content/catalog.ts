import type { AvailablePokemonGender } from "../pokemon/types.js"
import {
  type LocationId,
  locationIdSchema,
  type RegionId,
  regionIdSchema,
  type SpeciesId,
  speciesIdSchema,
} from "../shared/identifiers.js"
import type { Language } from "../shared/language.js"
import { abilitiesCatalog } from "./catalogs/abilities-catalog.js"
import { alolaLocationsCatalog } from "./catalogs/alola-locations-catalog.js"
import { galarLocationsCatalog } from "./catalogs/galar-locations-catalog.js"
import { hoennLocationsCatalog } from "./catalogs/hoenn-locations-catalog.js"
import { johtoLocationsCatalog } from "./catalogs/johto-locations-catalog.js"
import { kalosLocationsCatalog } from "./catalogs/kalos-locations-catalog.js"
import { kantoLocationsCatalog } from "./catalogs/kanto-locations-catalog.js"
import { movesCatalog } from "./catalogs/moves-catalog.js"
import { paldeaLocationsCatalog } from "./catalogs/paldea-locations-catalog.js"
import { pokemonCatalog } from "./catalogs/pokemon-catalog.js"
import { regionalFormsCatalog } from "./catalogs/regional-forms-catalog.js"
import { regionsCatalog } from "./catalogs/regions-catalog.js"
import { sinnohLocationsCatalog } from "./catalogs/sinnoh-locations-catalog.js"
import { unovaLocationsCatalog } from "./catalogs/unova-locations-catalog.js"
import { localizedName } from "./names.js"
import { type GeneratedCatalog, generatedCatalogSchema } from "./schema.js"

type CatalogEncounterSource = {
  readonly pokemonId: string
  readonly minimumLevel: number
  readonly maximumLevel: number
  readonly probability: number
}

type CatalogSpecialSource = {
  readonly specialEncounterId: string
  readonly pokemonId: string
  readonly minimumLevel: number
  readonly maximumLevel: number
}

type RegionalLocationSource = {
  readonly id: string
  readonly localization: Readonly<Record<string, string>>
  readonly encounters?: readonly CatalogEncounterSource[]
  readonly specialEncounters?: readonly CatalogSpecialSource[]
}

type RegionalCatalogSource = {
  readonly starterPokemons: readonly string[]
  readonly championLocationId: string
  readonly locations: readonly RegionalLocationSource[]
  readonly specialEncounters?: readonly CatalogSpecialSource[]
}

const regionalCatalogs: Record<string, RegionalCatalogSource> = {
  alola: alolaLocationsCatalog,
  galar: galarLocationsCatalog,
  hoenn: hoennLocationsCatalog,
  johto: johtoLocationsCatalog,
  kalos: kalosLocationsCatalog,
  kanto: kantoLocationsCatalog,
  paldea: paldeaLocationsCatalog,
  sinnoh: sinnohLocationsCatalog,
  unova: unovaLocationsCatalog,
} as const

function encountersForCatalog(
  catalog: RegionalCatalogSource,
): [string, readonly CatalogEncounterSource[]][] {
  return catalog.locations.map((location) => [location.id, location.encounters ?? []])
}

function specialsForCatalog(catalog: RegionalCatalogSource) {
  const globalSpecials = (catalog.specialEncounters ?? []).map((special) => ({
    id: special.pokemonId,
    specialEncounterId: special.specialEncounterId,
    minimumLevel: special.minimumLevel,
    maximumLevel: special.maximumLevel,
    fixedLocationId: null,
  }))
  const locationSpecials = catalog.locations.flatMap((location) =>
    (location.specialEncounters ?? []).map((special) => ({
      id: special.pokemonId,
      specialEncounterId: special.specialEncounterId,
      minimumLevel: special.minimumLevel,
      maximumLevel: special.maximumLevel,
      fixedLocationId: location.id,
    })),
  )
  return [...globalSpecials, ...locationSpecials]
}

const pokemonById = new Map(
  [...pokemonCatalog, ...regionalFormsCatalog].map((pokemon) => [pokemon.id, pokemon]),
)
const abilityById = new Map(abilitiesCatalog.map((ability) => [ability.id, ability]))

function englishAbilityName(abilityId: string | undefined): string | undefined {
  const ability = abilityId === undefined ? undefined : abilityById.get(abilityId)
  return ability === undefined ? undefined : localizedName(ability.localization, "en", ability.id)
}

const catalog = generatedCatalogSchema.parse({
  regions: regionsCatalog.map((region) => {
    const regionalCatalog = regionalCatalogs[region.id]
    if (regionalCatalog === undefined) throw new Error(`Missing ${region.id} regional catalog`)
    const locations = regionalCatalog.locations
    const encounterRows = new Map(encountersForCatalog(regionalCatalog))

    return {
      id: region.id,
      localization: region.localization,
      starterSpeciesIds: regionalCatalog.starterPokemons,
      starterCatchLocationId: locations[0]?.id ?? "",
      championLocationId: regionalCatalog.championLocationId,
      specials: specialsForCatalog(regionalCatalog).flatMap((special) => {
        const pokemon = pokemonById.get(special.id)
        const ability = englishAbilityName(pokemon?.abilities[0])
        return pokemon === undefined || ability === undefined
          ? []
          : [
              {
                id: pokemon.id,
                localization: pokemon.localization,
                availableGenders: pokemon.availableGenders,
                specialEncounterId: special.specialEncounterId,
                ability,
                minimumLevel: special.minimumLevel,
                maximumLevel: special.maximumLevel,
                weight: 1,
                spriteUrl: pokemon.sprites.default.normal,
                fixedLocationId: special.fixedLocationId,
              },
            ]
      }),
      locations: locations.map((location) => ({
        id: location.id,
        localization: location.localization,
        encounterless: (encounterRows.get(location.id) ?? []).length === 0,
      })),
    }
  }),
  species: pokemonCatalog,
  regionalForms: regionalFormsCatalog,
  encounters: Object.assign(
    {},
    ...Object.values(regionalCatalogs).map((regionalCatalog) =>
      Object.fromEntries(
        encountersForCatalog(regionalCatalog).map(([locationId, encounters]) => [
          locationId,
          encounters.flatMap((encounter) => {
            const pokemon = pokemonById.get(encounter.pokemonId)
            const ability = englishAbilityName(pokemon?.abilities[0])
            return pokemon === undefined || ability === undefined
              ? []
              : [
                  {
                    id: pokemon.id,
                    localization: pokemon.localization,
                    availableGenders: pokemon.availableGenders,
                    ability,
                    minimumLevel: encounter.minimumLevel,
                    maximumLevel: encounter.maximumLevel,
                    weight: encounter.probability,
                    spriteUrl: pokemon.sprites.default.normal,
                  },
                ]
          }),
        ]),
      ),
    ),
  ),
})
export const generatedContentCatalog = catalog
// The unlock-pacing curve is anchored on each region's champion location, so a
// bad id would silently distort progression: fail fast at load instead.
const championIndexByRegion = new Map<string, number>(
  catalog.regions.map((region) => {
    const index = region.locations.findIndex(
      (location) => location.id === region.championLocationId,
    )
    if (index < 0) throw new Error(`Unknown championLocationId ${region.championLocationId}`)
    return [region.id, index]
  }),
)
const regionsById = new Map(catalog.regions.map((region) => [region.id, region]))
const speciesById = new Map(
  [...catalog.species, ...catalog.regionalForms].map((species) => [species.id, species]),
)
const movesById = new Map(movesCatalog.map((move) => [move.id, move]))
const locationsById = new Map(
  catalog.regions.flatMap((region) =>
    region.locations.map((location) => [location.id, location] as const),
  ),
)
const abilitiesByEnglishName = new Map(
  abilitiesCatalog.map(
    (ability) => [localizedName(ability.localization, "en", ability.id), ability] as const,
  ),
)

export type Region = { readonly id: RegionId; readonly name: string }

export type Location = {
  readonly id: LocationId
  readonly regionId: RegionId
  readonly name: string
}

export function baseSpeciesIdFor(speciesId: string): string {
  return catalog.regionalForms.find((form) => form.id === speciesId)?.baseSpeciesId ?? speciesId
}

export function localizedSpeciesName(speciesId: string, language: Language = "en"): string {
  return localizedPokemonName(speciesId, language, speciesId)
}

export function localizedPokemonName(
  speciesId: string,
  language: Language,
  fallback: string,
): string {
  const species = speciesById.get(speciesId)
  return species === undefined ? fallback : localizedName(species.localization, language, fallback)
}

export function localizedMoveName(moveId: string, language: Language, fallback: string): string {
  const move = movesById.get(moveId)
  return move === undefined ? fallback : localizedName(move.localization, language, fallback)
}

export function moveDetails(moveId: string) {
  return movesById.get(moveId)
}

export function localizedAbilityName(
  englishName: string,
  language: Language,
  fallback: string,
): string {
  const ability = abilitiesByEnglishName.get(englishName)
  return ability === undefined ? fallback : localizedName(ability.localization, language, fallback)
}

export function localizedLocationName(
  locationId: string,
  language: Language,
  fallback: string,
): string {
  const location = locationsById.get(locationId)
  return location === undefined
    ? fallback
    : localizedName(location.localization, language, fallback)
}

export function regionalFormIdsForSpecies(speciesId: string): readonly string[] {
  return catalog.regionalForms
    .filter((form) => form.baseSpeciesId === speciesId)
    .map((form) => form.id)
}

export type CatalogLocation = Location & {
  readonly encounterless: boolean
}

export type CatalogStarter = {
  readonly speciesId: SpeciesId
  readonly name: string
  readonly ability: string
  readonly spriteUrl: string
  readonly initialMoves: readonly { readonly id: string; readonly name: string }[]
}

export type CatalogWildSpecies = {
  readonly speciesId: SpeciesId
  readonly availableGenders: readonly AvailablePokemonGender[]
  readonly name: string
  readonly ability: string
  readonly minimumLevel: number
  readonly maximumLevel: number
  readonly weight: number
  readonly spriteUrl: string
}

export type CatalogSpecialEncounter = CatalogWildSpecies & {
  readonly specialEncounterId: string
}

export function regions(language: Language = "en"): readonly Region[] {
  return catalog.regions.map((region) => ({
    id: regionIdSchema.parse(region.id),
    name: localizedName(region.localization, language, region.id),
  }))
}

export function locationsForRegion(
  regionId: string,
  language: Language = "en",
): readonly CatalogLocation[] {
  return (
    regionsById.get(regionId)?.locations.map((location) => ({
      id: locationIdSchema.parse(location.id),
      regionId: regionIdSchema.parse(regionId),
      name: localizedName(location.localization, language, location.id),
      encounterless: location.encounterless,
    })) ?? []
  )
}

export function findLocation(locationId: string): CatalogLocation | null {
  return (
    catalog.regions
      .flatMap((region) => locationsForRegion(region.id))
      .find((location) => location.id === locationId) ?? null
  )
}

export function nextLocation(regionId: string, locationId: string): CatalogLocation | null {
  const locations = locationsForRegion(regionId)
  const index = locations.findIndex((location) => location.id === locationId)
  return index < 0 ? null : (locations[index + 1] ?? null)
}

/** Index of the region's champion location; anchors the unlock-pacing curve. */
export function championIndexForRegion(regionId: string): number | null {
  return championIndexByRegion.get(regionId) ?? null
}

export function locationIndexFor(regionId: string, locationId: string): number | null {
  const index = locationsForRegion(regionId).findIndex((location) => location.id === locationId)
  return index < 0 ? null : index
}

export function startersForRegion(
  regionId: string,
  language: Language = "en",
): readonly CatalogStarter[] {
  return (
    regionsById.get(regionId)?.starterSpeciesIds.flatMap((speciesId) => {
      const species = speciesById.get(speciesId)
      return species === undefined
        ? []
        : [
            {
              speciesId: speciesIdSchema.parse(species.id),
              name: localizedName(species.localization, language, species.id),
              ability: englishAbilityName(species.abilities[0]) ?? "Unknown",
              spriteUrl: species.sprites.default.normal,
              initialMoves: species.learnset
                .filter((move) => move.level <= 5)
                .slice(-4)
                .flatMap((move) => {
                  const catalogMove = movesById.get(move.id)
                  return catalogMove === undefined
                    ? []
                    : [
                        {
                          id: catalogMove.id,
                          name: localizedName(catalogMove.localization, language, catalogMove.id),
                        },
                      ]
                }),
            },
          ]
    }) ?? []
  )
}

export function findStarter(
  regionId: string,
  speciesId: string,
  language: Language = "en",
): CatalogStarter | null {
  return (
    startersForRegion(regionId, language).find((starter) => starter.speciesId === speciesId) ?? null
  )
}

export function ordinaryEncountersForLocation(locationId: string): readonly CatalogWildSpecies[] {
  return (catalog.encounters[locationId] ?? []).map(toWildSpecies)
}

export function specialEncountersForRegion(
  regionId: string,
  locationId?: string,
): readonly CatalogSpecialEncounter[] {
  return (regionsById.get(regionId)?.specials ?? [])
    .filter(
      (special) =>
        special.fixedLocationId === null ||
        locationId === undefined ||
        special.fixedLocationId === locationId,
    )
    .map((special) => ({
      ...toWildSpecies(special),
      specialEncounterId: special.specialEncounterId,
    }))
}

/** Location previews exclude roaming specials, which are not tied to any location. */
export function fixedSpecialEncountersForLocation(
  regionId: string,
  locationId: string,
): readonly CatalogSpecialEncounter[] {
  return (regionsById.get(regionId)?.specials ?? [])
    .filter((special) => special.fixedLocationId === locationId)
    .map((special) => ({
      ...toWildSpecies(special),
      specialEncounterId: special.specialEncounterId,
    }))
}

export function speciesProgression(speciesId: string): {
  readonly growthRate: GeneratedCatalog["species"][number]["growthRate"]
  readonly learnset: readonly {
    readonly level: number
    readonly id: string
    readonly name: string
  }[]
  readonly evolutions: readonly {
    readonly targetSpeciesId: string
    readonly name: string
    readonly method: GeneratedCatalog["species"][number]["evolutions"][number]["method"]
    readonly conditions: GeneratedCatalog["species"][number]["evolutions"][number]["conditions"]
  }[]
} | null {
  const species = speciesById.get(speciesId)
  return species === undefined
    ? null
    : {
        growthRate: species.growthRate,
        learnset: species.learnset.flatMap((move) => {
          const catalogMove = movesById.get(move.id)
          return catalogMove === undefined
            ? []
            : [
                {
                  id: catalogMove.id,
                  name: localizedName(catalogMove.localization, "en", catalogMove.id),
                  level: move.level,
                },
              ]
        }),
        evolutions: species.evolutions.flatMap((evolution) => {
          const target = speciesById.get(evolution.targetSpeciesId)
          return target === undefined
            ? []
            : [
                {
                  targetSpeciesId: evolution.targetSpeciesId,
                  name: localizedName(target.localization, "en", target.id),
                  method: evolution.method,
                  conditions: evolution.conditions,
                },
              ]
        }),
      }
}

export function nationalDex(language: Language = "en"): readonly {
  number: number
  speciesId: SpeciesId
  name: string
}[] {
  return catalog.species.map((species) => ({
    number: species.pokedexNumber,
    speciesId: speciesIdSchema.parse(species.id),
    name: localizedName(species.localization, language, species.id),
  }))
}

function toWildSpecies(
  species: GeneratedCatalog["encounters"][string][number],
): CatalogWildSpecies {
  return {
    speciesId: speciesIdSchema.parse(species.id),
    name: localizedName(species.localization, "en", species.id),
    availableGenders: species.availableGenders,
    ability: species.ability,
    minimumLevel: species.minimumLevel,
    maximumLevel: species.maximumLevel,
    weight: species.weight,
    spriteUrl: species.spriteUrl,
  }
}
