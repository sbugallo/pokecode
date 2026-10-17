import { z } from "zod"

export const pokemonIdSchema = z.string().uuid().brand<"PokemonId">()
export type PokemonId = z.infer<typeof pokemonIdSchema>

export const trainerIdSchema = z.string().uuid().brand<"TrainerId">()
export type TrainerId = z.infer<typeof trainerIdSchema>

export const regionIdSchema = z.string().min(1).brand<"RegionId">()
export type RegionId = z.infer<typeof regionIdSchema>

export const locationIdSchema = z.string().min(1).brand<"LocationId">()
export type LocationId = z.infer<typeof locationIdSchema>

export const speciesIdSchema = z.string().min(1).brand<"SpeciesId">()
export type SpeciesId = z.infer<typeof speciesIdSchema>
