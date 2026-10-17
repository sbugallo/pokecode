import { decodeStarterChoiceProjection } from "../../domain/choices/choices.js"
import { findStarter, locationsForRegion } from "../../domain/content/catalog.js"
import { generateStarter } from "../../domain/pokemon/starter.js"
import type { StarterChoiceResult } from "../contracts/game.js"
import {
  afterGameTransaction,
  type GameCommandDependencies,
  resumeSavedExperienceIfUnblocked,
} from "./game-command-support.js"

export function createChooseRegionalStarter(
  dependencies: GameCommandDependencies,
  random: () => number,
) {
  return (regionId: string, speciesId: string): StarterChoiceResult => {
    const state = dependencies.readState()
    const pending = state.pendingChoices.find(
      (choice) =>
        choice.kind === "starter" &&
        decodeStarterChoiceProjection(choice.payload)?.region === regionId,
    )
    if (pending === undefined) return { kind: "already-selected", state }
    if (locationsForRegion(regionId)[0] === undefined) return { kind: "invalid-region", state }
    const template = findStarter(regionId, speciesId)
    if (template === null) return { kind: "invalid-starter", state }
    const starter = generateStarter(template, random)

    return afterGameTransaction(dependencies, (stores) => {
      const trainer = stores.trainers.find()
      if (trainer === null) return "already-selected"
      const choice = stores.commands.choices.find(trainer.id, pending.id, "starter")
      if (choice?.kind !== "starter" || choice.payload.region !== regionId)
        return "already-selected"
      const id = dependencies.createId()
      stores.commands.pokemon.insertStarter({ id, trainerId: trainer.id, starter })
      stores.commands.pokemon.markCaught(trainer.id, starter.speciesId)
      const position = stores.commands.pokemon.firstEmptyPartyPosition(trainer.id)
      if (position !== null) stores.commands.pokemon.assignPartyPosition(trainer.id, id, position)
      stores.commands.choices.delete(choice.id)
      resumeSavedExperienceIfUnblocked(dependencies, stores, trainer.id, trainer.regionId)
      return "selected"
    })
  }
}
