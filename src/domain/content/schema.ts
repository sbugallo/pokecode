import { z } from "zod"
import { availablePokemonGendersSchema } from "../pokemon/types.js"

const namedIdSchema = z.object({
  id: z.string().min(1),
  localization: z.record(z.string().min(1), z.string().min(1)).default({}),
})

const moveSchema = z.object({
  id: z.string().min(1),
  level: z.number().int().min(1).max(100),
})

const evolutionConditionSchema = z.object({
  kind: z.string().min(1),
  value: z.union([z.string().min(1), z.number().int().nonnegative(), z.boolean()]),
})

const evolutionSchema = z.object({
  targetSpeciesId: z.string().min(1),
  method: z.enum(["level", "happiness", "trade", "stone", "other"]),
  conditions: z.array(evolutionConditionSchema),
})

const encounterSpeciesSchema = namedIdSchema.extend({
  availableGenders: availablePokemonGendersSchema,
  ability: z.string().min(1),
  minimumLevel: z.number().int().min(1).max(100),
  maximumLevel: z.number().int().min(1).max(100),
  weight: z.number().positive(),
  spriteUrl: z.string().url(),
})

const specialSchema = encounterSpeciesSchema.extend({
  specialEncounterId: z.string().min(1),
  fixedLocationId: z.string().min(1).nullable(),
})

const locationSchema = namedIdSchema.extend({
  encounterless: z.boolean(),
})

const regionSchema = namedIdSchema.extend({
  locations: z.array(locationSchema).min(1),
  starterSpeciesIds: z.array(z.string().min(1)).length(3),
  starterCatchLocationId: z.string().min(1),
  specials: z.array(specialSchema),
})

const speciesSchema = namedIdSchema.extend({
  availableGenders: availablePokemonGendersSchema,
  pokedexNumber: z.number().int().positive(),
  types: z.array(z.string().min(1)).min(1).max(2),
  baseStats: z.tuple([
    z.number().int().positive(),
    z.number().int().positive(),
    z.number().int().positive(),
    z.number().int().positive(),
    z.number().int().positive(),
    z.number().int().positive(),
  ]),
  abilities: z.array(z.string().min(1)).min(1),
  sprites: z.object({
    default: z.object({ normal: z.string().url(), shiny: z.string().url() }),
    female: z.object({ normal: z.string().url(), shiny: z.string().url() }).nullable(),
  }),
  growthRate: z.enum([
    "fast",
    "medium",
    "medium-slow",
    "slow",
    "slow-then-very-fast",
    "fast-then-very-slow",
  ]),
  learnsetVersionGroup: z.string().min(1).nullable(),
  learnset: z.array(moveSchema),
  evolutions: z.array(evolutionSchema),
})

const regionalFormSchema = speciesSchema.extend({
  baseSpeciesId: z.string().min(1),
  formRegion: z.enum(["alola", "galar", "paldea"]),
  showdownName: z.string().min(1),
})

export const generatedCatalogSchema = z.object({
  regions: z.array(regionSchema).length(9),
  species: z.array(speciesSchema).min(1),
  regionalForms: z.array(regionalFormSchema).default([]),
  encounters: z.record(z.string().min(1), z.array(encounterSpeciesSchema)),
})

export type GeneratedCatalog = z.infer<typeof generatedCatalogSchema>
