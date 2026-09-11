import type { HttpRouter } from "convex/server";
import { addNativeAuthHttpRoutes } from "./http.js";
import { addNativeOAuthHttpRoutes } from "./oauthHttp.js";
import { nativeOAuth } from "./oauthActions.js";
import type { NativeOAuthActions, NativeOAuthConfig } from "./oauthActions.js";
import { nativeEmailAndPassword } from "./provider.js";
import type {
  CaptchaConfig,
  NativeEmailAndPasswordActions,
  NativeEmailAndPasswordConfig,
  NativeEmailAndPasswordFunctionReferences,
} from "./provider.js";
import { nativeAuthQueries, type NativeAuthQueries } from "./queries.js";
import { nativeMagicLink } from "./magicLink.js";
import type {
  NativeMagicLinkActions,
  NativeMagicLinkConfig,
  NativeMagicLinkFunctionReferences,
} from "./magicLink.js";
import { nativeEmailOtp } from "./emailOtp.js";
import type { NativeEmailOtpActions, NativeEmailOtpConfig } from "./emailOtp.js";
import { nativePasskey } from "./passkeys.js";
import type { NativePasskeyActions, NativePasskeyConfig, PasskeyComponentApi } from "./passkeys.js";
import type { ComponentApi as FullComponentApi } from "../../component/_generated/component.js";
import type { ComponentApi as CoreComponentApi } from "../../component/core/_generated/component.js";
import type { ComponentApi as OrganizationsComponentApi } from "../../component/organizations/_generated/component.js";
import { addOidcProviderHttpRoutes, type OidcProviderConfig } from "../oauth-provider/http.js";
import type { NativeEmailAndPasswordComponentHandle } from "./types.js";

type ConvexAuthConfigBase = {
  emailAndPassword?: NativeEmailAndPasswordConfig;
  captcha?: CaptchaConfig;
  oauth?: NativeOAuthConfig;
  oauthProvider?: OidcProviderConfig;
  magicLink?: NativeMagicLinkConfig;
  emailOtp?: NativeEmailOtpConfig;
  passkey?: NativePasskeyConfig;
};

/**
 * Any component handle that exposes the core native-auth API.
 * Supports the full legacy `convexAuth` component, the stripped
 * `convexAuthCore` component, and the `convexAuthOrganizations` component.
 */
export type ConvexAuthComponentHandle =
  | (NativeEmailAndPasswordComponentHandle & { passkeys?: PasskeyComponentApi })
  | (FullComponentApi<"convexAuth"> & { passkeys?: PasskeyComponentApi })
  | (CoreComponentApi<"convexAuthCore"> & { passkeys?: PasskeyComponentApi })
  | (OrganizationsComponentApi<"convexAuthOrganizations"> & { passkeys?: PasskeyComponentApi });

export type ConvexAuthConfig =
  | (ConvexAuthConfigBase & {
      component: ConvexAuthComponentHandle;
      components?: never;
    })
  | (ConvexAuthConfigBase & {
      components: {
        core: ConvexAuthComponentHandle;
      };
      component?: never;
    });

type ConfigActions<TConfig extends ConvexAuthConfig> = NativeEmailAndPasswordActions &
  NativeAuthQueries &
  (TConfig extends { magicLink: NativeMagicLinkConfig } ? NativeMagicLinkActions : {}) &
  (TConfig extends { emailOtp: NativeEmailOtpConfig } ? NativeEmailOtpActions : {}) &
  (TConfig extends { oauth: NativeOAuthConfig }
    ? { signInWithRedirect: NativeOAuthActions["signIn"]; callback: NativeOAuthActions["callback"] }
    : {}) &
  (TConfig extends { passkey: NativePasskeyConfig } ? NativePasskeyActions : {}) & {
    addHttpRoutes(http: HttpRouter): void;
  };

export type ConvexAuth<TConfig extends ConvexAuthConfig = ConvexAuthConfig> =
  ConfigActions<TConfig>;

export function convexAuth<TConfig extends ConvexAuthConfig>(config: TConfig): ConvexAuth<TConfig> {
  const component = config.component ?? config.components?.core;
  if (!component) {
    throw new Error("convexAuth: either config.component or config.components.core is required.");
  }

  const emailAndPasswordActions = nativeEmailAndPassword(component, {
    ...config.emailAndPassword,
    captcha: config.emailAndPassword?.captcha ?? config.captcha,
  });
  const authQueries = nativeAuthQueries(component);
  const magicLinkActions = config.magicLink
    ? nativeMagicLink(component, config.magicLink)
    : undefined;
  const emailOtpActions = config.emailOtp ? nativeEmailOtp(component, config.emailOtp) : undefined;

  const oauthActions = config.oauth ? nativeOAuth(component, config.oauth) : undefined;

  const passkeyActions =
    config.passkey && component.passkeys
      ? nativePasskey(component.passkeys, config.passkey)
      : undefined;

  const auth = {
    ...emailAndPasswordActions,
    ...magicLinkActions,
    ...emailOtpActions,
    ...authQueries,
    ...(oauthActions
      ? { signInWithRedirect: oauthActions.signIn, callback: oauthActions.callback }
      : {}),
    ...passkeyActions,
    addHttpRoutes(http: HttpRouter) {
      const emailConfig = config.emailAndPassword ?? {};
      const oauthProviderLoginOrigin = (() => {
        const loginUrl = config.oauthProvider?.loginUrl;
        if (!loginUrl) return [];
        try {
          return [new URL(loginUrl).origin];
        } catch {
          return [];
        }
      })();
      const trustedOrigins = [
        ...(emailConfig.trustedOrigins ?? []),
        ...(emailConfig.email?.appOrigin ? [emailConfig.email.appOrigin] : []),
        ...(config.oauth?.trustedOrigins ?? []),
        ...(process.env.SITE_URL ? [process.env.SITE_URL] : []),
        ...(process.env.CONVEX_SITE_URL ? [process.env.CONVEX_SITE_URL] : []),
        ...oauthProviderLoginOrigin,
      ];
      const httpActions = magicLinkActions
        ? ({
            ...emailAndPasswordActions,
            ...magicLinkActions,
          } as unknown as NativeEmailAndPasswordFunctionReferences &
            Partial<NativeMagicLinkFunctionReferences>)
        : (emailAndPasswordActions as unknown as NativeEmailAndPasswordFunctionReferences &
            Partial<NativeMagicLinkFunctionReferences>);

      addNativeAuthHttpRoutes(http, component, httpActions, { trustedOrigins });
      if (oauthActions && config.oauth) {
        addNativeOAuthHttpRoutes(http, {
          component,
          oauth: config.oauth,
          trustedOrigins,
        });
      }
      if (config.oauthProvider) {
        addOidcProviderHttpRoutes(http, {
          component: component as FullComponentApi<"convexAuth">,
          oauthProvider: config.oauthProvider,
          trustedOrigins,
        });
      }
    },
  };

  return auth as unknown as ConvexAuth<TConfig>;
}
