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
import { useConvexAuthClientContext } from "../react/client";

import { ConvexVerifyTwoFactorForm } from "./convex-verify-two-factor-form";

export type ExpoAuthClientScreenStyles = {
  root?: StyleProp<ViewStyle>;
  title?: StyleProp<TextStyle>;
  description?: StyleProp<TextStyle>;
  input?: StyleProp<ViewStyle>;
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
        if (typeof url === "string") {
          const { openURL } = await import("expo-linking");
          await openURL(url);
        } else {
          setError("Could not start social sign-in");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Social sign-in failed");
      }
    },
    [authClient, props.forceRedirectUrl, props.onRuntimeUnavailable],
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
      <View className="p-4" style={s.root}>
        <ConvexVerifyTwoFactorForm
          onVerified={() => {
            void props.navigate?.({ to: props.forceRedirectUrl, replace: true });
          }}
        />
      </View>
    );
  }

  return (
    <View className="p-4" style={s.root}>
      <Text className="text-2xl font-bold" style={s.title}>
        {copy.title}
      </Text>
      <Text className="text-muted-foreground" style={s.description}>
        {copy.description}
      </Text>
      <TextInput
        className="border p-2 mt-4 rounded"
        style={[s.input, s.inputText]}
        placeholder={copy.emailPlaceholder}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        className="border p-2 mt-2 rounded"
        style={[s.input, s.inputText]}
        placeholder={copy.passwordPlaceholder}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error !== null ? (
        <Text className="text-destructive mt-2" style={s.error}>
          {error}
        </Text>
      ) : null}
      <Pressable
        className="bg-primary p-3 mt-4 rounded"
        style={s.submitButton}
        onPress={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator />
        ) : (
          <Text className="text-primary-foreground text-center" style={s.submitButtonText}>
            {copy.submitLabel}
          </Text>
        )}
      </Pressable>
      {props.socialProviders?.map((provider) => (
        <Pressable
          key={provider.provider}
          className="border p-3 mt-2 rounded"
          style={s.providerButton}
          onPress={() => handleSocialSignIn(provider.provider)}
          disabled={provider.disabled}
        >
          <Text className="text-center" style={s.providerButtonText}>
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
      <View className="p-4" style={s.root}>
        <ConvexVerifyTwoFactorForm
          onVerified={() => {
            void props.navigate?.({ to: props.forceRedirectUrl, replace: true });
          }}
        />
      </View>
    );
  }

  return (
    <View className="p-4" style={s.root}>
      <Text className="text-2xl font-bold" style={s.title}>
        {copy.title}
      </Text>
      <Text className="text-muted-foreground" style={s.description}>
        {copy.description}
      </Text>
      <TextInput
        className="border p-2 mt-4 rounded"
        style={[s.input, s.inputText]}
        placeholder={copy.namePlaceholder}
        value={name}
        onChangeText={setName}
      />
      <TextInput
        className="border p-2 mt-2 rounded"
        style={[s.input, s.inputText]}
        placeholder={copy.emailPlaceholder}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        className="border p-2 mt-2 rounded"
        style={[s.input, s.inputText]}
        placeholder={copy.passwordPlaceholder}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error !== null ? (
        <Text className="text-destructive mt-2" style={s.error}>
          {error}
        </Text>
      ) : null}
      <Pressable
        className="bg-primary p-3 mt-4 rounded"
        style={s.submitButton}
        onPress={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator />
        ) : (
          <Text className="text-primary-foreground text-center" style={s.submitButtonText}>
            {copy.submitLabel}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
