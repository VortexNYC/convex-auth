import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  useColorScheme,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { clsx } from "clsx";

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

export type ExpoAuthClientScreenClassNames = {
  root?: string;
  title?: string;
  description?: string;
  input?: string;
  inputText?: string;
  submitButton?: string;
  submitButtonText?: string;
  error?: string;
  footer?: string;
  providerButton?: string;
  providerButtonText?: string;
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
  classNames?: ExpoAuthClientScreenClassNames;
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
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const s = props.styles ?? {};
  const c = props.classNames ?? {};
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

  const rootClassName = clsx(
    "w-full max-w-md self-center p-4 bg-background",
    c.root,
    isDark && "dark",
  );

  if (twoFactorPending) {
    return (
      <View className={rootClassName} style={s.root}>
        <ConvexVerifyTwoFactorForm
          onVerified={() => {
            void props.navigate?.({ to: props.forceRedirectUrl, replace: true });
          }}
        />
      </View>
    );
  }

  return (
    <View className={rootClassName} style={s.root}>
      <Text className={clsx("text-2xl font-bold text-foreground", c.title)} style={s.title}>
        {copy.title}
      </Text>
      <Text className={clsx("text-sm text-muted-foreground", c.description)} style={s.description}>
        {copy.description}
      </Text>
      <TextInput
        className={clsx(
          "w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm",
          c.input,
          c.inputText,
        )}
        style={[s.input, s.inputText]}
        placeholder={copy.emailPlaceholder}
        placeholderTextColorClassName="accent-muted-foreground"
        accessibilityLabel="Email"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        className={clsx(
          "w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm",
          c.input,
          c.inputText,
        )}
        style={[s.input, s.inputText]}
        placeholder={copy.passwordPlaceholder}
        placeholderTextColorClassName="accent-muted-foreground"
        accessibilityLabel="Password"
        autoCapitalize="none"
        autoComplete="password"
        textContentType="password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error !== null ? (
        <Text className={clsx("text-sm text-destructive mt-2", c.error)} style={s.error}>
          {error}
        </Text>
      ) : null}
      <Pressable
        className={clsx("w-full bg-primary rounded-md p-3 mt-4 items-center", c.submitButton)}
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
            className={clsx("text-sm font-semibold text-primary-foreground", c.submitButtonText)}
            style={s.submitButtonText}
          >
            {copy.submitLabel}
          </Text>
        )}
      </Pressable>
      {props.socialProviders?.map((provider) => (
        <Pressable
          key={provider.provider}
          className={clsx(
            "w-full border border-border bg-card rounded-md p-3 mt-2 items-center",
            c.providerButton,
          )}
          style={s.providerButton}
          onPress={() => handleSocialSignIn(provider.provider)}
          disabled={provider.disabled}
          accessibilityRole="button"
          accessibilityLabel={`Sign in with ${provider.label ?? provider.provider}`}
        >
          <Text
            className={clsx("text-sm text-card-foreground", c.providerButtonText)}
            style={s.providerButtonText}
          >
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
  classNames?: ExpoAuthClientScreenClassNames;
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
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const s = props.styles ?? {};
  const c = props.classNames ?? {};
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

  const rootClassName = clsx(
    "w-full max-w-md self-center p-4 bg-background",
    c.root,
    isDark && "dark",
  );

  if (twoFactorPending) {
    return (
      <View className={rootClassName} style={s.root}>
        <ConvexVerifyTwoFactorForm
          onVerified={() => {
            void props.navigate?.({ to: props.forceRedirectUrl, replace: true });
          }}
        />
      </View>
    );
  }

  return (
    <View className={rootClassName} style={s.root}>
      <Text className={clsx("text-2xl font-bold text-foreground", c.title)} style={s.title}>
        {copy.title}
      </Text>
      <Text className={clsx("text-sm text-muted-foreground", c.description)} style={s.description}>
        {copy.description}
      </Text>
      <TextInput
        className={clsx(
          "w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm",
          c.input,
          c.inputText,
        )}
        style={[s.input, s.inputText]}
        placeholder={copy.namePlaceholder}
        placeholderTextColorClassName="accent-muted-foreground"
        accessibilityLabel="Name"
        autoCapitalize="words"
        autoCorrect={false}
        autoComplete="name"
        textContentType="name"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        className={clsx(
          "w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm",
          c.input,
          c.inputText,
        )}
        style={[s.input, s.inputText]}
        placeholder={copy.emailPlaceholder}
        placeholderTextColorClassName="accent-muted-foreground"
        accessibilityLabel="Email"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        className={clsx(
          "w-full border border-input bg-background text-foreground rounded-md px-3 py-2 text-sm",
          c.input,
          c.inputText,
        )}
        style={[s.input, s.inputText]}
        placeholder={copy.passwordPlaceholder}
        placeholderTextColorClassName="accent-muted-foreground"
        accessibilityLabel="Password"
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error !== null ? (
        <Text className={clsx("text-sm text-destructive mt-2", c.error)} style={s.error}>
          {error}
        </Text>
      ) : null}
      <Pressable
        className={clsx("w-full bg-primary rounded-md p-3 mt-4 items-center", c.submitButton)}
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
            className={clsx("text-sm font-semibold text-primary-foreground", c.submitButtonText)}
            style={s.submitButtonText}
          >
            {copy.submitLabel}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
