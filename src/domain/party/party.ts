import { z } from "zod"
import { pokemonInstanceSchema } from "../pokemon/model.js"
import type { TrainerId } from "../shared/identifiers.js"

export const partySlotSchema = z.object({
  position: z.number().int().min(1).max(6),
  pokemon: pokemonInstanceSchema.nullable(),
})
export type PartySlot = z.infer<typeof partySlotSchema>

export type Party = {
  readonly trainerId: TrainerId
  readonly slots: readonly PartySlot[]
}

export type PartyReplacementFacts = {
  readonly pokemonIds: readonly string[]
  readonly ownedPokemonCount?: number
  readonly maximumSize?: number
}

export type PartyValidation =
  | { readonly valid: true; readonly pokemonIds: readonly string[] }
  | { readonly valid: false; readonly reason: "empty" | "too-large" | "duplicate" | "not-owned" }

export function validatePartyReplacement(facts: PartyReplacementFacts): PartyValidation {
  const maximumSize = facts.maximumSize ?? 6
  if (facts.pokemonIds.length === 0) return { valid: false, reason: "empty" }
  if (facts.pokemonIds.length > maximumSize) return { valid: false, reason: "too-large" }
  if (new Set(facts.pokemonIds).size !== facts.pokemonIds.length)
    return { valid: false, reason: "duplicate" }
  if (facts.ownedPokemonCount !== undefined && facts.ownedPokemonCount !== facts.pokemonIds.length)
    return { valid: false, reason: "not-owned" }
  return { valid: true, pokemonIds: facts.pokemonIds }
}
