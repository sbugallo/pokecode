import { z } from "zod"
import { pokemonIdSchema, speciesIdSchema, type TrainerId } from "../shared/identifiers.js"
import { evsSchema, ivsSchema, moveSchema, pokemonGenderSchema } from "./types.js"

export const pokemonInstanceSchema = z.object({
  id: pokemonIdSchema,
  speciesId: speciesIdSchema,
  name: z.string().min(1),
  gender: pokemonGenderSchema.default("genderless"),
  level: z.number().int().min(1).max(100),
  experience: z.number().nonnegative(),
  ability: z.string().min(1),
  nature: z.string().min(1),
  shiny: z.boolean(),
  ivs: ivsSchema,
  evs: evsSchema,
  moves: z.array(moveSchema).max(4),
})
export type PokemonInstance = z.infer<typeof pokemonInstanceSchema>

export type PC = {
  readonly trainerId: TrainerId
  readonly pokemon: readonly PokemonInstance[]
}
