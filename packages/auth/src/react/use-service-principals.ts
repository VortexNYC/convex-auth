import { useMutation, useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useState } from "react";

type EmptyArgs = Record<string, never>;

type ServicePrincipalStatus = "active" | "disabled";

export type ConvexServicePrincipalListItem<
  Permission extends string = string,
  ServicePrincipalId extends string = string,
> = {
  _id: ServicePrincipalId;
  key: string;
  name: string;
  description?: string | null;
  status: ServicePrincipalStatus;
  permissions: readonly Permission[];
  createdAt: number;
  updatedAt: number;
};

type ConvexServicePrincipalsApi<
  Permission extends string = string,
  ServicePrincipalId extends string = string,
> = {
  servicePrincipals: {
    listMyServicePrincipals: FunctionReference<
      "query",
      "public",
      EmptyArgs,
      readonly ConvexServicePrincipalListItem<Permission, ServicePrincipalId>[]
    >;
    createServicePrincipal: FunctionReference<
      "mutation",
      "public",
      {
        key: string;
        name: string;
        description?: string;
        permissions: readonly string[];
      },
      { servicePrincipalId: string; created: boolean }
    >;
    setServicePrincipalStatus: FunctionReference<
      "mutation",
      "public",
      { servicePrincipalId: string; status: ServicePrincipalStatus },
      { ok: true }
    >;
  };
};

export type ConvexServicePrincipalCreateFormState<Permission extends string = string> = {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
};

export type UseConvexServicePrincipalsOptions<Permission extends string = string> = {
  permissionOptions: readonly Permission[];
};

export type UseConvexServicePrincipalsResult<
  Permission extends string = string,
  ServicePrincipalId extends string = string,
> = {
  servicePrincipals:
    | readonly ConvexServicePrincipalListItem<Permission, ServicePrincipalId>[]
    | undefined;
  state: ConvexServicePrincipalCreateFormState<Permission>;
  creating: boolean;
  onKeyChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onPermissionsChange: (value: Permission[]) => void;
  onSubmit: () => Promise<void>;
  onStatusChange: (
    servicePrincipalId: ServicePrincipalId,
    status: ServicePrincipalStatus,
  ) => Promise<void>;
};

export function useConvexServicePrincipals<
  Permission extends string = string,
  ServicePrincipalId extends string = string,
>(
  api: ConvexServicePrincipalsApi<Permission, ServicePrincipalId>,
  _options: UseConvexServicePrincipalsOptions<Permission>,
): UseConvexServicePrincipalsResult<Permission, ServicePrincipalId> {
  const [state, setState] = useState<ConvexServicePrincipalCreateFormState<Permission>>({
    key: "",
    name: "",
    description: "",
    permissions: [],
  });
  const [creating, setCreating] = useState(false);

  const servicePrincipals = useQuery(api.servicePrincipals.listMyServicePrincipals);
  const create = useMutation(api.servicePrincipals.createServicePrincipal);
  const setStatus = useMutation(api.servicePrincipals.setServicePrincipalStatus);

  const onKeyChange = (value: string) => setState((prev) => ({ ...prev, key: value }));
  const onNameChange = (value: string) => setState((prev) => ({ ...prev, name: value }));
  const onDescriptionChange = (value: string) =>
    setState((prev) => ({ ...prev, description: value }));
  const onPermissionsChange = (value: Permission[]) =>
    setState((prev) => ({ ...prev, permissions: value }));

  const onSubmit = async () => {
    if (!state.key || !state.name || state.permissions.length === 0) return;
    setCreating(true);
    try {
      await create({
        key: state.key,
        name: state.name,
        description: state.description,
        permissions: state.permissions,
      });
      setState({ key: "", name: "", description: "", permissions: [] });
    } finally {
      setCreating(false);
    }
  };

  const onStatusChange = async (
    servicePrincipalId: ServicePrincipalId,
    status: ServicePrincipalStatus,
  ) => {
    await setStatus({ servicePrincipalId: servicePrincipalId as string, status });
  };

  return {
    servicePrincipals,
    state,
    creating,
    onKeyChange,
    onNameChange,
    onDescriptionChange,
    onPermissionsChange,
    onSubmit,
    onStatusChange,
  };
}
