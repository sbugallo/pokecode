import type { EncounterKind } from "../encounters/encounter.js"
import type { PokemonGender } from "../pokemon/types.js"
import { locationIdSchema, type SpeciesId, speciesIdSchema } from "../shared/identifiers.js"

type WildSpecies = {
  readonly speciesId: SpeciesId
  readonly name: string
  readonly ability: string
  readonly minimumLevel: number
  readonly maximumLevel: number
  readonly weight: number
  readonly gender: PokemonGender | null
  readonly spriteUrl: string
}

export type EncounterTable = {
  readonly locationId: string
  readonly species: readonly WildSpecies[]
}

export type SpecialEncounter = WildSpecies & {
  readonly kind: Extract<EncounterKind, "special">
  readonly locationId: string
}

const spriteUrl = (id: number): string =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/${id}.png`

export const kantoEncounterTables: readonly EncounterTable[] = [
  {
    locationId: locationIdSchema.parse("route-1"),
    species: [
      {
        speciesId: speciesIdSchema.parse("pidgey"),
        name: "Pidgey",
        ability: "Keen Eye",
        minimumLevel: 2,
        maximumLevel: 5,
        weight: 50,
        gender: null,
        spriteUrl: spriteUrl(16),
      },
      {
        speciesId: speciesIdSchema.parse("rattata"),
        name: "Rattata",
        ability: "Run Away",
        minimumLevel: 2,
        maximumLevel: 4,
        weight: 50,
        gender: null,
        spriteUrl: spriteUrl(19),
      },
    ],
  },
  {
    locationId: locationIdSchema.parse("viridian-forest"),
    species: [
      {
        speciesId: speciesIdSchema.parse("caterpie"),
        name: "Caterpie",
        ability: "Shield Dust",
        minimumLevel: 3,
        maximumLevel: 5,
        weight: 50,
        gender: null,
        spriteUrl: spriteUrl(10),
      },
      {
        speciesId: speciesIdSchema.parse("weedle"),
        name: "Weedle",
        ability: "Shield Dust",
        minimumLevel: 3,
        maximumLevel: 5,
        weight: 50,
        gender: null,
        spriteUrl: spriteUrl(13),
      },
    ],
  },
] as const

export const kantoSpecialEncounters: readonly SpecialEncounter[] = [
  {
    kind: "special",
    locationId: locationIdSchema.parse("cerulean-cave"),
    speciesId: speciesIdSchema.parse("mewtwo"),
    name: "Mewtwo",
    ability: "Pressure",
    minimumLevel: 70,
    maximumLevel: 70,
    weight: 1,
    gender: "genderless",
    spriteUrl: spriteUrl(150),
  },
] as const

export function findKantoEncounterTable(locationId: string): EncounterTable | null {
  return kantoEncounterTables.find((table) => table.locationId === locationId) ?? null
}

export function findKantoSpecialEncounter(locationId: string): SpecialEncounter | null {
  return kantoSpecialEncounters.find((encounter) => encounter.locationId === locationId) ?? null
}
