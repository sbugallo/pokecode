import { findLocation, locationsForRegion } from "../../domain/content/catalog.js"
import {
  locationTravelEligibility,
  regionTravelEligibility,
} from "../../domain/exploration/exploration.js"
import type { LocationTravelResult, RegionTravelResult } from "../contracts/game.js"
import {
  afterGameTransaction,
  type GameCommandDependencies,
  resumeSavedExperienceIfUnblocked,
} from "./game-command-support.js"

export function createTravelCommands(dependencies: GameCommandDependencies) {
  const travelTo = (locationId: string): LocationTravelResult =>
    afterGameTransaction(dependencies, (stores) => {
      const trainer = stores.trainers.find()
      if (trainer === null) return "inactive"
      const location = findLocation(locationId)
      const locationExists = location !== null
      if (locationTravelEligibility({ locationExists, unlocked: false }) === "invalid-location")
        return "invalid-location"
      const unlocked = stores.commands.exploration.locationUnlocked(trainer.id, locationId)
      if (locationTravelEligibility({ locationExists, unlocked }) === "locked-location")
        return "locked-location"
      if (location === null) return "invalid-location"
      stores.commands.exploration.travelToLocation(trainer.id, location.regionId, locationId)
      return "teleported"
    })

  const travelToRegion = (regionId: string): RegionTravelResult =>
    afterGameTransaction(dependencies, (stores) => {
      const trainer = stores.trainers.find()
      if (trainer === null) return "inactive"
      const firstLocation = locationsForRegion(regionId)[0]
      // Validate the target before checking progression and visit eligibility.
      if (firstLocation === undefined) return "invalid-region"
      const currentRegionComplete = stores.commands.exploration.regionCompleted(
        trainer.id,
        trainer.regionId,
      )
      if (
        regionTravelEligibility({
          regionExists: true,
          currentRegionComplete,
          targetAlreadyVisited: false,
        }) === "region-incomplete"
      )
        return "region-incomplete"
      const targetAlreadyVisited = stores.commands.exploration.regionVisited(trainer.id, regionId)
      const eligibility = regionTravelEligibility({
        regionExists: true,
        currentRegionComplete,
        targetAlreadyVisited,
      })
      if (eligibility === "already-visited") return "already-visited"
      stores.commands.exploration.initializeRegion(trainer.id, regionId, firstLocation.id)
      stores.commands.choices.deleteKind(trainer.id, "region")
      stores.choices.insert({
        id: dependencies.createId(),
        trainerId: trainer.id,
        kind: "starter",
        payload: { region: regionId },
        createdAt: dependencies.now(),
      })
      resumeSavedExperienceIfUnblocked(dependencies, stores, trainer.id, regionId)
      return "traveled"
    })

  return { travelTo, travelToRegion }
}
