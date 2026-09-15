import { useEffect, useRef, useState } from "react";
import "./src/global.css";
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
import { api } from "./convex/_generated/api";

type Screen = "signIn" | "signUp" | "forgot" | "reset" | "verify" | "enableTwoFactor";

const TOKEN_KEYS = ["convex-auth-token", "convex-auth-refresh-token", "convex-auth-session-id"];

const convexUrl = Constants.expoConfig?.extra?.convexUrl ?? process.env.EXPO_PUBLIC_CONVEX_URL;
if (typeof convexUrl !== "string" || convexUrl.length === 0) {
  throw new Error(
    "Constants.expoConfig.extra.convexUrl and EXPO_PUBLIC_CONVEX_URL are not set; add EXPO_PUBLIC_CONVEX_URL to .env",
  );
}

const convex = new ConvexReactClient(convexUrl);

const socialProviders = [
  { provider: "google", label: "Google" },
  { provider: "github", label: "GitHub" },
  { provider: "discord", label: "Discord" },
] as const;

function useTheme() {
  const colorScheme = useColorScheme() ?? "light";
  const statusBarStyle: "light" | "dark" = colorScheme === "dark" ? "light" : "dark";
  return { colorScheme, statusBarStyle };
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
  const { statusBarStyle } = useTheme();
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

  return (
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
  );
}

export default function App() {
  const { colorScheme } = useTheme();
  return (
    <View className={colorScheme === "dark" ? "flex-1 bg-background dark" : "flex-1 bg-background"}>
      <AuthProviders>
        <InnerApp />
      </AuthProviders>
    </View>
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

function FooterLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Text className="text-sm font-semibold text-primary">{label}</Text>
    </Pressable>
  );
}

function InnerApp() {
  const [screen, setScreen] = useState<Screen>("signIn");
  const [deepLink, setDeepLink] = useState<DeepLinkRoute>(null);
  const authClient = useConvexAuthClientContext();
  const session = authClient?.useSession();

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
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-base text-muted-foreground">Loading…</Text>
      </View>
    );
  }

  const redirectUrl = Linking.createURL("/");

  if (screen === "enableTwoFactor" && session.data?.user) {
    return (
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "flex-start",
          alignItems: "center",
          padding: 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-md self-center p-6 bg-card rounded-xl flex-col">
          <ConvexEnableTwoFactorForm
            issuer="convex-auth-rn"
            onEnrolled={() => setScreen("signIn")}
          />
          <View className="px-4 pt-4 items-center">
            <FooterLink label="Back" onPress={() => setScreen("signIn")} />
          </View>
        </View>
      </ScrollView>
    );
  }

  if (screen === "reset") {
    return (
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "flex-start",
          alignItems: "center",
          padding: 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-md self-center p-6 bg-card rounded-xl flex-col">
          <ConvexResetPasswordForm
            token={deepLink?.token ?? ""}
            onReset={() => setScreen("signIn")}
          />
          <View className="flex-row justify-center items-center px-4 pt-4 gap-1">
            <Text className="text-sm text-muted-foreground">Done? </Text>
            <FooterLink label="Sign in" onPress={() => setScreen("signIn")} />
          </View>
        </View>
      </ScrollView>
    );
  }

  if (screen === "verify") {
    return (
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "flex-start",
          alignItems: "center",
          padding: 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-md self-center p-6 bg-card rounded-xl flex-col">
          <ConvexVerifyEmailScreen
            token={deepLink?.token ?? ""}
            userEmail={session.data?.user?.email ?? null}
            resendCallbackUrl={Linking.createURL("/verify-email")}
            onVerified={() => setScreen("signIn")}
          />
          <View className="flex-row justify-center items-center px-4 pt-4 gap-1">
            <Text className="text-sm text-muted-foreground">Verified? </Text>
            <FooterLink label="Sign in" onPress={() => setScreen("signIn")} />
          </View>
        </View>
      </ScrollView>
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
      className="flex-1 bg-background"
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "flex-start",
        alignItems: "center",
        padding: 24,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {screen === "signUp" ? (
        <View className="w-full max-w-md self-center p-6 bg-card rounded-xl flex-col">
          <ExpoAuthClientSignUpScreen
            signInUrl=""
            forceRedirectUrl={redirectUrl}
            title="Create account"
            description="Sign up with Google, GitHub, Discord, or email."
            socialProviders={socialProviders}
          />
          <View className="flex-row justify-center items-center mt-4 gap-1">
            <Text className="text-sm text-muted-foreground">Already have an account? </Text>
            <FooterLink label="Sign in" onPress={() => setScreen("signIn")} />
          </View>
        </View>
      ) : screen === "forgot" ? (
        <View className="w-full max-w-md self-center p-6 bg-card rounded-xl flex-col">
          <ConvexForgotPasswordForm
            resetPasswordUrl={Linking.createURL("/reset-password")}
            onRequested={() => setScreen("signIn")}
          />
          <View className="flex-row justify-center items-center px-4 pt-4 gap-1">
            <Text className="text-sm text-muted-foreground">Remembered your password? </Text>
            <FooterLink label="Sign in" onPress={() => setScreen("signIn")} />
          </View>
        </View>
      ) : (
        <View className="w-full max-w-md self-center p-6 bg-card rounded-xl flex-col">
          <ExpoAuthClientSignInScreen
            signUpUrl=""
            forceRedirectUrl={redirectUrl}
            title="Sign in"
            description="Sign in with Google, GitHub, Discord, or email."
            socialProviders={socialProviders}
          />
          <Pressable
            onPress={async () => {
              await authClient?.signIn.anonymous({});
            }}
            className="w-full mt-4 py-3 px-6 rounded-lg bg-primary items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Continue as guest"
          >
            <Text className="text-sm font-semibold text-primary-foreground">Continue as guest</Text>
          </Pressable>
          <View className="flex-row justify-center items-center mt-4 gap-1">
            <Text className="text-sm text-muted-foreground">Don’t have an account? </Text>
            <FooterLink label="Sign up" onPress={() => setScreen("signUp")} />
          </View>
          <View className="flex-row justify-center items-center mt-2">
            <FooterLink label="Forgot password?" onPress={() => setScreen("forgot")} />
          </View>
        </View>
      )}
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
  const currentToken = session?.data?.session?.token;

  return (
    <View className="flex-1 p-6 bg-background">
      <View className="rounded-xl p-4 mb-4 bg-card">
        <Text className="text-lg font-bold text-foreground">Signed in</Text>
        {user?.name ? <Text className="text-base text-foreground">{user.name}</Text> : null}
        {user?.email ? <Text className="text-sm text-muted-foreground">{user.email}</Text> : null}
        <Text className="text-xs text-muted-foreground mt-2" numberOfLines={1} ellipsizeMode="tail">
          Token: {currentToken ?? "none"}
        </Text>
      </View>
      <ConvexSessionList currentSessionToken={currentToken ?? null} />
      <Pressable
        onPress={onEnableTwoFactor}
        className="w-full mt-4 py-3 px-6 rounded-lg items-center justify-center border border-input bg-background"
        accessibilityRole="button"
        accessibilityLabel="Enable two-factor auth"
      >
        <Text className="text-sm font-semibold text-foreground">Enable two-factor auth</Text>
      </Pressable>
      <Pressable
        onPress={async () => {
          await onSignOut();
        }}
        className="w-full mt-4 py-3 px-6 rounded-lg items-center justify-center bg-destructive"
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Text className="text-sm font-semibold text-destructive-foreground">Sign out</Text>
      </Pressable>
    </View>
  );
}
