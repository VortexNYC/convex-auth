import { useEffect, useRef } from "react";

import type { ConvexAuthState } from "./auth-client-types";

export function ConvexAuthIdentityProvisioner(args: {
  auth: ConvexAuthState;
  currentUser: unknown;
  sessionSubject: string | null;
  provisionCurrentUser: () => Promise<unknown>;
}) {
  const inFlightRef = useRef(false);
  const attemptedSubjectRef = useRef<string | null>(null);

  useEffect(() => {
    if (!args.auth.isSignedIn) {
      attemptedSubjectRef.current = null;
      return;
    }

    if (
      !args.auth.isLoaded ||
      args.currentUser !== null ||
      args.currentUser === undefined ||
      args.sessionSubject === null
    ) {
      return;
    }

    if (inFlightRef.current || attemptedSubjectRef.current === args.sessionSubject) {
      return;
    }

    inFlightRef.current = true;
    attemptedSubjectRef.current = args.sessionSubject;
    void args.provisionCurrentUser().finally(() => {
      inFlightRef.current = false;
    });
  }, [args]);

  return null;
}
