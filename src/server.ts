import handler from "@tanstack/react-start/server-entry";

// Durable Objects must be named exports from the Worker entry module.
// wrangler.jsonc registers this class under the `exports` field.
export { RateLimiter } from "./server/rate-limiter";

export default {
  fetch: handler.fetch,
};
