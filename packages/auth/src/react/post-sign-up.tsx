import { useEffect, useMemo, useRef, useState } from "react";

export type SelectableOrganization = {
  canSelect: boolean;
};

export type PostSignUpStorageLike = Pick<Storage, "removeItem" | "setItem">;

export type ConvexPostSignUpFlowState = {
  hasTimedOut: boolean;
  isEnsuringOrganization: boolean;
  isRedeemingInvitation: boolean;
  isBusy: boolean;
  statusDescription: string;
  selectableOrganizationCount: number;
};

export function getSelectableOrganizationCount(
  organizations: readonly SelectableOrganization[] | null | undefined,
): number {
  return (organizations ?? []).filter((organization) => organization.canSelect).length;
}

export function shouldAttemptEnsureOrganization(args: {
  hasCurrentOrganization: boolean;
  availableOrganizationsResolved: boolean;
  selectableOrganizationCount: number;
  hasAttemptedEnsure: boolean;
}): boolean {
  return (
    !args.hasCurrentOrganization && args.availableOrganizationsResolved && !args.hasAttemptedEnsure
  );
}

export function shouldSchedulePostSignUpTimeout(hasCurrentOrganization: boolean): boolean {
  return !hasCurrentOrganization;
}

export function getPostSignUpStatusDescription(isEnsuringOrganization: boolean): string {
  return isEnsuringOrganization
    ? "Activating your organization now..."
    : "We're waiting for your organization access to finish syncing.";
}

export function markPendingPostSignUpSync(args: {
  storage?: PostSignUpStorageLike;
  pendingKey: string;
}): void {
  args.storage?.setItem(args.pendingKey, "true");
}

export function clearPendingPostSignUpSync(args: {
  storage?: PostSignUpStorageLike;
  pendingKey: string;
  failureKey?: string;
}): void {
  args.storage?.removeItem(args.pendingKey);
  if (args.failureKey !== undefined) {
    args.storage?.removeItem(args.failureKey);
  }
}

export function getBrowserSessionStorage(): Storage | undefined {
  return typeof window === "undefined" ? undefined : window.sessionStorage;
}

export function useConvexPostSignUpFlow(args: {
  currentOrganization: unknown;
  availableOrganizations: readonly SelectableOrganization[] | null | undefined;
  invitationToken: string | null;
  ensureActiveOrganization: () => Promise<unknown>;
  redeemInvitation: (token: string) => Promise<unknown>;
  onCurrentOrganizationReady: () => void;
  timeoutMs?: number;
}): ConvexPostSignUpFlowState {
  const {
    availableOrganizations,
    currentOrganization,
    ensureActiveOrganization,
    invitationToken,
    onCurrentOrganizationReady,
    redeemInvitation,
    timeoutMs,
  } = args;
  const redeemAttemptedRef = useRef<string | null>(null);
  const attemptedEnsureRef = useRef(false);
  const [isRedeemingInvitation, setIsRedeemingInvitation] = useState(false);
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [isEnsuringOrganization, setIsEnsuringOrganization] = useState(false);

  const selectableOrganizationCount = useMemo(
    () => getSelectableOrganizationCount(availableOrganizations),
    [availableOrganizations],
  );

  useEffect(() => {
    if (!currentOrganization) {
      return;
    }

    onCurrentOrganizationReady();
  }, [currentOrganization, onCurrentOrganizationReady]);

  useEffect(() => {
    if (
      invitationToken === null ||
      currentOrganization !== null ||
      redeemAttemptedRef.current === invitationToken ||
      isRedeemingInvitation
    ) {
      return;
    }

    redeemAttemptedRef.current = invitationToken;
    setIsRedeemingInvitation(true);

    void redeemInvitation(invitationToken)
      .catch(() => {
        redeemAttemptedRef.current = null;
      })
      .finally(() => {
        setIsRedeemingInvitation(false);
      });
  }, [currentOrganization, invitationToken, isRedeemingInvitation, redeemInvitation]);

  useEffect(() => {
    if (
      !shouldAttemptEnsureOrganization({
        hasCurrentOrganization: currentOrganization !== null,
        availableOrganizationsResolved: availableOrganizations !== undefined,
        selectableOrganizationCount,
        hasAttemptedEnsure: attemptedEnsureRef.current,
      })
    ) {
      return;
    }

    attemptedEnsureRef.current = true;
    setIsEnsuringOrganization(true);

    void ensureActiveOrganization()
      .catch(() => {
        attemptedEnsureRef.current = false;
      })
      .finally(() => {
        setIsEnsuringOrganization(false);
      });
  }, [
    availableOrganizations,
    currentOrganization,
    ensureActiveOrganization,
    selectableOrganizationCount,
  ]);

  useEffect(() => {
    if (!shouldSchedulePostSignUpTimeout(currentOrganization !== null)) {
      setHasTimedOut(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setHasTimedOut(true);
    }, timeoutMs ?? 15_000);

    return () => window.clearTimeout(timeoutId);
  }, [currentOrganization, timeoutMs]);

  const isBusy = isEnsuringOrganization || isRedeemingInvitation;

  return {
    hasTimedOut,
    isEnsuringOrganization,
    isRedeemingInvitation,
    isBusy,
    statusDescription: getPostSignUpStatusDescription(isBusy),
    selectableOrganizationCount,
  };
}
