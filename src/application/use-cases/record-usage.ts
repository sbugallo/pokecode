import {
  championIndexForRegion,
  locationIndexFor,
  nextLocation,
  ordinaryEncountersForLocation,
  regions,
  specialEncountersForRegion,
} from "../../domain/content/catalog.js"
import {
  eligibleOrdinaryEncounters,
  eligibleSpecialEncounters,
  generateEncounterAttributes,
  randomEncounterInterval,
  selectSpecialEncounter,
  selectWeightedEncounter,
} from "../../domain/encounters/encounter.js"
import {
  calculateUnlockProgress,
  locationUnlockThreshold,
} from "../../domain/exploration/exploration.js"
import {
  experienceFromTokens,
  receiptDisposition,
  totalTokens,
  usageReceiptKey,
} from "../../domain/usage/usage.js"
import type { GameplayConfig, GameState, UsageApplication, UsageInput } from "../contracts/game.js"
import type { UsageTransactionRunner, UsageTransactionStores } from "../ports/game-transaction.js"
import { resolveUsageLevels } from "./resolve-progression.js"

export type RecordUsageDependencies = {
  readonly transactions: UsageTransactionRunner
  readonly readState: () => GameState
  readonly createId: () => string
}

export function createRecordUsage(dependencies: RecordUsageDependencies) {
  return (input: UsageInput, config: GameplayConfig, random: () => number): UsageApplication => {
    const kind = dependencies.transactions.withTransaction((stores) => {
      const trainer = stores.trainers.find()
      const tokenCount = totalTokens(input)
      const inserted = stores.receipts.claim({
        id: usageReceiptKey(input),
        trainerId: trainer?.id ?? null,
        usage: input,
        tokenCount,
      })
      const pending =
        !inserted || trainer === null || !config.pauseOnPendingChoice
          ? false
          : stores.choices.hasPending(trainer.id)
      const disposition = receiptDisposition({
        duplicate: !inserted,
        active: trainer !== null,
        frozen: pending,
      })
      if (disposition !== "applied") return disposition
      if (trainer === null) return "inactive" as const

      stores.pokemon.addPartyExperience(trainer.id, experienceFromTokens(tokenCount))
      resolveUsageLevels(
        stores,
        trainer.id,
        trainer.regionId,
        input.completedAt,
        dependencies.createId,
      )
      advanceLocationUnlock(
        stores,
        trainer,
        tokenCount,
        config,
        input.completedAt,
        dependencies.createId,
      )
      advanceUsageEncounters(
        stores,
        trainer.id,
        input,
        tokenCount,
        config,
        random,
        dependencies.createId,
      )
      return "applied" as const
    })

    // Read after commit so the response only describes committed database state.
    return { kind, state: dependencies.readState() }
  }
}

function advanceLocationUnlock(
  stores: UsageTransactionStores,
  trainer: { readonly id: string; readonly regionId: string; readonly locationId: string },
  tokenCount: number,
  config: GameplayConfig,
  completedAt: string,
  createId: () => string,
): void {
  const latestLocationId = stores.exploration.latestUnlockedLocation(trainer.id)
  if (latestLocationId !== trainer.locationId) return
  const currentTokens = stores.exploration.unlockTokenCount(trainer.id)
  const next = nextLocation(trainer.regionId, trainer.locationId)
  const index = locationIndexFor(trainer.regionId, trainer.locationId)
  const championIndex = championIndexForRegion(trainer.regionId)
  const threshold =
    index === null || championIndex === null
      ? config.locationUnlockBaseTokens
      : locationUnlockThreshold({
          index,
          championIndex,
          curve: {
            baseTokens: config.locationUnlockBaseTokens,
            exponent: config.locationUnlockExponent,
            regionExponent: config.locationUnlockRegionExponent,
          },
        })
  const result = calculateUnlockProgress({
    currentTokens,
    gainedTokens: tokenCount,
    threshold,
    hasNextLocation: next !== null,
    currentLocationIsLatestUnlocked: true,
  })
  if (result.kind === "not-latest") return
  if (result.kind === "complete-region") {
    if (!stores.exploration.completeRegion(trainer.id, trainer.regionId)) return
    const visited = new Set(stores.exploration.visitedRegionIds(trainer.id))
    if (regions().every((region) => visited.has(region.id))) return
    stores.choices.insert({
      id: createId(),
      trainerId: trainer.id,
      kind: "region",
      payload: { region: trainer.regionId },
      createdAt: completedAt,
    })
    return
  }
  if (result.kind === "accumulating") {
    stores.exploration.setUnlockTokenCount(trainer.id, result.tokenCount)
    return
  }
  if (next === null) return
  stores.exploration.unlockLocation(trainer.id, next.id)
  stores.exploration.setUnlockTokenCount(trainer.id, 0)
}

export function advanceUsageEncounters(
  stores: UsageTransactionStores,
  trainerId: string,
  input: UsageInput,
  tokenCount: number,
  config: GameplayConfig,
  random: () => number,
  createId: () => string,
): void {
  if (config.pauseOnPendingChoice && stores.encounters.hasPending(trainerId)) return
  const progress = stores.encounters.progress(trainerId)
  let threshold = progress?.threshold ?? randomInterval(config, random)
  let accumulated = (progress?.tokenCount ?? 0) + tokenCount

  if (!config.pauseOnPendingChoice) {
    while (accumulated >= threshold) {
      accumulated -= threshold
      enqueueEncounterOpportunity(stores, trainerId, input, random, createId)
      threshold = randomInterval(config, random)
    }
    stores.encounters.saveProgress(trainerId, accumulated, threshold)
    return
  }

  if (accumulated < threshold) {
    stores.encounters.saveProgress(trainerId, accumulated, threshold)
    return
  }

  enqueueEncounterOpportunity(stores, trainerId, input, random, createId)
  stores.encounters.saveProgress(trainerId, 0, randomInterval(config, random))
}

function enqueueEncounterOpportunity(
  stores: UsageTransactionStores,
  trainerId: string,
  input: UsageInput,
  random: () => number,
  createId: () => string,
): void {
  const trainer = stores.trainers.findById(trainerId)
  if (trainer !== null) {
    const maxTeamLevel = stores.encounters.maximumPartyLevel(trainerId)
    const triggeredSpecialIds = stores.encounters.triggeredSpecialIds(trainerId)
    const specials = eligibleSpecialEncounters(
      specialEncountersForRegion(trainer.regionId, trainer.locationId),
      maxTeamLevel,
      triggeredSpecialIds,
    )
    const ordinary = eligibleOrdinaryEncounters(
      ordinaryEncountersForLocation(trainer.locationId),
      maxTeamLevel,
    )
    const selectedSpecial = selectSpecialEncounter(specials, random)
    const selected = selectedSpecial ?? selectWeightedEncounter(ordinary, random)
    if (selected !== null) {
      const generated = generateEncounterAttributes(
        selected.minimumLevel,
        Math.min(selected.maximumLevel, maxTeamLevel),
        selected.availableGenders,
        random,
      )
      if (selectedSpecial !== null) {
        stores.encounters.markSpecialTriggered(
          trainer.id,
          selectedSpecial.specialEncounterId,
          input.completedAt,
        )
      }
      const encounterId = createId()
      stores.encounters.insertPending({
        id: encounterId,
        trainerId: trainer.id,
        kind: selectedSpecial !== null ? "special" : "ordinary",
        speciesId: selected.speciesId,
        name: selected.name,
        specialEncounterId: selectedSpecial?.specialEncounterId ?? null,
        level: generated.level,
        gender: generated.gender,
        shiny: generated.shiny,
        spriteUrl: selected.spriteUrl,
        ability: selected.ability,
        createdAt: input.completedAt,
      })
      stores.choices.insert({
        id: createId(),
        trainerId: trainer.id,
        kind: "catch",
        payload: { encounterId },
        createdAt: input.completedAt,
      })
      // Preserve the original pair of equivalent upserts and their ordering.
      stores.pokemon.markSeen(trainer.id, selected.speciesId)
      stores.pokemon.markSeen(trainer.id, selected.speciesId)
    }
  }
}

function randomInterval(config: GameplayConfig, random: () => number): number {
  return randomEncounterInterval(
    config.encounterMinimumTokens,
    config.encounterMaximumTokens,
    random,
  )
}
