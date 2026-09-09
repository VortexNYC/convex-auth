import { useAction, useQuery, useMutation } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { buildExpoAuthSignUpUrl } from "./auth-page-utils";

type NavigateTo = (args: { to: string; replace?: boolean }) => void | Promise<void>;

type OrganizationChooserItem = {
  _id: string;
  name: string;
  roleTemplate?: string | null;
};

type CurrentOrganization = {
  _id: string;
  name?: string | null;
} | null;

export type ExpoAuthOrganizationChooserPageProps = {
  getDefaultOrganization: FunctionReference<
    "query",
    "public",
    Record<string, never>,
    CurrentOrganization
  >;
  getAvailableOrganizations: FunctionReference<
    "query",
    "public",
    Record<string, never>,
    readonly OrganizationChooserItem[]
  >;
  setActiveOrganization: FunctionReference<
    "mutation",
    "public",
    { organizationId: string },
    unknown
  >;
  navigate: NavigateTo;
  postChooseOrganizationPath: string;
  title?: string;
  description?: string;
  eyebrow?: string;
  loadingTitle?: string;
  loadingDescription?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  styles?: {
    root?: StyleProp<ViewStyle>;
    title?: StyleProp<TextStyle>;
    description?: StyleProp<TextStyle>;
    organizationButton?: StyleProp<ViewStyle>;
    organizationButtonText?: StyleProp<TextStyle>;
    selectedOrganizationButton?: StyleProp<ViewStyle>;
    loading?: StyleProp<TextStyle>;
    empty?: StyleProp<TextStyle>;
  };
};

type PostSignUpPageProps = {
  getDefaultOrganization: FunctionReference<
    "query",
    "public",
    Record<string, never>,
    CurrentOrganization
  >;
  getAvailableOrganizations: FunctionReference<
    "query",
    "public",
    Record<string, never>,
    readonly OrganizationChooserItem[]
  >;
  ensureActiveOrganization: FunctionReference<"mutation", "public", Record<string, never>, unknown>;
  redeemInvitation?: FunctionReference<"mutation", "public", { token: string }, unknown>;
  navigate: NavigateTo;
  postSignInPath: string;
  chooseOrganizationPath: string;
  invitationToken?: string | null;
  title?: string;
  description?: string;
  loadingTitle?: string;
  loadingDescription?: string;
  styles?: {
    root?: StyleProp<ViewStyle>;
    title?: StyleProp<TextStyle>;
    description?: StyleProp<TextStyle>;
    loading?: StyleProp<TextStyle>;
  };
};

export function ExpoAuthPostSignUpPage(props: PostSignUpPageProps) {
  const currentOrganization = useQuery(props.getDefaultOrganization, {}) as
    | CurrentOrganization
    | undefined;
  const availableOrganizations = useQuery(props.getAvailableOrganizations, {}) as
    | readonly OrganizationChooserItem[]
    | undefined;
  const ensureActiveOrganization = useMutation(props.ensureActiveOrganization);
  const redeemInvitation = props.redeemInvitation ? useMutation(props.redeemInvitation) : null;

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrganization === undefined || availableOrganizations === undefined) {
      return;
    }

    if (currentOrganization !== null) {
      void props.navigate({ to: props.postSignInPath, replace: true });
      return;
    }

    if (availableOrganizations.length > 0) {
      void props.navigate({ to: props.chooseOrganizationPath, replace: true });
      return;
    }

    async function finalize() {
      try {
        if (props.invitationToken !== undefined && props.invitationToken !== null) {
          await redeemInvitation?.({ token: props.invitationToken });
        }
        await ensureActiveOrganization({});
        await props.navigate({ to: props.postSignInPath, replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not finalize workspace");
      }
    }

    void finalize();
  }, [
    currentOrganization,
    availableOrganizations,
    props,
    ensureActiveOrganization,
    redeemInvitation,
  ]);

  const s = props.styles ?? {};
  const title = props.title ?? "Finalizing your workspace";
  const description = props.description ?? "We're finishing your organization access.";

  return (
    <View className="p-4" style={s.root}>
      <Text className="text-2xl font-bold" style={s.title}>
        {props.loadingTitle ?? title}
      </Text>
      <Text className="text-muted-foreground" style={s.description}>
        {props.loadingDescription ?? description}
      </Text>
      {error !== null ? <Text className="text-destructive mt-2">{error}</Text> : null}
      <ActivityIndicator className="mt-4" />
    </View>
  );
}

type AcceptInvitePageProps = {
  getInvitationByToken: FunctionReference<"action", "public", { token: string }, unknown>;
  navigate: NavigateTo;
  signUpPath: string;
  invitationToken?: string | null;
  title?: string;
  description?: string;
  loadingTitle?: string;
  loadingDescription?: string;
  errorTitle?: string;
  errorDescription?: string;
  styles?: {
    root?: StyleProp<ViewStyle>;
    title?: StyleProp<TextStyle>;
    description?: StyleProp<TextStyle>;
    error?: StyleProp<TextStyle>;
    loading?: StyleProp<TextStyle>;
  };
};

export function ExpoAuthAcceptInvitePage(props: AcceptInvitePageProps) {
  const [error, setError] = useState<string | null>(null);
  const getInvitationByToken = useAction(props.getInvitationByToken);

  useEffect(() => {
    if (props.invitationToken === undefined || props.invitationToken === null) {
      setError("Invite token is missing");
      return;
    }

    let canceled = false;

    async function openInvite() {
      try {
        const result = (await getInvitationByToken({ token: props.invitationToken! })) as {
          email?: string | null;
        };
        if (canceled) return;
        const signUpUrl = buildExpoAuthSignUpUrl({
          signUpPath: props.signUpPath,
          token: props.invitationToken!,
          email: result.email,
        });
        await props.navigate({ to: signUpUrl, replace: true });
      } catch (err) {
        if (canceled) return;
        setError(err instanceof Error ? err.message : "Could not open invite");
      }
    }

    void openInvite();

    return () => {
      canceled = true;
    };
  }, [props, getInvitationByToken]);

  const s = props.styles ?? {};
  const title = props.title ?? "You're invited";
  const description =
    props.description ?? "We're connecting you to the workspace that invited you.";

  if (error !== null) {
    return (
      <View className="p-4" style={s.root}>
        <Text className="text-2xl font-bold" style={s.title}>
          {props.errorTitle ?? "Invite unavailable"}
        </Text>
        <Text className="text-muted-foreground" style={s.description}>
          {props.errorDescription ??
            "This invite link is missing required access details or has expired."}
        </Text>
        <Text className="text-destructive mt-2" style={s.error}>
          {error}
        </Text>
      </View>
    );
  }

  return (
    <View className="p-4" style={s.root}>
      <Text className="text-2xl font-bold" style={s.title}>
        {props.loadingTitle ?? title}
      </Text>
      <Text className="text-muted-foreground" style={s.description}>
        {props.loadingDescription ?? description}
      </Text>
      <ActivityIndicator className="mt-4" />
    </View>
  );
}

export function ExpoAuthOrganizationChooserPage(props: ExpoAuthOrganizationChooserPageProps) {
  const [selectingOrganizationId, setSelectingOrganizationId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  const currentOrganization = useQuery(props.getDefaultOrganization, {}) as
    | CurrentOrganization
    | undefined;
  const availableOrganizations = useQuery(props.getAvailableOrganizations, {}) as
    | readonly OrganizationChooserItem[]
    | undefined;

  const setActiveOrganization = useMutation(props.setActiveOrganization);

  const s = props.styles ?? {};
  const title = props.title ?? "Choose organization";
  const description =
    props.description ??
    `Select the workspace you want to use. Current resolved organization: ${
      currentOrganization?.name ?? "none"
    }.`;

  if (currentOrganization === undefined || availableOrganizations === undefined) {
    return (
      <View className="p-4" style={s.root}>
        <Text className="text-2xl font-bold" style={s.title}>
          {props.loadingTitle ?? title}
        </Text>
        <Text className="text-muted-foreground" style={s.description}>
          {props.loadingDescription ?? "Loading workspaces..."}
        </Text>
        <ActivityIndicator className="mt-4" />
      </View>
    );
  }

  if (availableOrganizations.length === 0) {
    return (
      <View className="p-4" style={s.root}>
        <Text className="text-2xl font-bold" style={s.title}>
          {props.emptyTitle ?? title}
        </Text>
        <Text className="text-muted-foreground" style={s.description}>
          {props.emptyDescription ?? "No workspaces available."}
        </Text>
      </View>
    );
  }

  return (
    <View className="p-4" style={s.root}>
      {props.eyebrow !== undefined ? (
        <Text className="text-sm text-muted-foreground" style={s.description}>
          {props.eyebrow}
        </Text>
      ) : null}
      <Text className="text-2xl font-bold" style={s.title}>
        {title}
      </Text>
      <Text className="text-muted-foreground" style={s.description}>
        {description}
      </Text>
      {selectionError !== null ? (
        <Text className="text-destructive mt-2">{selectionError}</Text>
      ) : null}
      {availableOrganizations.map((organization) => {
        const isSelected = currentOrganization?._id === organization._id;
        const isBusy = selectingOrganizationId === organization._id;
        return (
          <Pressable
            key={organization._id}
            className={`border p-3 mt-2 rounded ${isSelected ? "bg-primary" : ""}`}
            style={isSelected ? s.selectedOrganizationButton : s.organizationButton}
            onPress={async () => {
              setSelectionError(null);
              setSelectingOrganizationId(organization._id);
              try {
                await setActiveOrganization({ organizationId: organization._id });
                await props.navigate({ to: props.postChooseOrganizationPath, replace: true });
              } catch (err) {
                setSelectionError(
                  err instanceof Error ? err.message : "Could not switch workspace",
                );
              } finally {
                setSelectingOrganizationId(null);
              }
            }}
            disabled={isBusy}
          >
            {isBusy ? (
              <ActivityIndicator />
            ) : (
              <Text
                className={`text-center ${isSelected ? "text-primary-foreground" : ""}`}
                style={s.organizationButtonText}
              >
                {organization.name}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
