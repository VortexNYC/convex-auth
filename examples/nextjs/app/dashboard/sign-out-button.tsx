"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConvexAuthClient } from "@vortex-api/convex-auth/react";

/**
 * Sign-out POSTs through the proxy so the HttpOnly cookies are cleared
 * server-side — JavaScript cannot expire them itself.
 */
export function SignOutButton() {
  const authClient = useConvexAuthClient();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      disabled={pending}
      onClick={() => {
        setPending(true);
        void authClient
          .signOut()
          .catch(() => {})
          .finally(() => {
            router.push("/sign-in");
            router.refresh();
          });
      }}
    >
      Sign out
    </button>
  );
}
