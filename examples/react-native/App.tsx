import { useEffect, useRef, useState } from "react";
import "./src/global.css";
import { Uniwind } from "uniwind";
import { AppState, Pressable, ScrollView, Text, View, useColorScheme } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as ScreenOrientation from "expo-screen-orientation";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { ConvexReactClient, ConvexProvider } from "convex/react";
import {
  ConvexEnableTwoFactorForm,
  ConvexForgotPasswordForm,
  ConvexResetPasswordForm,
  ConvexSessionList,
  ConvexVerifyEmailScreen,
  ExpoAuthClientSignInScreen,
  ExpoAuthClientSignUpScreen,
  ExpoConvexAuthClientProvider,
  useAuthActions,
  useConvexAuthClientContext,
  type ExpoConvexAuthStorage,
  type NativeAuthActions,
} from "@vortex-api/convex-auth/react-native";
import { usePasskeys } from "@vortex-api/convex-auth/react-native/passkeys";
import { api } from "./convex/_generated/api";

import { clsx } from "clsx";

type Screen = "signIn" | "signUp" | "forgot" | "reset" | "verify" | "enableTwoFactor";

const TOKEN_KEYS = ["convex-auth-token", "convex-auth-refresh-token", "convex-auth-session-id"];

const convexUrl = Constants.expoConfig?.extra?.convexUrl ?? process.env.EXPO_PUBLIC_CONVEX_URL;
if (typeof convexUrl !== "string" || convexUrl.length === 0) {
  throw new Error("EXPO_PUBLIC_CONVEX_URL is not set");
}

const convex = new ConvexReactClient(convexUrl);

const socialProviders = [
  { provider: "google", label: "Google" },
  { provider: "github", label: "GitHub" },
  { provider: "discord", label: "Discord" },
] as const;

function useRootClassName() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  useEffect(() => {
    Uniwind.setTheme(isDark ? "dark" : "light");
  }, [isDark]);

  return clsx("flex-1 bg-background", isDark && "dark");
}

function SecureStoreHydrator() {
  const actions = useAuthActions();
  const isHydratedRef = useRef(false);

  useEffect(() => {
    if (isHydratedRef.current) return;

    function hydrate() {
      if (isHydratedRef.current) return;

      const values: Record<string, string> = {};
      for (const key of TOKEN_KEYS) {
        try {
          const value = SecureStore.getItem(key);
          if (value !== null && value !== undefined) {
            values[key] = value;
          }
        } catch {
          // Ignore SecureStore read errors.
        }
      }

      isHydratedRef.current = true;

      if (values[TOKEN_KEYS[0]]) {
        actions.setToken(values[TOKEN_KEYS[0]]);
      }
      if (values[TOKEN_KEYS[1]]) {
        actions.setRefreshToken(values[TOKEN_KEYS[1]]);
      }
      if (values[TOKEN_KEYS[2]]) {
        actions.setSessionId(values[TOKEN_KEYS[2]]);
      }
    }

    if (AppState.currentState === "active") {
      hydrate();
    }

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        hydrate();
      }
    });

    return () => subscription.remove();
  }, [actions]);

  return null;
}

function AuthProviders({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme() ?? "light";
  const cacheRef = useRef<Record<string, string>>({});

  const storage: ExpoConvexAuthStorage = useRef<ExpoConvexAuthStorage>({
    getItem: (key) => cacheRef.current[key] ?? null,
    setItem: (key, value) => {
      cacheRef.current[key] = value;
      void SecureStore.setItemAsync(key, value);
    },
    deleteItem: (key) => {
      delete cacheRef.current[key];
      void SecureStore.deleteItemAsync(key);
    },
    setItemAsync: async (key, value) => {
      cacheRef.current[key] = value;
      await SecureStore.setItemAsync(key, value);
    },
    deleteItemAsync: async (key) => {
      delete cacheRef.current[key];
      await SecureStore.deleteItemAsync(key);
    },
  }).current;

  const statusBarStyle = colorScheme === "dark" ? "light" : "dark";
  const isDark = colorScheme === "dark";

  return (
    <View className={clsx("flex-1 bg-background", isDark && "dark")} style={{ flex: 1 }}>
      <ConvexProvider client={convex}>
        <ExpoConvexAuthClientProvider
          actions={api.auth as unknown as NativeAuthActions}
          storage={storage}
          initialUrl={Linking.createURL("/")}
          subscribeToUrl={(handler) => {
            const subscription = Linking.addEventListener("url", ({ url }) => {
              const parsed = Linking.parse(url);
              const rawPath = parsed.path?.toLowerCase() ?? "";
              const path = rawPath.replace(/^--\//, "");
              // Only notify the auth provider of session-token URLs (e.g. OAuth
              // callback to the root). Verification/reset deep links carry
              // one-time tokens that must not replace the current session.
              if (path === "" || path === "/") {
                handler(url);
              }
            });
            return () => subscription.remove();
          }}
        >
          <StatusBar style={statusBarStyle} />
          <SecureStoreHydrator />
          {children}
        </ExpoConvexAuthClientProvider>
      </ConvexProvider>
    </View>
  );
}

export default function App() {
  return (
    <AuthProviders>
      <InnerApp />
    </AuthProviders>
  );
}

type DeepLinkRoute =
  | { screen: "reset"; token: string }
  | { screen: "verify"; token: string }
  | null;

function parseDeepLink(url: string | null): DeepLinkRoute {
  if (typeof url !== "string" || url.length === 0) return null;
  const parsed = Linking.parse(url);
  const rawPath = parsed.path?.toLowerCase() ?? "";
  const path = rawPath.replace(/^--\//, "");
  const token = typeof parsed.queryParams?.token === "string" ? parsed.queryParams.token : "";
  if (path === "reset-password" && token.length > 0) {
    return { screen: "reset", token };
  }
  if (path === "verify-email" && token.length > 0) {
    return { screen: "verify", token };
  }
  return null;
}

function useDeepLink(setRoute: (route: DeepLinkRoute) => void) {
  useEffect(() => {
    let mounted = true;
    async function handleInitial() {
      const initial = await Linking.getInitialURL();
      if (!mounted) return;
      setRoute(parseDeepLink(initial));
    }
    void handleInitial();

    const subscription = Linking.addEventListener("url", ({ url }) => {
      const route = parseDeepLink(url);
      if (route !== null) {
        setRoute(route);
      }
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [setRoute]);
}

function FooterLink({
  label,
  onPress,
  className,
}: {
  label: string;
  onPress: () => void;
  className?: string;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Text className={clsx("text-sm font-semibold", className)}>{label}</Text>
    </Pressable>
  );
}

function InnerApp() {
  const [screen, setScreen] = useState<Screen>("signIn");
  const [deepLink, setDeepLink] = useState<DeepLinkRoute>(null);
  const authClient = useConvexAuthClientContext();
  const session = authClient?.useSession();
  const rootClassName = useRootClassName();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  useDeepLink(setDeepLink);

  useEffect(() => {
    if (deepLink !== null) {
      setScreen(deepLink.screen);
    }
  }, [deepLink]);

  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {
      // Ignore if Expo Go build does not include the screen orientation module.
    });
  }, []);

  if (authClient === null || session === undefined || session.isPending) {
    return (
      <View className={clsx(rootClassName, "items-center justify-center")}>
        <Text className="text-base text-muted-foreground">Loading…</Text>
      </View>
    );
  }

  const redirectUrl = Linking.createURL("/");

  if (screen === "enableTwoFactor" && session.data?.user) {
    return (
      <ScrollView
        className={clsx(rootClassName, "p-6")}
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
      >
        <View className="w-full max-w-md self-center p-4 rounded-xl bg-card">
          <ConvexEnableTwoFactorForm
            issuer="convex-auth-rn"
            onEnrolled={() => setScreen("signIn")}
          />
          <View className="px-4 pt-4 items-center">
            <FooterLink label="Back" onPress={() => setScreen("signIn")} className="text-primary" />
          </View>
        </View>
      </ScrollView>
    );
  }

  if (screen === "reset") {
    return (
      <View className={clsx(rootClassName, "justify-center p-6")}>
        <View className="w-full max-w-md self-center p-4 rounded-xl bg-card">
          <ConvexResetPasswordForm
            token={deepLink?.token ?? ""}
            onReset={() => setScreen("signIn")}
          />
          <View className="px-4 pt-4 items-center">
            <Text className="text-sm text-muted-foreground">Done? </Text>
            <FooterLink
              label="Sign in"
              onPress={() => setScreen("signIn")}
              className="text-primary"
            />
          </View>
        </View>
      </View>
    );
  }

  if (screen === "verify") {
    return (
      <View className={clsx(rootClassName, "justify-center p-6")}>
        <View className="w-full max-w-md self-center p-4 rounded-xl bg-card">
          <ConvexVerifyEmailScreen
            token={deepLink?.token ?? ""}
            userEmail={session.data?.user?.email ?? null}
            resendCallbackUrl={Linking.createURL("/verify-email")}
            onVerified={() => setScreen("signIn")}
          />
          <View className="px-4 pt-4 items-center">
            <Text className="text-sm text-muted-foreground">Verified? </Text>
            <FooterLink
              label="Sign in"
              onPress={() => setScreen("signIn")}
              className="text-primary"
            />
          </View>
        </View>
      </View>
    );
  }

  if (session.data?.user) {
    return (
      <SignedInView
        onSignOut={async () => {
          await authClient.signOut();
          setScreen("signIn");
        }}
        onEnableTwoFactor={() => setScreen("enableTwoFactor")}
      />
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      className={clsx("w-full bg-background", isDark && "dark")}
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center" }}
    >
      <View
        className={clsx("w-full max-w-md bg-background", isDark && "dark")}
        style={{ padding: 24 }}
      >
        {screen === "signUp" ? (
          <>
            <ExpoAuthClientSignUpScreen
              signInUrl=""
              forceRedirectUrl={redirectUrl}
              title="Create account"
              description="Sign up with Google, GitHub, Discord, or email."
              socialProviders={socialProviders}
            />
            <View className="flex-row mt-4 self-center">
              <Text className="text-sm text-muted-foreground">Already have an account? </Text>
              <FooterLink
                label="Sign in"
                onPress={() => setScreen("signIn")}
                className="text-primary"
              />
            </View>
          </>
        ) : screen === "forgot" ? (
          <View className="w-full max-w-md self-center p-4 rounded-xl bg-card">
            <ConvexForgotPasswordForm
              resetPasswordUrl={Linking.createURL("/reset-password")}
              onRequested={() => setScreen("signIn")}
            />
            <View className="px-4 pt-4 items-center">
              <Text className="text-sm text-muted-foreground">Remembered your password? </Text>
              <FooterLink
                label="Sign in"
                onPress={() => setScreen("signIn")}
                className="text-primary"
              />
            </View>
          </View>
        ) : (
          <>
            <ExpoAuthClientSignInScreen
              signUpUrl=""
              forceRedirectUrl={redirectUrl}
              title="Sign in"
              description="Sign in with Google, GitHub, Discord, or email."
              socialProviders={socialProviders}
            />
            <PasskeySignInButton />
            <Pressable
              onPress={async () => {
                await authClient?.signIn.anonymous({});
              }}
              className="w-full max-w-md self-center mt-4 py-3 px-6 rounded-lg items-center bg-primary"
              accessibilityRole="button"
              accessibilityLabel="Continue as guest"
            >
              <Text className="text-sm font-semibold text-primary-foreground">
                Continue as guest
              </Text>
            </Pressable>
            <View className="flex-row mt-4 self-center">
              <Text className="text-sm text-muted-foreground">Don’t have an account? </Text>
              <FooterLink
                label="Sign up"
                onPress={() => setScreen("signUp")}
                className="text-primary"
              />
            </View>
            <View className="flex-row mt-2 self-center">
              <FooterLink
                label="Forgot password?"
                onPress={() => setScreen("forgot")}
                className="text-primary"
              />
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function SignedInView({
  onSignOut,
  onEnableTwoFactor,
}: {
  onSignOut: () => void | Promise<void>;
  onEnableTwoFactor: () => void;
}) {
  const authClient = useConvexAuthClientContext();
  const session = authClient?.useSession();
  const user = session?.data?.user;

  return (
    <ConvexSessionList
      styles={{ root: { flex: 1 } }}
      header={
        <View className="rounded-xl p-4 mb-4 bg-card">
          <Text className="text-lg font-bold text-foreground">Signed in</Text>
          {user?.name ? <Text className="text-base text-muted-foreground">{user.name}</Text> : null}
          {user?.email ? <Text className="text-sm text-muted-foreground">{user.email}</Text> : null}
        </View>
      }
      footer={
        <>
          <PasskeySection userId={user?.id} identifier={user?.email ?? undefined} />
          <Pressable
            onPress={onEnableTwoFactor}
            className="w-full max-w-md self-center mt-4 py-3 px-6 rounded-lg items-center border border-border bg-card"
            accessibilityRole="button"
            accessibilityLabel="Enable two-factor auth"
          >
            <Text className="text-sm font-semibold text-card-foreground">
              Enable two-factor auth
            </Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              await onSignOut();
            }}
            className="w-full max-w-md self-center mt-4 py-3 px-6 rounded-lg items-center bg-destructive"
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Text className="text-sm font-semibold text-destructive-foreground">Sign out</Text>
          </Pressable>
        </>
      }
    />
  );
}

function PasskeySection({ userId, identifier }: { userId?: string; identifier?: string }) {
  const passkeys = usePasskeys({ userId, identifier });

  if (!passkeys.supported) {
    return null;
  }

  return (
    <View className="w-full max-w-md self-center mt-4 rounded-xl border border-border bg-card p-4">
      <Text className="text-sm font-semibold text-card-foreground">Passkeys</Text>
      {passkeys.passkeys
        .filter((passkey) => !passkey.revoked)
        .map((passkey) => (
          <View key={passkey.credentialId} className="mt-2 flex-row items-center justify-between">
            <Text className="text-xs text-muted-foreground">
              {passkey.name ?? passkey.credentialId}
            </Text>
            <Pressable
              onPress={() => void passkeys.revoke(passkey.credentialId)}
              accessibilityRole="button"
              accessibilityLabel={`Revoke ${passkey.name ?? "passkey"}`}
            >
              <Text className="text-xs font-semibold text-destructive">Revoke</Text>
            </Pressable>
          </View>
        ))}
      {passkeys.error ? (
        <Text className="mt-2 text-xs text-destructive">{passkeys.error}</Text>
      ) : null}
      <Pressable
        onPress={() => void passkeys.register("This device")}
        disabled={passkeys.loading}
        className="mt-3 py-2 px-4 rounded-lg items-center bg-primary"
        accessibilityRole="button"
        accessibilityLabel="Register this device as a passkey"
      >
        <Text className="text-sm font-semibold text-primary-foreground">Register this device</Text>
      </Pressable>
    </View>
  );
}

function PasskeySignInButton() {
  const passkeys = usePasskeys({});

  if (!passkeys.supported) {
    return null;
  }

  return (
    <Pressable
      onPress={() => void passkeys.signIn()}
      disabled={passkeys.loading}
      className="w-full max-w-md self-center mt-4 py-3 px-6 rounded-lg items-center border border-border bg-card"
      accessibilityRole="button"
      accessibilityLabel="Sign in with passkey"
    >
      <Text className="text-sm font-semibold text-card-foreground">Sign in with passkey</Text>
    </Pressable>
  );
}
