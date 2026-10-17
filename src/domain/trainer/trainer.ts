import type { LocationId, RegionId, TrainerId } from "../shared/identifiers.js"

export type Trainer = {
  readonly id: TrainerId
  readonly regionId: RegionId
  readonly locationId: LocationId
}
