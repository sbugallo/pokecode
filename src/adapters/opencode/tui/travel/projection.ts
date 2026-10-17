import type { GameState, PokemonDex } from "../../../../application/contracts/game.js"
import {
  fixedSpecialEncountersForLocation,
  localizedSpeciesName,
  ordinaryEncountersForLocation,
} from "../../../../domain/content/catalog.js"

export type TravelPokemonPreview = {
  readonly speciesId: string
  readonly name: string
  readonly status: "caught" | "seen" | "unknown"
}

export function locationTravelProjection(state: GameState, dex: PokemonDex) {
  const exploration = state.exploration
  const regionId = state.region
  if (exploration === null || regionId === null) return null

  const visitedRegions = exploration.regions.filter((region) => region.visited)
  const locations =
    visitedRegions.length === 0
      ? exploration.locations
          .filter((location) => location.unlocked)
          .map((location) => ({ ...location, regionId }))
      : visitedRegions.flatMap((region) =>
          region.locations
            .filter((location) => location.unlocked)
            .map((location) => ({ ...location, regionId: region.id })),
        )
  const speciesStatus = new Map<string, TravelPokemonPreview["status"]>(
    dex.discoveries.map((pokemon) => [pokemon.speciesId, pokemon.status]),
  )
  const pokemonByLocation = Object.fromEntries(
    locations.map((location) => {
      const encounters = [
        ...ordinaryEncountersForLocation(location.id),
        ...fixedSpecialEncountersForLocation(location.regionId, location.id),
      ]
      const seenSpecies = new Set<string>()
      const pokemon = encounters.flatMap((encounter) => {
        if (seenSpecies.has(encounter.speciesId)) return []
        seenSpecies.add(encounter.speciesId)
        return [
          {
            speciesId: encounter.speciesId,
            name: localizedSpeciesName(encounter.speciesId, state.locale),
            status: speciesStatus.get(encounter.speciesId) ?? "unknown",
          },
        ]
      })
      return [location.id, pokemon]
    }),
  )
  return {
    currentLocationId: state.location ?? "",
    language: state.locale,
    locations,
    regions: visitedRegions.map((region) => ({ id: region.id, name: region.name })),
    pokemonByLocation,
  }
}
