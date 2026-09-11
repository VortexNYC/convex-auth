import { useMutation, useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useState } from "react";
import type {
  ConvexApiKeyCreateFormProps,
  ConvexApiKeyCreateFormState,
  ConvexApiKeyListItem,
  ConvexApiKeyListProps,
} from "./api-keys.js";
import { defaultConvexApiKeyExpirationOptions } from "./api-keys.js";

type EmptyArgs = Record<string, never>;

type ConvexApiKeyCreateArgs = {
  name: string;
  scopes: readonly string[];
  ipAllowlist: string;
  expiresInDays: string;
};

type ConvexApiKeyCreatedResult = {
  apiKeyId: string;
  apiKey: string;
  keyPrefix: string;
  keyStart: string;
};

type ConvexApiKeysApi<Scope extends string = string, ApiKeyId extends string = string> = {
  apiKeys: {
    listMyApiKeys: FunctionReference<
      "query",
      "public",
      EmptyArgs,
      readonly ConvexApiKeyListItem<Scope, ApiKeyId>[]
    >;
    createApiKey: FunctionReference<
      "mutation",
      "public",
      ConvexApiKeyCreateArgs,
      ConvexApiKeyCreatedResult
    >;
    revokeApiKey: FunctionReference<"mutation", "public", { apiKeyId: string }, { ok: true }>;
    rotateApiKey: FunctionReference<
      "mutation",
      "public",
      { apiKeyId: string },
      ConvexApiKeyCreatedResult
    >;
  };
};

export type UseConvexApiKeysOptions<Scope extends string = string> = {
  apiEnabled?: boolean;
  scopeOptions: readonly Scope[];
};

export type UseConvexApiKeysResult<
  Scope extends string = string,
  ApiKeyId extends string = string,
> = {
  apiKeys: readonly ConvexApiKeyListItem<Scope, ApiKeyId>[] | undefined;
  created: ConvexApiKeyCreatedResult | null;
  clearCreated: () => void;
  formProps: ConvexApiKeyCreateFormProps<Scope>;
  listProps: ConvexApiKeyListProps<Scope, ApiKeyId>;
};

export function useConvexApiKeys<Scope extends string = string, ApiKeyId extends string = string>(
  api: ConvexApiKeysApi<Scope, ApiKeyId>,
  options: UseConvexApiKeysOptions<Scope>,
): UseConvexApiKeysResult<Scope, ApiKeyId> {
  const apiEnabled = options.apiEnabled ?? true;
  const [state, setState] = useState<ConvexApiKeyCreateFormState<Scope>>({
    name: "",
    scopes: [],
    ipAllowlist: "",
    expiresInDays: "none",
  });
  const [created, setCreated] = useState<ConvexApiKeyCreatedResult | null>(null);
  const [creating, setCreating] = useState(false);

  const apiKeys = useQuery(api.apiKeys.listMyApiKeys);
  const create = useMutation(api.apiKeys.createApiKey);
  const revoke = useMutation(api.apiKeys.revokeApiKey);
  const rotate = useMutation(api.apiKeys.rotateApiKey);

  const onNameChange = (value: string) => setState((prev) => ({ ...prev, name: value }));
  const onScopesChange = (value: Scope[]) => setState((prev) => ({ ...prev, scopes: value }));
  const onIpAllowlistChange = (value: string) =>
    setState((prev) => ({ ...prev, ipAllowlist: value }));
  const onExpiresInDaysChange = (value: string) =>
    setState((prev) => ({ ...prev, expiresInDays: value }));
  const clearCreated = () => setCreated(null);

  const onSubmit = async () => {
    if (!state.name || state.scopes.length === 0) return;
    setCreating(true);
    try {
      const result = await create({
        name: state.name,
        scopes: state.scopes,
        ipAllowlist: state.ipAllowlist,
        expiresInDays: state.expiresInDays,
      });
      setCreated(result);
      setState({ name: "", scopes: [], ipAllowlist: "", expiresInDays: "none" });
    } finally {
      setCreating(false);
    }
  };

  const onRevoke = async (apiKeyId: ApiKeyId) => {
    await revoke({ apiKeyId });
  };

  const onRotate = async (apiKeyId: ApiKeyId) => {
    const result = await rotate({ apiKeyId });
    setCreated(result);
  };

  const formProps: ConvexApiKeyCreateFormProps<Scope> = {
    apiEnabled,
    creating,
    expirationOptions: defaultConvexApiKeyExpirationOptions,
    onExpiresInDaysChange,
    onIpAllowlistChange,
    onNameChange,
    onScopesChange,
    onSubmit,
    scopeOptions: options.scopeOptions,
    state,
  };

  const listProps: ConvexApiKeyListProps<Scope, ApiKeyId> = {
    apiKeys,
    copy: { emptyMessage: "No API keys yet." },
    onRevoke,
    onRotate,
  };

  return { apiKeys, created, clearCreated, formProps, listProps };
}
