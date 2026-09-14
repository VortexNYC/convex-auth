import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  useWindowDimensions,
  Dimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as ScreenOrientation from "expo-screen-orientation";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import { ConvexReactClient, ConvexProvider } from "convex/react";
import {
  ConvexSessionList,
  ExpoAuthClientSignInScreen,
  ExpoAuthClientSignUpScreen,
  ExpoConvexAuthClientProvider,
  useConvexAuthClientContext,
  type ExpoAuthClientScreenStyles,
  type ExpoConvexAuthStorage,
  type ExpoSessionListStyles,
  type NativeAuthActions,
} from "@vortex-api/convex-auth/react-native";
import { api } from "./convex/_generated/api";

type Screen = "signIn" | "signUp" | "signedIn";

const TOKEN_KEYS = ["convex-auth-token", "convex-auth-refresh-token", "convex-auth-session-id"];

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
if (typeof convexUrl !== "string" || convexUrl.length === 0) {
  throw new Error("EXPO_PUBLIC_CONVEX_URL is not set");
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

  const styles = useMemo(
    () =>
      StyleSheet.create({
        loading: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        },
        loadingText: {
          fontSize: 16,
          color: colors.textMuted,
        },
        container: {
          flex: 1,
          alignItems: "flex-start",
          justifyContent: "center",
          padding: 24,
          backgroundColor: colors.background,
        },
        footer: {
          flexDirection: "row",
          marginTop: 16,
        },
        footerText: {
          color: colors.textSubtle,
        },
        footerLink: {
          color: colors.primary,
          fontWeight: "600",
        },
        guestButton: {
          alignSelf: "stretch",
          marginTop: 16,
          paddingVertical: 12,
          paddingHorizontal: 24,
          borderRadius: 8,
          backgroundColor: colors.primary,
        },
        guestButtonText: {
          color: colors.primaryText,
          fontWeight: "600",
        },
        signedIn: {
          flex: 1,
          padding: 24,
          backgroundColor: colors.background,
        },
        userCard: {
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
          shadowColor: isDark ? "#000000" : "#000000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.1,
          shadowRadius: 2,
          elevation: 2,
        },
        userTitle: {
          fontSize: 18,
          fontWeight: "700",
          marginBottom: 4,
          color: colors.text,
        },
        userSubtitle: {
          fontSize: 16,
          color: colors.textSubtle,
        },
        userBody: {
          fontSize: 14,
          color: colors.textMuted,
        },
        token: {
          marginTop: 8,
          fontSize: 12,
          color: colors.textMuted,
        },
        signOutButton: {
          alignSelf: "stretch",
          marginTop: 16,
          paddingVertical: 12,
          paddingHorizontal: 24,
          borderRadius: 8,
          backgroundColor: colors.danger,
          alignItems: "center",
        },
        signOutButtonText: {
          color: "#ffffff",
          fontWeight: "600",
        },
      }),
    [colors, isDark, formWidth],
  );

  const authScreenStyles: ExpoAuthClientScreenStyles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          width: formWidth,
          marginLeft: (screenWidth - 48 - formWidth) / 2,
          padding: 24,
          backgroundColor: colors.background,
          alignItems: "stretch",
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
          alignSelf: "stretch",
          borderWidth: 1,
          borderColor: colors.inputBorder,
          borderRadius: 8,
          padding: 12,
          marginBottom: 12,
          backgroundColor: colors.inputBackground,
        },
        inputText: { color: colors.text },
        submitButton: {
          alignSelf: "stretch",
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
          alignSelf: "stretch",
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
    [colors, isDark, formWidth],
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

  return {
    colorScheme,
    isDark,
    styles,
    authScreenStyles,
    sessionListStyles,
  };
}

function AuthProviders({ children }: { children: React.ReactNode }) {
  const { colorScheme, styles } = useTheme();
  const cacheRef = useRef<Record<string, string>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded: Record<string, string> = {};
      for (const key of TOKEN_KEYS) {
        const value = await SecureStore.getItemAsync(key);
        if (value !== null && value !== undefined) {
          loaded[key] = value;
        }
      }
      if (!cancelled) {
        cacheRef.current = loaded;
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  if (!ready) {
    return (
      <>
        <StatusBar style={statusBarStyle} />
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      </>
    );
  }

  return (
    <ConvexProvider client={convex}>
      <ExpoConvexAuthClientProvider
        actions={api.auth as unknown as NativeAuthActions}
        storage={storage}
        initialUrl={Linking.createURL("/")}
        subscribeToUrl={(handler) => {
          const subscription = Linking.addEventListener("url", ({ url }) => handler(url));
          return () => subscription.remove();
        }}
      >
        <StatusBar style={statusBarStyle} />
        {children}
      </ExpoConvexAuthClientProvider>
    </ConvexProvider>
  );
}

export default function App() {
  return (
    <AuthProviders>
      <InnerApp />
    </AuthProviders>
  );
}

function InnerApp() {
  const [screen, setScreen] = useState<Screen>("signIn");
  const authClient = useConvexAuthClientContext();
  const session = authClient?.useSession();
  const { styles, authScreenStyles, sessionListStyles } = useTheme();

  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {
      // Ignore if Expo Go build does not include the screen orientation module.
    });
  }, []);

  if (authClient === null || session === undefined || session.isPending) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading…</Text>
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
        sessionListStyles={sessionListStyles}
      />
    );
  }

  const redirectUrl = Linking.createURL("/");

  return (
    <View style={styles.container}>
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
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Pressable onPress={() => setScreen("signIn")}>
              <Text style={styles.footerLink}>Sign in</Text>
            </Pressable>
          </View>
        </>
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
            style={styles.guestButton}
            onPress={async () => {
              await authClient?.signIn.anonymous({});
            }}
          >
            <Text style={styles.guestButtonText}>Continue as guest</Text>
          </Pressable>
          <View style={styles.footer}>
            <Text style={styles.footerText}>Don’t have an account? </Text>
            <Pressable onPress={() => setScreen("signUp")}>
              <Text style={styles.footerLink}>Sign up</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

function SignedInView({
  onSignOut,
  sessionListStyles,
}: {
  onSignOut: () => void | Promise<void>;
  sessionListStyles: ExpoSessionListStyles;
}) {
  const authClient = useConvexAuthClientContext();
  const session = authClient?.useSession();
  const user = session?.data?.user;
  const currentToken = session?.data?.session?.token;
  const { styles } = useTheme();

  return (
    <View style={styles.signedIn}>
      <View style={styles.userCard}>
        <Text style={styles.userTitle}>Signed in</Text>
        {user?.name ? <Text style={styles.userSubtitle}>{user.name}</Text> : null}
        {user?.email ? <Text style={styles.userBody}>{user.email}</Text> : null}
        <Text style={styles.token} numberOfLines={1} ellipsizeMode="tail">
          Token: {currentToken ?? "none"}
        </Text>
      </View>
      <ConvexSessionList currentSessionToken={currentToken ?? null} styles={sessionListStyles} />
      <Pressable
        style={styles.signOutButton}
        onPress={async () => {
          await onSignOut();
        }}
      >
        <Text style={styles.signOutButtonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}
