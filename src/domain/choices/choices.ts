import { z } from "zod"
import { moveSchema } from "../pokemon/types.js"

export const moveChoicePayloadSchema = z.object({
  pokemonId: z.string().uuid(),
  move: moveSchema,
})

export const evolutionChoiceOptionsSchema = z
  .array(z.object({ speciesId: z.string().min(1), name: z.string().min(1) }))
  .min(2)

export const evolutionChoicePayloadSchema = z.object({
  pokemonId: z.string().uuid(),
  options: evolutionChoiceOptionsSchema,
})
/** Keep the source Pokémon identity alongside its available evolutions. */
export const evolutionChoiceProjectionSchema = evolutionChoicePayloadSchema

export const regionChoicePayloadSchema = z.object({ region: z.string().min(1) })
export const starterChoicePayloadSchema = z.object({ region: z.string().min(1) })
export const catchChoicePayloadSchema = z.object({ encounterId: z.string().uuid() }).strict()

export const choicePayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("move"), payload: moveChoicePayloadSchema }),
  z.object({ kind: z.literal("evolution"), payload: evolutionChoicePayloadSchema }),
  z.object({ kind: z.literal("region"), payload: regionChoicePayloadSchema }),
  z.object({ kind: z.literal("starter"), payload: starterChoicePayloadSchema }),
  z.object({ kind: z.literal("catch"), payload: catchChoicePayloadSchema }),
])
export type DomainChoice = z.infer<typeof choicePayloadSchema>

/** Invalid payload shapes return null; corrupt JSON throws instead of hiding save corruption. */
export function decodeChoicePayload(kind: string, payload: string): DomainChoice | null {
  if (!knownChoiceKinds.has(kind)) return null
  const parsed: unknown = JSON.parse(payload)
  const result = choicePayloadSchema.safeParse({ kind, payload: parsed })
  return result.success ? result.data : null
}

export function encodeChoicePayload(choice: DomainChoice): string {
  return JSON.stringify(choice.payload)
}

export function decodeMoveChoiceProjection(
  payload: string,
): z.infer<typeof moveChoicePayloadSchema> | null {
  return parsePayload(moveChoicePayloadSchema, payload)
}

export function decodeRegionChoiceProjection(
  payload: string,
): z.infer<typeof regionChoicePayloadSchema> | null {
  return parsePayload(regionChoicePayloadSchema, payload)
}

export function decodeStarterChoiceProjection(
  payload: string,
): z.infer<typeof starterChoicePayloadSchema> | null {
  return parsePayload(starterChoicePayloadSchema, payload)
}

export function decodeEvolutionChoiceProjection(
  payload: string,
): z.infer<typeof evolutionChoiceProjectionSchema> | null {
  return parsePayload(evolutionChoiceProjectionSchema, payload)
}

function parsePayload<Schema extends z.ZodType>(
  schema: Schema,
  payload: string,
): z.infer<Schema> | null {
  const parsed = schema.safeParse(JSON.parse(payload))
  return parsed.success ? parsed.data : null
}

const knownChoiceKinds = new Set(["move", "evolution", "region", "starter", "catch"])
