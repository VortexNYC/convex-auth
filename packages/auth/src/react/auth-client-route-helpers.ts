export function shouldShowConvexAuthenticatedRouteOrganizationRequired(args: {
  hasOrganization: boolean;
  isChooseOrganizationRoute: boolean;
  isPostSignUpRoute: boolean;
}): boolean {
  return !args.hasOrganization && !args.isChooseOrganizationRoute && !args.isPostSignUpRoute;
}

export function shouldShowConvexAuthenticatedRouteLoading(args: {
  isAuthLoaded: boolean;
  isOrganizationLoading: boolean;
  isPostSignUpRoute: boolean;
}): boolean {
  return !args.isAuthLoaded || (args.isOrganizationLoading && !args.isPostSignUpRoute);
}

export function shouldCaptureConvexAuthenticatedRouteSuccess(args: {
  isAuthLoaded: boolean;
  isSignedIn: boolean;
  isOrganizationLoading: boolean;
}): boolean {
  return args.isAuthLoaded && args.isSignedIn && !args.isOrganizationLoading;
}

export function getConvexAuthenticatedRouteRedirectPath(args: {
  pathname: string;
  search?: string;
  hash?: string;
}): string {
  return `${args.pathname}${args.search ?? ""}${args.hash ?? ""}`;
}
