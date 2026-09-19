import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import type { auth } from "@/server/auth";

/**
 * `auth` is imported as a type only - it never reaches the bundle. This just gives
 * `authClient.useSession().data.user.xUsername` the right type.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});
