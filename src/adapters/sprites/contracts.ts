import { z } from "zod"
import { pokemonGenderSchema } from "../../domain/pokemon/types.js"

export const spriteInputSchema = z.object({
  speciesId: z.string().min(1),
  shiny: z.boolean(),
  gender: pokemonGenderSchema,
})
export type SpriteInput = z.infer<typeof spriteInputSchema>

export type SpriteResolver = (
  speciesId: string,
  shiny: boolean,
  gender: SpriteInput["gender"],
) => Promise<SpriteResolution>

export const spriteResolutionSchema = z.union([
  z.object({ kind: z.literal("cached"), source: z.string().min(1) }),
  z.object({ kind: z.literal("placeholder") }),
])
export type SpriteResolution = z.infer<typeof spriteResolutionSchema>
