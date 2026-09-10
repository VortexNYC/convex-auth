import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  ConvexSessionList,
  ExpoAuthClientSignInScreen,
  ExpoAuthClientSignUpScreen,
  useConvexAuthClientContext,
  type ExpoAuthClientScreenStyles,
  type ExpoSessionListStyles,
} from "@vortex-api/convex-auth/react-native";

type Screen = "signIn" | "signUp" | "signedIn";

const socialProviders = [
  { provider: "google", label: "Google" },
  { provider: "github", label: "GitHub" },
  { provider: "discord", label: "Discord" },
] as const;

export default function App() {
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

  const redirectUrl = typeof window !== "undefined" ? window.location.origin : "";

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
      <Text style={styles.title}>Signed in</Text>
      <Text style={styles.subtitle}>{user?.email ?? user?.name ?? "Welcome"}</Text>
      <Pressable style={styles.button} onPress={() => void onSignOut()}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
      <View style={styles.sessions}>
        <ConvexSessionList currentSessionToken={currentToken} styles={sessionListStyles} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#ffffff",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#666666",
  },
  signedIn: {
    flex: 1,
    padding: 24,
    paddingTop: 64,
    backgroundColor: "#ffffff",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 16,
    color: "#666666",
    marginTop: 8,
  },
  button: {
    marginTop: 16,
    padding: 14,
    borderRadius: 8,
    backgroundColor: "#111111",
    alignItems: "center",
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "600",
  },
  sessions: {
    marginTop: 8,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 16,
  },
  footerText: {
    color: "#666666",
  },
  footerLink: {
    color: "#2563eb",
    fontWeight: "500",
  },
});

const authScreenStyles: ExpoAuthClientScreenStyles = {
  root: {
    padding: 0,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: "#666666",
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  inputText: {
    fontSize: 16,
  },
  submitButton: {
    marginTop: 16,
    padding: 14,
    borderRadius: 8,
    backgroundColor: "#111111",
    alignItems: "center",
  },
  submitButtonText: {
    color: "#ffffff",
    fontWeight: "600",
    textAlign: "center",
  },
  providerButton: {
    marginTop: 12,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    alignItems: "center",
  },
  providerButtonText: {
    fontWeight: "500",
  },
  error: {
    color: "#dc2626",
    marginTop: 8,
  },
};

const sessionListStyles: ExpoSessionListStyles = {
  root: { marginTop: 24 },
  title: { fontSize: 18, fontWeight: "600" },
  description: { color: "#666666" },
  item: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 8,
    marginTop: 8,
  },
  itemPrimary: { fontWeight: "500" },
  itemMeta: { color: "#666666", marginTop: 2 },
  revokeButton: {
    marginTop: 8,
    padding: 8,
    backgroundColor: "#f5f5f5",
    borderRadius: 6,
  },
  revokeButtonText: { color: "#dc2626" },
};
