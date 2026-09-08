import { cn } from "./lib/ui";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useState, type ReactNode } from "react";

import { useGuardedConvexMutation } from "./protected-writes";

type EmptyArgs = Record<string, never>;

export type ConvexOrganizationPermissionListItem = {
  description?: string;
  key: string;
};

export type ConvexOrganizationRoleListItem<RoleId extends string = string> = {
  _id: RoleId;
  createdAt?: number;
  description?: string;
  isSystem?: boolean;
  key?: string;
  name: string;
  permissions: readonly string[];
  type?: string;
  updatedAt?: number;
};

export type ConvexOrganizationRoleFormState = {
  name: string;
  permissions: string[];
};

export type ConvexOrganizationCreateRoleArgs = {
  name: string;
  permissions: string[];
};

export type ConvexOrganizationRoleManagerFunctionReferences<RoleId extends string = string> = {
  createRole: FunctionReference<"mutation", "public", ConvexOrganizationCreateRoleArgs, RoleId>;
  listPermissions: FunctionReference<
    "query",
    "public",
    EmptyArgs,
    readonly ConvexOrganizationPermissionListItem[]
  >;
  listRoles: FunctionReference<
    "query",
    "public",
    EmptyArgs,
    readonly ConvexOrganizationRoleListItem<RoleId>[]
  >;
};

export type ConvexOrganizationRoleManagerCopy = {
  actionErrorTitle?: string;
  createTitle?: string;
  creatingLabel?: string;
  customRoleLabel?: string;
  emptyMessage?: string;
  loadingMessage?: string;
  nameLabel?: string;
  namePlaceholder?: string;
  permissionCatalogEmptyMessage?: string;
  permissionLabel?: string;
  roleListTitle?: string;
  submitLabel?: string;
  systemRoleLabel?: string;
};

export type ConvexOrganizationRoleManagerClassNames = {
  badge?: string;
  checkbox?: string;
  error?: string;
  field?: string;
  form?: string;
  input?: string;
  label?: string;
  labelText?: string;
  list?: string;
  listCard?: string;
  listContent?: string;
  permissionDescription?: string;
  permissionGrid?: string;
  permissionItem?: string;
  permissionKey?: string;
  primaryButton?: string;
  primaryButtonDisabled?: string;
  roleHeader?: string;
  roleName?: string;
  rolePermissions?: string;
  sectionTitle?: string;
  stateText?: string;
};

export type ConvexOrganizationRoleManagerSurfaceProps<RoleId extends string = string> = {
  buildCreateRoleArgs?: (
    state: ConvexOrganizationRoleFormState,
  ) => ConvexOrganizationCreateRoleArgs;
  canCreateRoles?: boolean;
  captureEvent?: (name: string, properties: Record<string, unknown>) => void;
  classNames?: ConvexOrganizationRoleManagerClassNames;
  copy?: ConvexOrganizationRoleManagerCopy;
  getErrorMessage?: (error: unknown, fallback: string) => string;
  refs: ConvexOrganizationRoleManagerFunctionReferences<RoleId>;
  renderActionError?: (message: string) => ReactNode;
};

const defaultRoleManagerCopy = {
  actionErrorTitle: "Action failed",
  createTitle: "Create role",
  creatingLabel: "Creating...",
  customRoleLabel: "Custom",
  emptyMessage: "No roles found.",
  loadingMessage: "Loading roles...",
  nameLabel: "Role name",
  namePlaceholder: "Operations lead",
  permissionCatalogEmptyMessage: "No permissions available.",
  permissionLabel: "Permissions",
  roleListTitle: "Roles",
  submitLabel: "Create role",
  systemRoleLabel: "System",
} satisfies Required<ConvexOrganizationRoleManagerCopy>;

export function canSubmitConvexOrganizationRoleForm({
  creating,
  disabled,
  name,
  permissions,
}: {
  creating: boolean;
  disabled?: boolean;
  name: string;
  permissions: readonly string[];
}): boolean {
  return !disabled && !creating && name.trim().length > 0 && permissions.length > 0;
}

export function getConvexOrganizationRoleManagerErrorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
}

export function isConvexOrganizationSystemRole(
  role: Pick<ConvexOrganizationRoleListItem, "isSystem" | "type">,
): boolean {
  return role.isSystem === true || role.type === "system";
}

export function toggleConvexOrganizationRolePermission(
  permissions: readonly string[],
  permission: string,
): string[] {
  return permissions.includes(permission)
    ? permissions.filter((current) => current !== permission)
    : [...permissions, permission];
}

export function groupConvexOrganizationPermissions(
  permissions: readonly ConvexOrganizationPermissionListItem[],
): Array<{
  label: string;
  permissions: ConvexOrganizationPermissionListItem[];
}> {
  const groups = new Map<string, ConvexOrganizationPermissionListItem[]>();
  for (const permission of permissions) {
    const separatorIndex = permission.key.indexOf(":");
    const label = separatorIndex === -1 ? "general" : permission.key.slice(0, separatorIndex);
    groups.set(label, [...(groups.get(label) ?? []), permission]);
  }
  return Array.from(groups.entries()).map(([label, groupedPermissions]) => ({
    label,
    permissions: groupedPermissions,
  }));
}

export function ConvexOrganizationRoleManagerSurface<RoleId extends string = string>({
  buildCreateRoleArgs,
  canCreateRoles = true,
  captureEvent,
  classNames,
  copy,
  getErrorMessage = getConvexOrganizationRoleManagerErrorMessage,
  refs,
  renderActionError,
}: ConvexOrganizationRoleManagerSurfaceProps<RoleId>) {
  const permissions = useQuery(refs.listPermissions, {});
  const roles = useQuery(refs.listRoles, {});
  const actions = useConvexOrganizationRoleManagerActions({
    buildCreateRoleArgs,
    captureEvent,
    getErrorMessage,
    refs,
  });

  return (
    <div className="space-y-4">
      <ConvexOrganizationRoleCreateForm
        canCreateRoles={canCreateRoles}
        classNames={classNames}
        copy={copy}
        creating={actions.creating}
        onNameChange={actions.setName}
        onPermissionToggle={actions.togglePermission}
        onSubmit={actions.createRole}
        permissions={permissions}
        state={actions.form}
      />
      {actions.actionError
        ? (renderActionError?.(actions.actionError) ?? (
            <ConvexOrganizationRoleActionErrorNotice
              classNames={classNames}
              message={actions.actionError}
              title={copy?.actionErrorTitle ?? defaultRoleManagerCopy.actionErrorTitle}
            />
          ))
        : null}
      <ConvexOrganizationRoleList classNames={classNames} copy={copy} roles={roles} />
    </div>
  );
}

export function ConvexOrganizationRoleCreateForm({
  canCreateRoles = true,
  classNames,
  copy,
  creating,
  onNameChange,
  onPermissionToggle,
  onSubmit,
  permissions,
  state,
}: {
  canCreateRoles?: boolean;
  classNames?: ConvexOrganizationRoleManagerClassNames;
  copy?: ConvexOrganizationRoleManagerCopy;
  creating: boolean;
  onNameChange: (name: string) => void;
  onPermissionToggle: (permission: string) => void;
  onSubmit: () => void;
  permissions: readonly ConvexOrganizationPermissionListItem[] | undefined;
  state: ConvexOrganizationRoleFormState;
}) {
  const resolvedCopy = resolveRoleManagerCopy(copy);
  const canSubmit = canSubmitConvexOrganizationRoleForm({
    creating,
    disabled: !canCreateRoles || permissions === undefined,
    name: state.name,
    permissions: state.permissions,
  });

  return (
    <div
      className={cn(
        "border-foreground/10 bg-background/20 rounded-lg border p-5",
        classNames?.form,
      )}
    >
      <div className="space-y-4">
        <h3
          className={cn(
            "text-foreground text-base font-medium text-balance",
            classNames?.sectionTitle,
          )}
        >
          {resolvedCopy.createTitle}
        </h3>
        <label className={cn("block space-y-2 text-sm", classNames?.field)}>
          <span className={cn("text-foreground/70", classNames?.labelText)}>
            {resolvedCopy.nameLabel}
          </span>
          <input
            className={cn(
              "border-foreground/10 bg-foreground/5 text-foreground placeholder:text-foreground/35 focus:border-foreground/25 h-10 w-full rounded-md border px-3 text-sm transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-60",
              classNames?.input,
            )}
            disabled={!canCreateRoles || creating}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder={resolvedCopy.namePlaceholder}
            type="text"
            value={state.name}
          />
        </label>
        <div className="space-y-3">
          <p className={cn("text-foreground/70 text-sm", classNames?.label)}>
            {resolvedCopy.permissionLabel}
          </p>
          <ConvexOrganizationPermissionChecklist
            classNames={classNames}
            copy={resolvedCopy}
            disabled={!canCreateRoles || creating}
            onPermissionToggle={onPermissionToggle}
            permissions={permissions}
            selectedPermissions={state.permissions}
          />
        </div>
        <button
          className={cn(
            "bg-foreground text-background hover:bg-foreground/90 inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            classNames?.primaryButton,
            !canSubmit && classNames?.primaryButtonDisabled,
          )}
          disabled={!canSubmit}
          onClick={onSubmit}
          type="button"
        >
          {creating ? resolvedCopy.creatingLabel : resolvedCopy.submitLabel}
        </button>
      </div>
    </div>
  );
}

export function ConvexOrganizationPermissionChecklist({
  classNames,
  copy,
  disabled,
  onPermissionToggle,
  permissions,
  selectedPermissions,
}: {
  classNames?: ConvexOrganizationRoleManagerClassNames;
  copy: Required<ConvexOrganizationRoleManagerCopy>;
  disabled?: boolean;
  onPermissionToggle: (permission: string) => void;
  permissions: readonly ConvexOrganizationPermissionListItem[] | undefined;
  selectedPermissions: readonly string[];
}) {
  if (permissions === undefined) {
    return (
      <p className={cn("text-foreground/50 text-sm", classNames?.stateText)}>
        {copy.loadingMessage}
      </p>
    );
  }

  if (permissions.length === 0) {
    return (
      <p className={cn("text-foreground/50 text-sm", classNames?.stateText)}>
        {copy.permissionCatalogEmptyMessage}
      </p>
    );
  }

  return (
    <div className={cn("grid gap-3 md:grid-cols-2", classNames?.permissionGrid)}>
      {groupConvexOrganizationPermissions(permissions).map((group) => (
        <div
          className={cn(
            "border-foreground/10 bg-foreground/[0.03] rounded-md border p-3",
            classNames?.permissionItem,
          )}
          key={group.label}
        >
          <p className="text-foreground/45 mb-2 text-xs font-medium uppercase">{group.label}</p>
          <div className="space-y-2">
            {group.permissions.map((permission) => (
              <label className="flex items-start gap-2 text-sm" key={permission.key}>
                <input
                  checked={selectedPermissions.includes(permission.key)}
                  className={cn(
                    "border-foreground/20 bg-foreground/5 mt-1 size-4 rounded",
                    classNames?.checkbox,
                  )}
                  disabled={disabled}
                  onChange={() => onPermissionToggle(permission.key)}
                  type="checkbox"
                />
                <span className="min-w-0">
                  <span className={cn("text-foreground block truncate", classNames?.permissionKey)}>
                    {permission.key}
                  </span>
                  {permission.description ? (
                    <span
                      className={cn(
                        "text-foreground/45 mt-0.5 block text-xs text-pretty",
                        classNames?.permissionDescription,
                      )}
                    >
                      {permission.description}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConvexOrganizationRoleList<RoleId extends string = string>({
  classNames,
  copy,
  roles,
}: {
  classNames?: ConvexOrganizationRoleManagerClassNames;
  copy?: ConvexOrganizationRoleManagerCopy;
  roles: readonly ConvexOrganizationRoleListItem<RoleId>[] | undefined;
}) {
  const resolvedCopy = resolveRoleManagerCopy(copy);

  if (roles === undefined) {
    return (
      <p className={cn("text-foreground/50 text-sm", classNames?.stateText)}>
        {resolvedCopy.loadingMessage}
      </p>
    );
  }

  if (roles.length === 0) {
    return (
      <p className={cn("text-foreground/50 text-sm", classNames?.stateText)}>
        {resolvedCopy.emptyMessage}
      </p>
    );
  }

  return (
    <div className={cn("space-y-3", classNames?.list)}>
      <h3
        className={cn(
          "text-foreground text-base font-medium text-balance",
          classNames?.sectionTitle,
        )}
      >
        {resolvedCopy.roleListTitle}
      </h3>
      {roles.map((role) => {
        const systemRole = isConvexOrganizationSystemRole(role);
        return (
          <article
            className={cn(
              "border-foreground/10 bg-background/20 rounded-lg border",
              classNames?.listCard,
            )}
            data-testid="organization-role-card"
            key={role._id}
          >
            <div className={cn("space-y-3 p-5", classNames?.listContent)}>
              <div
                className={cn(
                  "flex flex-wrap items-start justify-between gap-3",
                  classNames?.roleHeader,
                )}
              >
                <div className="min-w-0">
                  <p className={cn("text-foreground truncate font-medium", classNames?.roleName)}>
                    {role.name}
                  </p>
                  {role.description ? (
                    <p className="text-foreground/45 mt-1 text-xs text-pretty">
                      {role.description}
                    </p>
                  ) : null}
                </div>
                <span
                  className={cn(
                    "border-foreground/10 text-foreground/65 inline-flex h-7 items-center rounded-md border px-2 text-xs font-medium",
                    classNames?.badge,
                  )}
                >
                  {systemRole ? resolvedCopy.systemRoleLabel : resolvedCopy.customRoleLabel}
                </span>
              </div>
              <div className={cn("flex flex-wrap gap-2", classNames?.rolePermissions)}>
                {role.permissions.map((permission) => (
                  <code
                    className="border-foreground/10 bg-foreground/5 text-foreground/65 rounded-md border px-2 py-1 text-xs"
                    key={permission}
                  >
                    {permission}
                  </code>
                ))}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function ConvexOrganizationRoleActionErrorNotice({
  classNames,
  message,
  title,
}: {
  classNames?: ConvexOrganizationRoleManagerClassNames;
  message: string;
  title: string;
}) {
  return (
    <div
      className={cn(
        "border-destructive/25 bg-destructive/10 rounded-lg border p-4",
        classNames?.error,
      )}
      role="alert"
    >
      <p className="text-destructive text-sm font-medium">{title}</p>
      <p className="text-destructive/80 mt-1 text-sm text-pretty">{message}</p>
    </div>
  );
}

function useConvexOrganizationRoleManagerActions<RoleId extends string = string>({
  buildCreateRoleArgs,
  captureEvent,
  getErrorMessage,
  refs,
}: {
  buildCreateRoleArgs:
    | ((state: ConvexOrganizationRoleFormState) => ConvexOrganizationCreateRoleArgs)
    | undefined;
  captureEvent: ((name: string, properties: Record<string, unknown>) => void) | undefined;
  getErrorMessage: (error: unknown, fallback: string) => string;
  refs: ConvexOrganizationRoleManagerFunctionReferences<RoleId>;
}) {
  const createRole = useGuardedConvexMutation(useMutation(refs.createRole));
  const [form, setForm] = useState<ConvexOrganizationRoleFormState>({
    name: "",
    permissions: [],
  });
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  return {
    actionError,
    createRole: () => {
      if (
        !canSubmitConvexOrganizationRoleForm({
          creating,
          name: form.name,
          permissions: form.permissions,
        })
      ) {
        return;
      }

      setCreating(true);
      setActionError(null);
      const args = buildCreateRoleArgs
        ? buildCreateRoleArgs(form)
        : {
            name: form.name.trim(),
            permissions: form.permissions,
          };
      void createRole(args)
        .then((roleId) => {
          captureEvent?.("organization_role_created", {
            permissionCount: form.permissions.length,
            roleId,
          });
          setForm({ name: "", permissions: [] });
        })
        .catch((error: unknown) => {
          setActionError(getErrorMessage(error, "Could not create role."));
        })
        .finally(() => {
          setCreating(false);
        });
    },
    creating,
    form,
    setName: (name: string) => {
      setForm((current) => ({ ...current, name }));
    },
    togglePermission: (permission: string) => {
      setForm((current) => ({
        ...current,
        permissions: toggleConvexOrganizationRolePermission(current.permissions, permission),
      }));
    },
  };
}

function resolveRoleManagerCopy(
  copy: ConvexOrganizationRoleManagerCopy | undefined,
): Required<ConvexOrganizationRoleManagerCopy> {
  return { ...defaultRoleManagerCopy, ...copy };
}
