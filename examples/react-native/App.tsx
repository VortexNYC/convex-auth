import { useEffect, useMemo, useRef, useState } from "react";
import "./src/global.css";
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  useWindowDimensions,
  Dimensions,
  type TextStyle,
  type ViewStyle,
} from "react-native";
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
  type ExpoAuthClientScreenStyles,
  type ExpoConvexAuthStorage,
  type ExpoSessionListStyles,
  type NativeAuthActions,
} from "@vortex-api/convex-auth/react-native";
import { api } from "./convex/_generated/api";

type Screen = "signIn" | "signUp" | "forgot" | "reset" | "verify" | "enableTwoFactor";

const TOKEN_KEYS = ["convex-auth-token", "convex-auth-refresh-token", "convex-auth-session-id"];

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL ?? Constants.expoConfig?.extra?.convexUrl;
if (typeof convexUrl !== "string" || convexUrl.length === 0) {
  throw new Error(
    "EXPO_PUBLIC_CONVEX_URL is not set and Constants.expoConfig.extra.convexUrl is not available",
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
  const isDark = colorScheme === "dark";

  const colors = useMemo(
    () =>
      isDark
        ? {
            background: "#0f172a",
            surface: "#1e293b",
            surfaceBorder: "#334155",
            text: "#f8fafc",
            textMuted: "#94a3b8",
            textSubtle: "#cbd5e1",
            primary: "#38bdf8",
            primaryText: "#0f172a",
            danger: "#f87171",
            border: "#334155",
            inputBackground: "#1e293b",
            inputBorder: "#475569",
          }
        : {
            background: "#ffffff",
            surface: "#ffffff",
            surfaceBorder: "#e2e8f0",
            text: "#0f172a",
            textMuted: "#64748b",
            textSubtle: "#475569",
            primary: "#0ea5e9",
            primaryText: "#ffffff",
            danger: "#ef4444",
            border: "#e2e8f0",
            inputBackground: "#ffffff",
            inputBorder: "#e2e8f0",
          },
    [isDark],
  );

  const { width } = useWindowDimensions();
  const screenWidth =
    typeof width === "number" && width > 0
      ? width
      : Dimensions.get("screen").width > 0
        ? Dimensions.get("screen").width
        : 1194;

  const formWidth = Math.min(screenWidth - 48, 460);
  const formMarginLeft = Math.max(0, (screenWidth - 48 - formWidth) / 2);

  const authScreenStyles: ExpoAuthClientScreenStyles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          width: formWidth,
          marginLeft: formMarginLeft,
          padding: 24,
          backgroundColor: colors.background,
          borderRadius: 12,
          alignItems: "flex-start",
        },
        title: {
          fontSize: 24,
          fontWeight: "700",
          marginBottom: 8,
          color: colors.text,
        },
        description: {
          fontSize: 14,
          color: colors.textMuted,
          marginBottom: 16,
        },
        input: {
          borderWidth: 1,
          borderColor: colors.inputBorder,
          borderRadius: 8,
          padding: 12,
          marginBottom: 12,
          backgroundColor: colors.inputBackground,
        },
        inputText: { color: colors.text },
        submitButton: {
          backgroundColor: isDark ? colors.primary : "#0f172a",
          borderRadius: 8,
          padding: 12,
          alignItems: "center",
        },
        submitButtonText: {
          color: isDark ? colors.primaryText : "#ffffff",
          fontWeight: "600",
        },
        providerButton: {
          borderWidth: 1,
          borderColor: colors.surfaceBorder,
          borderRadius: 8,
          padding: 12,
          marginBottom: 8,
          alignItems: "center",
        },
        providerButtonText: { color: colors.text },
        error: { color: colors.danger, marginBottom: 8 },
      }),
    [colors, isDark, formWidth, formMarginLeft],
  );

  const sessionListStyles: ExpoSessionListStyles = useMemo(
    () => ({
      root: {
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: 12,
        marginBottom: 16,
      },
      list: { flexGrow: 1 },
      header: { padding: 16 },
      title: { fontSize: 18, fontWeight: "700", color: colors.text },
      description: { fontSize: 14, color: colors.textMuted },
      item: {
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.surfaceBorder,
      },
      itemCurrent: { backgroundColor: colors.inputBackground },
      itemPrimary: { fontSize: 14, color: colors.text },
      itemMeta: { fontSize: 12, color: colors.textMuted },
      revokeButton: {
        backgroundColor: colors.danger,
        borderRadius: 6,
        padding: 8,
      },
      revokeButtonText: { color: "#ffffff" },
      revokeOthersButton: {
        backgroundColor: colors.danger,
        borderRadius: 8,
        padding: 8,
      },
      revokeOthersButtonText: { color: "#ffffff" },
      emptyState: { color: colors.textMuted },
      loadingState: { padding: 16 },
      errorState: { color: colors.danger },
    }),
    [colors],
  );

  const formCardStyle: ViewStyle = useMemo(
    () => ({
      width: formWidth,
      marginLeft: formMarginLeft,
      padding: 24,
      backgroundColor: colors.background,
      borderRadius: 12,
    }),
    [colors.background, formWidth, formMarginLeft],
  );

  const buttonPrimaryStyle: ViewStyle = useMemo(
    () => ({
      backgroundColor: colors.primary,
      borderRadius: 8,
    }),
    [colors.primary],
  );

  const buttonDangerStyle: ViewStyle = useMemo(
    () => ({
      backgroundColor: colors.danger,
      borderRadius: 8,
    }),
    [colors.danger],
  );

  return {
    colorScheme,
    isDark,
    colors,
    authScreenStyles,
    sessionListStyles,
    formCardStyle,
    buttonPrimaryStyle,
    buttonDangerStyle,
  };
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
  const { colorScheme } = useTheme();
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
  );
}

export default function App() {
  return (
    <View className="flex-1">
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

function FooterLink({
  label,
  onPress,
  style,
}: {
  label: string;
  onPress: () => void;
  style?: TextStyle;
}) {
  return (
    <Pressable onPress={onPress}>
      <Text className="text-sm font-semibold" style={style}>
        {label}
      </Text>
    </Pressable>
  );
}

function InnerApp() {
  const [screen, setScreen] = useState<Screen>("signIn");
  const [deepLink, setDeepLink] = useState<DeepLinkRoute>(null);
  const authClient = useConvexAuthClientContext();
  const session = authClient?.useSession();
  const { colors, authScreenStyles, sessionListStyles, formCardStyle, buttonPrimaryStyle } =
    useTheme();

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
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: colors.background }}
      >
        <Text className="text-base" style={{ color: colors.textMuted }}>
          Loading…
        </Text>
      </View>
    );
  }

  if (screen === "enableTwoFactor" && session.data?.user) {
    return (
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
        style={{ backgroundColor: colors.background }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={formCardStyle}>
          <ConvexEnableTwoFactorForm
            issuer="convex-auth-rn"
            onEnrolled={() => setScreen("signIn")}
          />
          <View className="px-4 pt-4 items-center">
            <FooterLink
              label="Back"
              onPress={() => setScreen("signIn")}
              style={{ color: colors.primary }}
            />
          </View>
        </View>
      </ScrollView>
    );
  }

  if (screen === "reset") {
    return (
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
        style={{ backgroundColor: colors.background }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={formCardStyle}>
          <ConvexResetPasswordForm
            token={deepLink?.token ?? ""}
            onReset={() => setScreen("signIn")}
          />
          <View className="px-4 pt-4 items-center">
            <Text className="text-sm" style={{ color: colors.textSubtle }}>
              Done?{" "}
            </Text>
            <FooterLink
              label="Sign in"
              onPress={() => setScreen("signIn")}
              style={{ color: colors.primary }}
            />
          </View>
        </View>
      </ScrollView>
    );
  }

  if (screen === "verify") {
    return (
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
        style={{ backgroundColor: colors.background }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={formCardStyle}>
          <ConvexVerifyEmailScreen
            token={deepLink?.token ?? ""}
            userEmail={session.data?.user?.email ?? null}
            resendCallbackUrl={Linking.createURL("/verify-email")}
            onVerified={() => setScreen("signIn")}
          />
          <View className="px-4 pt-4 items-center">
            <Text className="text-sm" style={{ color: colors.textSubtle }}>
              Verified?{" "}
            </Text>
            <FooterLink
              label="Sign in"
              onPress={() => setScreen("signIn")}
              style={{ color: colors.primary }}
            />
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
        sessionListStyles={sessionListStyles}
      />
    );
  }

  const redirectUrl = Linking.createURL("/");

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
      style={{ backgroundColor: colors.background }}
      keyboardShouldPersistTaps="handled"
    >
      {screen === "signUp" ? (
        <>
          <ExpoAuthClientSignUpScreen
            signInUrl=""
            forceRedirectUrl={redirectUrl}
            title="Create account"
            description="Sign up with Google, GitHub, Discord, or email."
            styles={authScreenStyles}
            socialProviders={socialProviders}
          />
          <View
            className="flex-row mt-4"
            style={{ width: formCardStyle.width, marginLeft: formCardStyle.marginLeft }}
          >
            <Text className="text-sm" style={{ color: colors.textSubtle }}>
              Already have an account?{" "}
            </Text>
            <FooterLink
              label="Sign in"
              onPress={() => setScreen("signIn")}
              style={{ color: colors.primary }}
            />
          </View>
        </>
      ) : screen === "forgot" ? (
        <View style={formCardStyle}>
          <ConvexForgotPasswordForm
            resetPasswordUrl={Linking.createURL("/reset-password")}
            onRequested={() => setScreen("signIn")}
          />
          <View className="px-4 pt-4 items-center">
            <Text className="text-sm" style={{ color: colors.textSubtle }}>
              Remembered your password?{" "}
            </Text>
            <FooterLink
              label="Sign in"
              onPress={() => setScreen("signIn")}
              style={{ color: colors.primary }}
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
            styles={authScreenStyles}
            socialProviders={socialProviders}
          />
          <Pressable
            onPress={async () => {
              await authClient?.signIn.anonymous({});
            }}
            className="self-stretch mt-4 py-3 px-6 rounded-lg items-center"
            style={[
              buttonPrimaryStyle,
              { width: formCardStyle.width, marginLeft: formCardStyle.marginLeft },
            ]}
          >
            <Text className="text-sm font-semibold" style={{ color: colors.primaryText }}>
              Continue as guest
            </Text>
          </Pressable>
          <View
            className="flex-row mt-4"
            style={{ width: formCardStyle.width, marginLeft: formCardStyle.marginLeft }}
          >
            <Text className="text-sm" style={{ color: colors.textSubtle }}>
              Don’t have an account?{" "}
            </Text>
            <FooterLink
              label="Sign up"
              onPress={() => setScreen("signUp")}
              style={{ color: colors.primary }}
            />
          </View>
          <View
            className="flex-row mt-2"
            style={{ width: formCardStyle.width, marginLeft: formCardStyle.marginLeft }}
          >
            <FooterLink
              label="Forgot password?"
              onPress={() => setScreen("forgot")}
              style={{ color: colors.primary }}
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}

function SignedInView({
  onSignOut,
  onEnableTwoFactor,
  sessionListStyles,
}: {
  onSignOut: () => void | Promise<void>;
  onEnableTwoFactor: () => void;
  sessionListStyles: ExpoSessionListStyles;
}) {
  const authClient = useConvexAuthClientContext();
  const session = authClient?.useSession();
  const user = session?.data?.user;
  const currentToken = session?.data?.session?.token;
  const { colors, buttonDangerStyle } = useTheme();

  return (
    <View className="flex-1 p-6" style={{ backgroundColor: colors.background }}>
      <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: colors.surface }}>
        <Text className="text-lg font-bold" style={{ color: colors.text }}>
          Signed in
        </Text>
        {user?.name ? (
          <Text className="text-base" style={{ color: colors.textSubtle }}>
            {user.name}
          </Text>
        ) : null}
        {user?.email ? (
          <Text className="text-sm" style={{ color: colors.textMuted }}>
            {user.email}
          </Text>
        ) : null}
        <Text
          className="text-xs mt-2"
          style={{ color: colors.textMuted }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          Token: {currentToken ?? "none"}
        </Text>
      </View>
      <ConvexSessionList currentSessionToken={currentToken ?? null} styles={sessionListStyles} />
      <Pressable
        onPress={onEnableTwoFactor}
        className="self-stretch mt-4 py-3 px-6 rounded-lg items-center border"
        style={{ borderColor: colors.surfaceBorder }}
      >
        <Text className="text-sm font-semibold" style={{ color: colors.text }}>
          Enable two-factor auth
        </Text>
      </Pressable>
      <Pressable
        onPress={async () => {
          await onSignOut();
        }}
        className="self-stretch mt-4 py-3 px-6 rounded-lg items-center"
        style={buttonDangerStyle}
      >
        <Text className="text-sm font-semibold" style={{ color: "#ffffff" }}>
          Sign out
        </Text>
      </Pressable>
    </View>
  );
}
