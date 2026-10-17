import { z } from "zod"
import {
  type AvailablePokemonGender,
  type PokemonGender,
  pokemonGenderSchema,
} from "../pokemon/types.js"
import { speciesIdSchema } from "../shared/identifiers.js"

export const encounterKindSchema = z.enum(["ordinary", "special"])
export type EncounterKind = z.infer<typeof encounterKindSchema>

export const pendingEncounterSchema = z.object({
  id: z.string().uuid(),
  kind: encounterKindSchema,
  speciesId: speciesIdSchema,
  name: z.string().min(1),
  level: z.number().int().min(1).max(100),
  gender: pokemonGenderSchema,
  shiny: z.boolean(),
  spriteUrl: z.string().url(),
})
export type PendingEncounter = z.infer<typeof pendingEncounterSchema>

export type RandomSource = () => number
export type EncounterCandidate = {
  readonly minimumLevel: number
  readonly maximumLevel: number
  readonly weight: number
}
export type SpecialCandidate = EncounterCandidate & { readonly specialEncounterId: string }
export type GeneratedEncounterAttributes = {
  readonly level: number
  readonly gender: PokemonGender
  readonly shiny: boolean
}
export type CapturedAttributes = {
  readonly nature: string
  readonly ivs: readonly [number, number, number, number, number, number]
}

export function randomInteger(minimum: number, maximum: number, random: RandomSource): number {
  return minimum + Math.min(Math.floor(random() * (maximum - minimum + 1)), maximum - minimum)
}

export function randomEncounterInterval(
  minimumTokens: number,
  maximumTokens: number,
  random: RandomSource,
): number {
  return randomInteger(minimumTokens, maximumTokens, random)
}

export function selectWeightedEncounter<T extends { readonly weight: number }>(
  candidates: readonly T[],
  random: RandomSource,
): T | null {
  const totalWeight = candidates.reduce((total, candidate) => total + candidate.weight, 0)
  if (totalWeight === 0) return null
  let remaining = random() * totalWeight
  for (const candidate of candidates) {
    remaining -= candidate.weight
    if (remaining < 0) return candidate
  }
  return candidates.at(-1) ?? null
}

export function selectSpecialEncounter<T extends SpecialCandidate>(
  candidates: readonly T[],
  random: RandomSource,
): T | null {
  const roll = candidates.length > 0 ? random() : 1
  return roll < candidates.length * 0.01
    ? (candidates[Math.min(Math.floor(roll * 100), candidates.length - 1)] ?? null)
    : null
}

export function eligibleOrdinaryEncounters<T extends EncounterCandidate>(
  candidates: readonly T[],
  maximumLevel: number,
): readonly (T & { readonly maximumLevel: number })[] {
  return candidates
    .filter((candidate) => candidate.minimumLevel <= maximumLevel)
    .map((candidate) => ({
      ...candidate,
      maximumLevel: Math.min(candidate.maximumLevel, maximumLevel),
    }))
}

export function eligibleSpecialEncounters<T extends SpecialCandidate>(
  candidates: readonly T[],
  maximumLevel: number,
  alreadyTriggered: ReadonlySet<string>,
): readonly T[] {
  return candidates.filter(
    (candidate) =>
      candidate.minimumLevel <= maximumLevel && !alreadyTriggered.has(candidate.specialEncounterId),
  )
}

export function generateEncounterAttributes(
  minimumLevel: number,
  maximumLevel: number,
  availableGenders: readonly AvailablePokemonGender[],
  random: RandomSource,
): GeneratedEncounterAttributes {
  if (availableGenders.length === 0) throw new Error("Encounter species has no available genders")
  const level = randomInteger(minimumLevel, maximumLevel, random)
  const selectedGender = availableGenders[randomInteger(0, availableGenders.length - 1, random)]
  if (selectedGender === undefined) throw new Error("Invalid encounter gender selection")
  const gender = selectedGender === "unknown" ? "genderless" : selectedGender
  const shiny = random() < 1 / 4096
  return { level, gender, shiny }
}

export function generateCapturedAttributes(
  random: RandomSource,
  natures: readonly string[],
): CapturedAttributes {
  const natureIndex = randomInteger(0, natures.length - 1, random)
  const nature = natures[natureIndex] ?? "Hardy"
  const ivs = [
    randomInteger(0, 31, random),
    randomInteger(0, 31, random),
    randomInteger(0, 31, random),
    randomInteger(0, 31, random),
    randomInteger(0, 31, random),
    randomInteger(0, 31, random),
  ] as const
  return { nature, ivs }
}
