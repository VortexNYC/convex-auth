/// <reference types="node" />
export { convexAuth } from "./convexAuth.js";
export type { ConvexAuth, ConvexAuthConfig } from "./convexAuth.js";
export { createConvexAuthProvider } from "./authProvider.js";
export type { ConvexAuthProvider } from "./authProvider.js";
export { nativeEmailAndPassword } from "./provider.js";
export { type NativeEmailAndPasswordActions } from "./provider.js";
export { type EmailDraft, type EmailSender } from "./provider.js";
export { type CaptchaConfig, type CaptchaProvider } from "./provider.js";
export { nativeOAuth } from "./oauthActions.js";
export { type NativeOAuthActions } from "./oauthActions.js";
export {
  handleCallback,
  handleSignIn,
  type NativeOAuthCallbackArgs,
  type NativeOAuthCallbackResult,
  type NativeOAuthConfig,
  type NativeOAuthSignInArgs,
} from "./oauthHandlers.js";
export {
  createGitHubProvider,
  createGoogleProvider,
  type GitHubProviderConfig,
  type GoogleProviderConfig,
  type NativeOAuthProvider,
  type OAuthToken,
  type OAuthUserInfo,
} from "./oauth.js";
export {
  generateCodeChallenge,
  generateCodeVerifier,
  mintOAuthState,
  verifyOAuthState,
} from "./oauthState.js";
export { addNativeOAuthHttpRoutes, type NativeOAuthHttpConfig } from "./oauthHttp.js";
export { addNativeAuthHttpRoutes } from "./http.js";
export {
  addOidcProviderHttpRoutes,
  type OidcProviderClient,
  type OidcProviderConfig,
  type OidcProviderHttpHandlers,
} from "../oauth-provider/http.js";
export {
  createResendEmailOtpSender,
  createResendEmailSender,
  type ResendEmailOtpSenderOptions,
  type ResendEmailSenderOptions,
} from "../providers/resend.js";
export {
  createTwilioSmsOtpSender,
  createTwilioSmsSender,
  type PhoneOtpSender,
  type SmsSender,
  type TwilioSmsDraft,
  type TwilioSmsOtpSenderOptions,
  type TwilioSmsSenderOptions,
} from "../providers/twilio.js";
export {
  processConvexWebhookDelivery,
  DEFAULT_WEBHOOK_MAX_ATTEMPTS,
  DEFAULT_WEBHOOK_PROCESSING_LIMIT,
  DEFAULT_WEBHOOK_STALE_AFTER_MS,
  type ConvexWebhookProcessorEndpoint,
  type ConvexWebhookProcessorDelivery,
  type ConvexWebhookFetch,
  type ConvexWebhookFetchResponse,
  type ProcessConvexWebhookDeliveryArgs,
  type ProcessConvexWebhookDeliveryResult,
} from "../webhooks/deliveryProcessor.js";
export type { NativeEmailAndPasswordComponentHandle, NativeOAuthComponentHandle } from "./types.js";
export { gatedCrons } from "../gatedCrons.js";
