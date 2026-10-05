/**
 * Layer 2 - Observation.
 *
 * A Crop goes in, an Observation comes out. An Observation states neutral facts only; every
 * judgment happens later, in Jev. See `docs/adr/0001-vision-observes-jev-judges.md`.
 *
 * Server-side only: `observe` takes the Workers AI binding as a parameter, so it must be
 * called from inside the Worker.
 */

export {
  buildObservationRequest,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  isDailyLimitError,
  observe,
  OBSERVATION_MODEL,
  OBSERVATION_SEED,
  ObservationError,
  parseObservation,
} from "./observe";
export type {
  ObservationFailure,
  ObserveOptions,
  VisionBinding,
  VisionContentPart,
  VisionMessage,
  VisionRequest,
} from "./observe";

export {
  BANNED_ADJECTIVE_TYPES,
  NO_EVALUATION_RULE,
  OBSERVATION_SYSTEM_PROMPT,
  OBSERVATION_USER_PROMPT,
} from "./prompt";

export { OBSERVATION_FIELDS, OBSERVATION_JSON_SCHEMA, ObservationSchema } from "./schema";
export type { Observation } from "./schema";
