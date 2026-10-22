import { z } from "zod"
import { pendingEncounterSchema } from "../../domain/encounters/encounter.js"
import { explorationStatusSchema } from "../../domain/exploration/exploration.js"
import { partySlotSchema } from "../../domain/party/party.js"
import { pokemonInstanceSchema } from "../../domain/pokemon/model.js"
import { speciesIdSchema } from "../../domain/shared/identifiers.js"
import { languageSchema } from "../../domain/shared/language.js"

export const pendingChoiceSchema = z.object({
  id: z.string().uuid(),
  kind: z.string().min(1),
  payload: z.string(),
})
export type PendingChoice = z.infer<typeof pendingChoiceSchema>

export const gameStateSchema = z.object({
  phase: z.enum(["onboarding", "active"]),
  locale: languageSchema,
  message: z.string(),
  region: z.string().nullable(),
  location: z.string().nullable(),
  party: z.array(partySlotSchema).length(6),
  pendingChoices: z.array(pendingChoiceSchema),
  pendingEncounterCount: z.number().int().nonnegative().default(0),
  choicePokemon: z.array(pokemonInstanceSchema).default([]),
  pendingEncounter: pendingEncounterSchema
    .extend({ caught: z.boolean().default(false) })
    .nullable()
    .default(null),
  exploration: explorationStatusSchema.nullable().default(null),
})
export type GameState = z.infer<typeof gameStateSchema>

export const starterChoiceInputSchema = z.object({
  regionId: z.string().min(1),
  speciesId: z.string().min(1),
})
export type StarterChoiceInput = z.infer<typeof starterChoiceInputSchema>

export const starterChoiceResultSchema = z.object({
  kind: z.enum(["selected", "invalid-region", "invalid-starter", "already-selected"]),
  state: gameStateSchema,
})
export type StarterChoiceResult = z.infer<typeof starterChoiceResultSchema>

export const gameplayConfigSchema = z.object({
  pauseOnPendingChoice: z.boolean().default(true),
  encounterMinimumTokens: z.number().int().positive().default(200_000),
  encounterMaximumTokens: z.number().int().positive().default(400_000),
  locationUnlockBaseTokens: z.number().int().positive().default(4_214_000),
  locationUnlockExponent: z.number().positive().default(2.64),
  locationUnlockRegionExponent: z.number().default(-1.72),
})
export type GameplayConfig = z.infer<typeof gameplayConfigSchema>

export const usageInputSchema = z.object({
  sessionId: z.string().min(1),
  messageId: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  completedAt: z.string().datetime(),
})
export type UsageInput = z.infer<typeof usageInputSchema>

export const usageApplicationSchema = z.object({
  kind: z.enum(["applied", "duplicate", "frozen-discarded", "inactive"]),
  state: gameStateSchema,
})
export type UsageApplication = z.infer<typeof usageApplicationSchema>

export const locationTravelInputSchema = z.object({ locationId: z.string().min(1) })
export type LocationTravelInput = z.infer<typeof locationTravelInputSchema>
export const locationTravelResultSchema = z.object({
  kind: z.enum(["teleported", "inactive", "invalid-location", "locked-location"]),
  state: gameStateSchema,
})
export type LocationTravelResult = z.infer<typeof locationTravelResultSchema>

export const regionTravelInputSchema = z.object({ regionId: z.string().min(1) })
export type RegionTravelInput = z.infer<typeof regionTravelInputSchema>
export const regionTravelResultSchema = z.object({
  kind: z.enum(["traveled", "inactive", "invalid-region", "already-visited", "region-incomplete"]),
  state: gameStateSchema,
})
export type RegionTravelResult = z.infer<typeof regionTravelResultSchema>

export const encounterResolutionResultSchema = z.object({
  kind: z.enum(["caught", "ran", "inactive", "no-encounter"]),
  state: gameStateSchema,
})
export type EncounterResolutionResult = z.infer<typeof encounterResolutionResultSchema>

export const partyReplacementInputSchema = z.object({
  pokemonIds: z.array(z.string().uuid()).min(1).max(6),
})
export type PartyReplacementInput = z.infer<typeof partyReplacementInputSchema>
export const partyReplacementResultSchema = z.object({
  kind: z.enum(["replaced", "inactive", "invalid-party"]),
  state: gameStateSchema,
})
export type PartyReplacementResult = z.infer<typeof partyReplacementResultSchema>

export const pokemonRenameInputSchema = z.object({
  pokemonId: z.string().uuid(),
  name: z.string(),
})
export type PokemonRenameInput = z.infer<typeof pokemonRenameInputSchema>
export const pokemonReleaseInputSchema = z.object({ pokemonId: z.string().uuid() })
export type PokemonReleaseInput = z.infer<typeof pokemonReleaseInputSchema>
export const pokemonManagementResultSchema = z.object({
  kind: z.enum([
    "renamed",
    "released",
    "inactive",
    "invalid-pokemon",
    "invalid-name",
    "last-party-pokemon",
  ]),
  state: gameStateSchema,
})
export type PokemonManagementResult = z.infer<typeof pokemonManagementResultSchema>

export const moveChoiceInputSchema = z.object({
  choiceId: z.string().uuid(),
  selectedMoveId: z.string().min(1),
})
export type MoveChoiceInput = z.infer<typeof moveChoiceInputSchema>
export const evolutionChoiceInputSchema = z.object({
  choiceId: z.string().uuid(),
  selectedSpeciesId: z.string().min(1),
})
export type EvolutionChoiceInput = z.infer<typeof evolutionChoiceInputSchema>
export const choiceResolutionResultSchema = z.object({
  kind: z.enum(["resolved", "inactive", "invalid-choice"]),
  state: gameStateSchema,
})
export type ChoiceResolutionResult = z.infer<typeof choiceResolutionResultSchema>

export type ChoiceResolution = ChoiceResolutionResult

export const pokemonCollectionSchema = z.object({ pokemon: z.array(pokemonInstanceSchema) })
export type PokemonCollection = z.infer<typeof pokemonCollectionSchema>
export const pokedexEntrySchema = z.object({
  number: z.number().int().positive(),
  speciesId: speciesIdSchema,
  name: z.string().min(1),
  status: z.enum(["caught", "seen", "unknown"]),
})
export type PokedexEntry = z.infer<typeof pokedexEntrySchema>
export const pokemonDexSchema = z.object({
  pokemon: z.array(pokedexEntrySchema),
  /** Exact species/form discoveries, separate from the aggregated National Dex rows. */
  discoveries: z.array(
    z.object({
      speciesId: speciesIdSchema,
      status: z.enum(["caught", "seen"]),
    }),
  ),
})
export type PokemonDex = z.infer<typeof pokemonDexSchema>
export const teamExportSchema = z.object({
  kind: z.enum(["exported", "inactive"]),
  text: z.string(),
})
export type TeamExport = z.infer<typeof teamExportSchema>
