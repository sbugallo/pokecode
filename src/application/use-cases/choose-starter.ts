import { generateStarter, type StarterTemplate } from "../../domain/pokemon/starter.js"
import type { StarterChoiceResult } from "../contracts/starter-choice.js"
import type {
  StarterGameState,
  StarterIdGenerator,
  StarterSelectionStore,
} from "../ports/starter-selection-store.js"

export type ChooseStarterDependencies<TState extends StarterGameState> = {
  readonly store: StarterSelectionStore<TState>
  readonly random: () => number
  readonly now: () => string
  readonly createIds: StarterIdGenerator
  readonly firstLocationForRegion: (regionId: string) => { readonly id: string } | undefined
  readonly findStarter: (regionId: string, speciesId: string) => StarterTemplate | null
}

export function createChooseStarter<TState extends StarterGameState>({
  store,
  random,
  now,
  createIds,
  firstLocationForRegion,
  findStarter,
}: ChooseStarterDependencies<TState>) {
  return (regionId: string, speciesId: string): StarterChoiceResult<TState> => {
    const state = store.readState()
    if (state.phase === "active") return { kind: "already-selected", state }

    const firstLocation = firstLocationForRegion(regionId)
    if (firstLocation === undefined) return { kind: "invalid-region", state }

    const starter = findStarter(regionId, speciesId)
    if (starter === null) return { kind: "invalid-starter", state }

    const creation = generateStarter(starter, random)
    const selected = store.createStarterAtomically(
      {
        regionId,
        locationId: firstLocation.id,
        ...creation,
        selectedAt: now(),
      },
      createIds,
    )
    return {
      kind: selected ? "selected" : "already-selected",
      state: store.readState(),
    }
  }
}
