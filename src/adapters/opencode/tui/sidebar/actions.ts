import type { Context } from "@opencode/plugin/tui/context"
import { createSignal } from "solid-js"
import type { PendingEncounter } from "../../../../domain/encounters/encounter.js"
import { captureNotification } from "../../../presentation/game-notifications.js"
import type { createPokemonTuiClient } from "../client.js"
import type { createTuiStateCoordinator } from "../state/coordinator.js"

type TuiClient = ReturnType<typeof createPokemonTuiClient>
type TuiState = ReturnType<typeof createTuiStateCoordinator>
type Toast = (options: Parameters<Context["ui"]["toast"]["show"]>[0]) => void

export function createSidebarActions(dependencies: {
  readonly rpc: TuiClient
  readonly state: TuiState
  readonly toast: Toast
}) {
  const [selectingStarter, setSelectingStarter] = createSignal<string | null>(null)
  const [resolvingEncounterId, setResolvingEncounterId] = createSignal<string | null>(null)

  return {
    travelToLocation: async (locationId: string): Promise<void> => {
      const result = await dependencies.rpc.travelTo({ locationId })
      dependencies.state.apply(result.state)
    },
    chooseStarter: async (regionId: string, speciesId: string): Promise<void> => {
      if (selectingStarter() !== null || dependencies.state.isDisposed()) return
      setSelectingStarter(speciesId)
      const result = await dependencies.rpc.chooseStarter({ regionId, speciesId })
      dependencies.state.apply(result.state)
      if (!dependencies.state.isDisposed()) setSelectingStarter(null)
    },
    resolveEncounter: async (
      encounterId: string,
      encounter: PendingEncounter,
      capture: boolean,
    ): Promise<void> => {
      if (resolvingEncounterId() !== null || dependencies.state.isDisposed()) return
      setResolvingEncounterId(encounterId)
      const current = dependencies.state.state()
      const destination = current.party.some((slot) => slot.pokemon === null) ? "party" : "pc"
      try {
        const result = capture
          ? await dependencies.rpc.catchEncounter({ encounterId })
          : await dependencies.rpc.runEncounter({ encounterId })
        dependencies.state.apply(result.state)
        if (!dependencies.state.isDisposed() && result.kind === "caught") {
          dependencies.toast(captureNotification(encounter, destination, result.state.locale))
        }
      } finally {
        if (resolvingEncounterId() === encounterId) setResolvingEncounterId(null)
      }
    },
    resolveMoveChoice: async (choiceId: string, selectedMoveId: string): Promise<void> => {
      const result = await dependencies.rpc.resolveMoveChoice({ choiceId, selectedMoveId })
      dependencies.state.apply(result.state)
    },
    resolveEvolutionChoice: async (choiceId: string, selectedSpeciesId: string): Promise<void> => {
      const result = await dependencies.rpc.resolveEvolutionChoice({ choiceId, selectedSpeciesId })
      dependencies.state.apply(result.state)
    },
    travelToRegion: async (regionId: string): Promise<void> => {
      const result = await dependencies.rpc.travelToRegion({ regionId })
      dependencies.state.apply(result.state)
    },
  }
}
