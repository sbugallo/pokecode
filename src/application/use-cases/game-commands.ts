import { createChoiceCommands } from "./choices.js"
import { createEncounterCommands } from "./encounters.js"
import type { GameCommandDependencies } from "./game-command-support.js"
import { createPartyCommands } from "./party.js"
import { createTravelCommands } from "./travel.js"

/** Composes feature-owned command workflows without owning their decisions. */
export function createGameCommands(dependencies: GameCommandDependencies) {
  return {
    ...createEncounterCommands(dependencies),
    ...createPartyCommands(dependencies),
    ...createTravelCommands(dependencies),
    ...createChoiceCommands(dependencies),
  }
}
