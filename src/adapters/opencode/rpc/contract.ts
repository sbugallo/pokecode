import { Rpc } from "@opencode/plugin/rpc"
import {
  pokemonDexSchema,
  pokemonManagementResultSchema,
  pokemonReleaseInputSchema,
  pokemonRenameInputSchema,
} from "../../../application/contracts/game.js"

const emptyObjectInputSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const

const gameStateSchema = {
  type: "object",
  properties: {
    phase: { enum: ["onboarding", "active"] },
    locale: { type: "string", minLength: 2 },
    message: { type: "string" },
    region: { type: ["string", "null"] },
    location: { type: ["string", "null"] },
    party: { type: "array" },
    pendingChoices: { type: "array" },
    pendingEncounter: { type: ["object", "null"] },
    pendingEncounterCount: { type: "integer", minimum: 0 },
    choicePokemon: { type: "array" },
    exploration: { type: ["object", "null"] },
  },
  required: [
    "phase",
    "locale",
    "message",
    "region",
    "location",
    "party",
    "pendingChoices",
    "pendingEncounter",
    "pendingEncounterCount",
    "choicePokemon",
    "exploration",
  ],
  additionalProperties: false,
} as const

const encounterResolutionOutputSchema = {
  type: "object",
  properties: {
    kind: { enum: ["caught", "ran", "inactive", "no-encounter"] },
    state: { type: "object" },
  },
  required: ["kind", "state"],
  additionalProperties: false,
} as const

const choiceResolutionOutputSchema = {
  type: "object",
  properties: {
    kind: { enum: ["resolved", "inactive", "invalid-choice"] },
    state: { type: "object" },
  },
  required: ["kind", "state"],
  additionalProperties: false,
} as const

const pokemonListOutputSchema = {
  type: "object",
  properties: { pokemon: { type: "array" } },
  required: ["pokemon"],
  additionalProperties: false,
} as const

const encounterResolutionInputSchema = {
  type: "object",
  properties: { encounterId: { type: "string", format: "uuid" } },
  required: ["encounterId"],
  additionalProperties: false,
} as const

export const PokecodeRpc = Rpc.define({
  id: "pokecode",
  methods: {
    status: {
      input: emptyObjectInputSchema,
      output: gameStateSchema,
    },
    chooseStarter: {
      input: {
        type: "object",
        properties: {
          regionId: { type: "string", minLength: 1 },
          speciesId: { type: "string", minLength: 1 },
        },
        required: ["regionId", "speciesId"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          kind: {
            enum: ["selected", "invalid-region", "invalid-starter", "already-selected"],
          },
          state: { type: "object" },
        },
        required: ["kind", "state"],
        additionalProperties: false,
      },
    },
    travelTo: {
      input: {
        type: "object",
        properties: { locationId: { type: "string", minLength: 1 } },
        required: ["locationId"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          kind: { enum: ["teleported", "inactive", "invalid-location", "locked-location"] },
          state: { type: "object" },
        },
        required: ["kind", "state"],
        additionalProperties: false,
      },
    },
    travelToRegion: {
      input: {
        type: "object",
        properties: { regionId: { type: "string", minLength: 1 } },
        required: ["regionId"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          kind: {
            enum: [
              "traveled",
              "inactive",
              "invalid-region",
              "already-visited",
              "region-incomplete",
            ],
          },
          state: { type: "object" },
        },
        required: ["kind", "state"],
        additionalProperties: false,
      },
    },
    catchEncounter: {
      input: encounterResolutionInputSchema,
      output: encounterResolutionOutputSchema,
    },
    runEncounter: {
      input: encounterResolutionInputSchema,
      output: encounterResolutionOutputSchema,
    },
    collection: {
      input: emptyObjectInputSchema,
      output: pokemonListOutputSchema,
    },
    dex: {
      input: emptyObjectInputSchema,
      output: pokemonDexSchema,
    },
    exportTeam: {
      input: emptyObjectInputSchema,
      output: {
        type: "object",
        properties: {
          kind: { enum: ["exported", "inactive"] },
          text: { type: "string" },
        },
        required: ["kind", "text"],
        additionalProperties: false,
      },
    },
    sprite: {
      input: {
        type: "object",
        properties: {
          speciesId: { type: "string", minLength: 1 },
          shiny: { type: "boolean" },
          gender: { enum: ["male", "female", "genderless"] },
        },
        required: ["speciesId", "shiny", "gender"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          kind: { enum: ["cached", "placeholder"] },
          source: { type: "string" },
        },
        required: ["kind"],
        additionalProperties: false,
      },
    },
    replaceParty: {
      input: {
        type: "object",
        properties: {
          pokemonIds: { type: "array", minItems: 1, maxItems: 6, items: { type: "string" } },
        },
        required: ["pokemonIds"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          kind: { enum: ["replaced", "inactive", "invalid-party"] },
          state: { type: "object" },
        },
        required: ["kind", "state"],
        additionalProperties: false,
      },
    },
    renamePokemon: {
      input: pokemonRenameInputSchema,
      output: pokemonManagementResultSchema,
    },
    releasePokemon: {
      input: pokemonReleaseInputSchema,
      output: pokemonManagementResultSchema,
    },
    resolveMoveChoice: {
      input: {
        type: "object",
        properties: {
          choiceId: { type: "string" },
          selectedMoveId: { type: "string", minLength: 1 },
        },
        required: ["choiceId", "selectedMoveId"],
        additionalProperties: false,
      },
      output: choiceResolutionOutputSchema,
    },
    resolveEvolutionChoice: {
      input: {
        type: "object",
        properties: {
          choiceId: { type: "string" },
          selectedSpeciesId: { type: "string", minLength: 1 },
        },
        required: ["choiceId", "selectedSpeciesId"],
        additionalProperties: false,
      },
      output: choiceResolutionOutputSchema,
    },
    dismissNextRegionChoice: {
      input: emptyObjectInputSchema,
      output: gameStateSchema,
    },
    reopenNextRegionChoice: {
      input: emptyObjectInputSchema,
      output: gameStateSchema,
    },
  },
  events: {
    statusChanged: {
      schema: gameStateSchema,
    },
  },
})
