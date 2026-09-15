import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import type { ConvexAuthSocialProvider } from "../react/client";
import { useAuthActions, useConvexAuthClientContext } from "../react/client";

import { ConvexVerifyTwoFactorForm } from "./convex-verify-two-factor-form";

export type ExpoAuthClientScreenStyles = {
  root?: StyleProp<ViewStyle>;
  title?: StyleProp<TextStyle>;
  description?: StyleProp<TextStyle>;
  input?: StyleProp<TextStyle>;
  inputText?: StyleProp<TextStyle>;
  submitButton?: StyleProp<ViewStyle>;
  submitButtonText?: StyleProp<TextStyle>;
  error?: StyleProp<TextStyle>;
  footer?: StyleProp<TextStyle>;
  providerButton?: StyleProp<ViewStyle>;
  providerButtonText?: StyleProp<TextStyle>;
};

type NavigateTo = (args: { to: string; replace?: boolean }) => void | Promise<void>;

export type ExpoAuthClientSignInScreenProps = {
  signUpUrl: string;
  forceRedirectUrl: string;
  navigate?: NavigateTo;
  forgotPasswordHref?: string;
  title?: string;
  description?: string;
  styles?: ExpoAuthClientScreenStyles;
  socialProviders?: readonly ConvexAuthSocialProvider[];
  onOpened?: () => void;
  onRuntimeUnavailable?: () => void;
};

export function ExpoAuthClientSignInScreen(props: ExpoAuthClientSignInScreenProps) {
  const authClient = useConvexAuthClientContext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [twoFactorPending, setTwoFactorPending] = useState(false);

  const s = props.styles ?? {};
  const copy = {
    title: props.title ?? "Sign in",
    description: props.description ?? "Access your workspace.",
    emailPlaceholder: "Email",
    passwordPlaceholder: "Password",
    submitLabel: "Sign in",
    submittingLabel: "Signing in...",
  };

  const authActions = useAuthActions();

  const handleSocialSignIn = useCallback(
    async (provider: string) => {
      setError(null);
      if (authClient === null) {
        props.onRuntimeUnavailable?.();
        return;
      }
      try {
        const result = await authClient.signIn.social({
          provider,
          callbackURL: props.forceRedirectUrl,
        });
        if (result.error) {
          setError(result.error.message ?? "Social sign-in failed");
          return;
        }
        const url = result.data?.url;
        if (typeof url !== "string" || url.length === 0) {
          setError("Could not start social sign-in");
          return;
        }

        try {
          const WebBrowser = await import("expo-web-browser");
          const session = await WebBrowser.openAuthSessionAsync(url, props.forceRedirectUrl);

          if (session.type === "success" && typeof session.url === "string") {
            const searchIndex = session.url.indexOf("?");
            const search = searchIndex >= 0 ? session.url.slice(searchIndex + 1) : "";
            const params = new URLSearchParams(search);
            const token = params.get("token");
            const refreshToken = params.get("refreshToken");
            const sessionId = params.get("sessionId");
            const oauthError = params.get("error");

            if (oauthError) {
              setError(params.get("error_description") ?? oauthError);
              return;
            }

            if (token) {
              authActions.setToken(token);
              authActions.setRefreshToken(refreshToken ?? null);
              authActions.setSessionId(sessionId ?? null);
              await props.navigate?.({ to: props.forceRedirectUrl, replace: true });
            }
          } else if (session.type === "cancel" || session.type === "dismiss") {
            // User closed the browser without completing the flow.
          }
        } catch {
          // expo-web-browser may not be installed or the device may not
          // support an auth session; fall through to the system browser.
          const { openURL } = await import("expo-linking");
          await openURL(url);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Social sign-in failed");
      }
    },
    [authClient, authActions, props.forceRedirectUrl, props.navigate, props.onRuntimeUnavailable],
  );

  const handleSubmit = useCallback(async () => {
    setError(null);
    if (authClient === null) {
      props.onRuntimeUnavailable?.();
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await authClient.signIn.email({
        email,
        password,
        callbackURL: props.forceRedirectUrl,
      });
      if (result.error) {
        setError(result.error.message ?? "Sign-in failed");
        return;
      }
      if (result.data?.twoFactorRedirect === true) {
        setTwoFactorPending(true);
        return;
      }
      await props.navigate?.({ to: props.forceRedirectUrl, replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    authClient,
    email,
    password,
    props.forceRedirectUrl,
    props.navigate,
    props.onRuntimeUnavailable,
  ]);

  if (twoFactorPending) {
    return (
      <View className="w-full" style={s.root}>
        <ConvexVerifyTwoFactorForm
          onVerified={() => {
            void props.navigate?.({ to: props.forceRedirectUrl, replace: true });
          }}
        />
      </View>
    );
  }

  return (
    <View className="w-full flex-col" style={s.root}>
      <Text className="text-2xl font-bold text-foreground mb-2" style={s.title}>
        {copy.title}
      </Text>
      <Text className="text-base text-muted-foreground mb-4" style={s.description}>
        {copy.description}
      </Text>
      <TextInput
        className="w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm"
        placeholderTextColorClassName="accent-muted-foreground"
        style={[s.input, s.inputText]}
        placeholder={copy.emailPlaceholder}
        accessibilityLabel="Email"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        className="w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm"
        placeholderTextColorClassName="accent-muted-foreground"
        style={[s.input, s.inputText]}
        placeholder={copy.passwordPlaceholder}
        accessibilityLabel="Password"
        autoCapitalize="none"
        autoComplete="password"
        textContentType="password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error !== null ? (
        <Text className="text-destructive text-sm mb-3" style={s.error}>
          {error}
        </Text>
      ) : null}
      <Pressable
        className="w-full mt-3 px-3 py-3 rounded-md bg-primary items-center justify-center"
        style={s.submitButton}
        onPress={handleSubmit}
        disabled={isSubmitting}
        accessibilityRole="button"
        accessibilityLabel={copy.submitLabel}
      >
        {isSubmitting ? (
          <ActivityIndicator colorClassName="accent-primary-foreground" />
        ) : (
          <Text
            className="text-sm font-semibold text-primary-foreground"
            style={s.submitButtonText}
          >
            {copy.submitLabel}
          </Text>
        )}
      </Pressable>
      {props.socialProviders?.map((provider) => (
        <Pressable
          key={provider.provider}
          className="w-full mt-2 px-3 py-3 rounded-md border border-input bg-background items-center justify-center"
          style={s.providerButton}
          onPress={() => handleSocialSignIn(provider.provider)}
          disabled={provider.disabled}
          accessibilityRole="button"
          accessibilityLabel={`Sign in with ${provider.label ?? provider.provider}`}
        >
          <Text className="text-sm font-medium text-foreground" style={s.providerButtonText}>
            Sign in with {provider.label ?? provider.provider}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export type ExpoAuthClientSignUpScreenProps = {
  signInUrl: string;
  forceRedirectUrl: string;
  navigate?: NavigateTo;
  title?: string;
  description?: string;
  styles?: ExpoAuthClientScreenStyles;
  socialProviders?: readonly ConvexAuthSocialProvider[];
  onOpened?: () => void;
  onRuntimeUnavailable?: () => void;
};

export function ExpoAuthClientSignUpScreen(props: ExpoAuthClientSignUpScreenProps) {
  const authClient = useConvexAuthClientContext();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [twoFactorPending, setTwoFactorPending] = useState(false);

  const s = props.styles ?? {};
  const copy = {
    title: props.title ?? "Sign up",
    description: props.description ?? "Create an account.",
    namePlaceholder: "Name",
    emailPlaceholder: "Email",
    passwordPlaceholder: "Password",
    submitLabel: "Sign up",
    submittingLabel: "Signing up...",
  };

  const handleSubmit = useCallback(async () => {
    setError(null);
    if (authClient === null) {
      props.onRuntimeUnavailable?.();
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await authClient.signUp.email({
        name,
        email,
        password,
        callbackURL: props.forceRedirectUrl,
      });
      if (result.error) {
        setError(result.error.message ?? "Sign-up failed");
        return;
      }
      if (result.data?.twoFactorRedirect === true) {
        setTwoFactorPending(true);
        return;
      }
      await props.navigate?.({ to: props.forceRedirectUrl, replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    authClient,
    name,
    email,
    password,
    props.forceRedirectUrl,
    props.navigate,
    props.onRuntimeUnavailable,
  ]);

  if (twoFactorPending) {
    return (
      <View className="w-full" style={s.root}>
        <ConvexVerifyTwoFactorForm
          onVerified={() => {
            void props.navigate?.({ to: props.forceRedirectUrl, replace: true });
          }}
        />
      </View>
    );
  }

  return (
    <View className="w-full flex-col" style={s.root}>
      <Text className="text-2xl font-bold text-foreground mb-2" style={s.title}>
        {copy.title}
      </Text>
      <Text className="text-base text-muted-foreground mb-4" style={s.description}>
        {copy.description}
      </Text>
      <TextInput
        className="w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm"
        placeholderTextColorClassName="accent-muted-foreground"
        style={[s.input, s.inputText]}
        placeholder={copy.namePlaceholder}
        accessibilityLabel="Name"
        autoCapitalize="words"
        autoCorrect={false}
        autoComplete="name"
        textContentType="name"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        className="w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm"
        placeholderTextColorClassName="accent-muted-foreground"
        style={[s.input, s.inputText]}
        placeholder={copy.emailPlaceholder}
        accessibilityLabel="Email"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        className="w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm"
        placeholderTextColorClassName="accent-muted-foreground"
        style={[s.input, s.inputText]}
        placeholder={copy.passwordPlaceholder}
        accessibilityLabel="Password"
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error !== null ? (
        <Text className="text-destructive text-sm mb-3" style={s.error}>
          {error}
        </Text>
      ) : null}
      <Pressable
        className="w-full mt-3 px-3 py-3 rounded-md bg-primary items-center justify-center"
        style={s.submitButton}
        onPress={handleSubmit}
        disabled={isSubmitting}
        accessibilityRole="button"
        accessibilityLabel={copy.submitLabel}
      >
        {isSubmitting ? (
          <ActivityIndicator colorClassName="accent-primary-foreground" />
        ) : (
          <Text
            className="text-sm font-semibold text-primary-foreground"
            style={s.submitButtonText}
          >
            {copy.submitLabel}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
