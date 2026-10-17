import { generateCapturedAttributes } from "../../domain/encounters/encounter.js"
import { initialMoves } from "../../domain/progression/catalog.js"
import type { EncounterResolutionResult } from "../contracts/game.js"
import {
  afterGameTransaction,
  type GameCommandDependencies,
  resumeSavedExperienceIfUnblocked,
} from "./game-command-support.js"

const captureNatures = ["Hardy", "Lonely", "Brave", "Adamant", "Naughty"] as const

export function createEncounterCommands(dependencies: GameCommandDependencies) {
  const resolveEncounter = (
    encounterId: string,
    random: (() => number) | null,
  ): EncounterResolutionResult =>
    afterGameTransaction(dependencies, (stores) => {
      const trainer = stores.trainers.find()
      if (trainer === null) return "inactive"
      const encounter = stores.commands.encounters.pending(trainer.id, encounterId)
      if (encounter === null) return "no-encounter"
      if (random !== null) {
        const id = dependencies.createId()
        const generated = generateCapturedAttributes(random, captureNatures)
        stores.commands.pokemon.insertCaptured({
          id,
          trainerId: trainer.id,
          encounter,
          nature: generated.nature,
          ivs: generated.ivs,
          moves: initialMoves(encounter.speciesId, encounter.level),
        })
        stores.commands.pokemon.markCaught(trainer.id, encounter.speciesId)
        const position = stores.commands.pokemon.firstEmptyPartyPosition(trainer.id)
        if (position !== null) stores.commands.pokemon.assignPartyPosition(trainer.id, id, position)
      }
      stores.commands.encounters.clearPending(trainer.id, encounterId)
      stores.commands.choices.deleteCatch(trainer.id, encounterId)
      resumeSavedExperienceIfUnblocked(dependencies, stores, trainer.id, trainer.regionId)
      return random === null ? "ran" : "caught"
    })

  return {
    catchEncounter: (encounterId: string, random: () => number) =>
      resolveEncounter(encounterId, random),
    runEncounter: (encounterId: string) => resolveEncounter(encounterId, null),
  }
}
