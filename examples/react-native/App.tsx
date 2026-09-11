import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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

function AuthProviders({ children }: { children: React.ReactNode }) {
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

  if (!ready) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
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

function SignedInView({ onSignOut }: { onSignOut: () => void | Promise<void> }) {
  const authClient = useConvexAuthClientContext();
  const session = authClient?.useSession();
  const user = session?.data?.user;
  const currentToken = session?.data?.session?.token;

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

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  loadingText: {
    fontSize: 16,
    color: "#64748b",
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#ffffff",
  },
  footer: {
    flexDirection: "row",
    marginTop: 16,
  },
  footerText: {
    color: "#475569",
  },
  footerLink: {
    color: "#0ea5e9",
    fontWeight: "600",
  },
  guestButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: "#0ea5e9",
  },
  guestButtonText: {
    color: "#ffffff",
    fontWeight: "600",
  },
  signedIn: {
    flex: 1,
    padding: 24,
    backgroundColor: "#f8fafc",
  },
  userCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  userTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  userSubtitle: {
    fontSize: 16,
    color: "#334155",
  },
  userBody: {
    fontSize: 14,
    color: "#64748b",
  },
  token: {
    marginTop: 8,
    fontSize: 12,
    color: "#94a3b8",
  },
  signOutButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: "#ef4444",
    alignItems: "center",
  },
  signOutButtonText: {
    color: "#ffffff",
    fontWeight: "600",
  },
});

const authScreenStyles: ExpoAuthClientScreenStyles = {
  root: { padding: 24, backgroundColor: "#ffffff" },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  description: { fontSize: 14, color: "#64748b", marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  inputText: { color: "#0f172a" },
  submitButton: {
    backgroundColor: "#0f172a",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  submitButtonText: { color: "#ffffff", fontWeight: "600" },
  providerButton: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    alignItems: "center",
  },
  providerButtonText: { color: "#0f172a" },
  error: { color: "#ef4444", marginBottom: 8 },
};

const sessionListStyles: ExpoSessionListStyles = {
  root: { backgroundColor: "#ffffff", borderRadius: 12, marginBottom: 16 },
  item: { padding: 12, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  itemPrimary: { fontSize: 14 },
  itemMeta: { fontSize: 12 },
  revokeButton: { backgroundColor: "#ef4444", borderRadius: 6, padding: 8 },
  revokeButtonText: { color: "#ffffff" },
};
