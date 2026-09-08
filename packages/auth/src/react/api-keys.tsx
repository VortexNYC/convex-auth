import { cn } from "./lib/ui";
import type { ReactNode } from "react";

const dayInMs = 24 * 60 * 60 * 1000;

export type ConvexApiKeyStatus = "active" | "revoked";

export type ConvexApiKeyListItem<
  Scope extends string = string,
  ApiKeyId extends string = string,
> = {
  _id: ApiKeyId;
  name: string;
  keyPrefix: string;
  scopes: readonly Scope[];
  allowedIpRanges: readonly string[];
  expiresAt?: number;
  status: ConvexApiKeyStatus;
  lastUsedAt?: number;
  lastUsedIp?: string;
  createdAt: number;
  updatedAt?: number;
  createdBy?: {
    _id: string;
    name?: string;
    email: string;
  } | null;
};

export type ConvexApiKeyCreateFormState<Scope extends string = string> = {
  name: string;
  scopes: readonly Scope[];
  ipAllowlist: string;
  expiresInDays: string;
};

export type ConvexApiKeyExpirationOption = {
  value: string;
  label: string;
};

export type ConvexApiKeyCreateFormCopy = {
  nameLabel?: string;
  namePlaceholder?: string;
  expirationLabel?: string;
  ipAllowlistLabel?: string;
  ipAllowlistPlaceholder?: string;
  createLabel?: string;
  creatingLabel?: string;
};

export type ConvexApiKeyListCopy = {
  loadingMessage?: string;
  emptyMessage: string;
  createdByLabel?: string;
  lastUsedLabel?: string;
  expiresLabel?: string;
  unknownCreatorLabel?: string;
  neverLabel?: string;
  rotateLabel?: string;
  revokeLabel?: string;
};

export type ConvexApiKeyClassNames = {
  createCard?: string;
  createContent?: string;
  label?: string;
  labelText?: string;
  input?: string;
  select?: string;
  textarea?: string;
  scopeList?: string;
  scopeButton?: string;
  scopeButtonSelected?: string;
  scopeButtonDisabled?: string;
  primaryButton?: string;
  primaryButtonDisabled?: string;
  list?: string;
  listCard?: string;
  listContent?: string;
  listHeader?: string;
  keyDetails?: string;
  keyName?: string;
  keyPrefix?: string;
  keyStatus?: string;
  metadata?: string;
  actions?: string;
  secondaryButton?: string;
  tags?: string;
  tag?: string;
  stateText?: string;
};

export type ConvexApiKeyCreateFormProps<Scope extends string = string> = {
  apiEnabled: boolean;
  classNames?: ConvexApiKeyClassNames;
  copy?: ConvexApiKeyCreateFormCopy;
  creating: boolean;
  expirationOptions?: readonly ConvexApiKeyExpirationOption[];
  onExpiresInDaysChange: (value: string) => void;
  onIpAllowlistChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onScopesChange: (value: Scope[]) => void;
  onSubmit: () => void;
  scopeOptions: readonly Scope[];
  state: ConvexApiKeyCreateFormState<Scope>;
};

export type ConvexApiKeyListProps<
  Scope extends string = string,
  ApiKeyId extends string = string,
> = {
  apiKeys: readonly ConvexApiKeyListItem<Scope, ApiKeyId>[] | undefined;
  classNames?: ConvexApiKeyClassNames;
  copy: ConvexApiKeyListCopy;
  formatTimestamp?: (timestamp: number) => string;
  onRevoke: (apiKeyId: ApiKeyId) => void;
  onRotate: (apiKeyId: ApiKeyId) => void;
  renderTag?: (label: string) => ReactNode;
};

const defaultCreateCopy = {
  createLabel: "Create API key",
  creatingLabel: "Creating...",
  expirationLabel: "Expires in",
  ipAllowlistLabel: "Allowed IP ranges",
  ipAllowlistPlaceholder:
    "Optional. One per line or comma separated. Example: 203.0.113.10 or 203.0.113.0/24",
  nameLabel: "Key name",
  namePlaceholder: "Production sync",
} satisfies Required<ConvexApiKeyCreateFormCopy>;

const defaultListCopy = {
  createdByLabel: "Created by",
  expiresLabel: "Expires",
  lastUsedLabel: "Last used",
  loadingMessage: "Loading API keys...",
  neverLabel: "never",
  revokeLabel: "Revoke",
  rotateLabel: "Rotate",
  unknownCreatorLabel: "Unknown user",
} satisfies Omit<ConvexApiKeyListCopy, "emptyMessage">;

export const defaultConvexApiKeyExpirationOptions = [
  { value: "none", label: "Never" },
  { value: "1", label: "1 day" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] satisfies readonly ConvexApiKeyExpirationOption[];

export function parseConvexApiKeyAllowedIpRanges(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getConvexApiKeyExpiresAt(
  expiresInDays: string,
  now = Date.now(),
): number | undefined {
  if (expiresInDays === "none" || expiresInDays.trim().length === 0) {
    return undefined;
  }

  const days = Number(expiresInDays);
  if (!Number.isFinite(days) || days <= 0) {
    return undefined;
  }

  return now + days * dayInMs;
}

export function canSubmitConvexApiKeyCreateForm({
  apiEnabled,
  creating,
  name,
  scopes,
}: {
  apiEnabled: boolean;
  creating: boolean;
  name: string;
  scopes: readonly string[];
}): boolean {
  return apiEnabled && !creating && name.trim().length > 0 && scopes.length > 0;
}

export function getConvexApiKeyCreatorLabel(
  key: Pick<ConvexApiKeyListItem, "createdBy">,
  unknownCreatorLabel = defaultListCopy.unknownCreatorLabel,
): string {
  return key.createdBy?.name ?? key.createdBy?.email ?? unknownCreatorLabel;
}

export function formatConvexApiKeyTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export function ConvexApiKeyCreateForm<Scope extends string = string>({
  apiEnabled,
  classNames,
  copy,
  creating,
  expirationOptions = defaultConvexApiKeyExpirationOptions,
  onExpiresInDaysChange,
  onIpAllowlistChange,
  onNameChange,
  onScopesChange,
  onSubmit,
  scopeOptions,
  state,
}: ConvexApiKeyCreateFormProps<Scope>) {
  const resolvedCopy = resolveCreateCopy(copy);
  const canCreate = canSubmitConvexApiKeyCreateForm({
    apiEnabled,
    creating,
    name: state.name,
    scopes: state.scopes,
  });

  return (
    <div
      className={cn(
        "border-foreground/10 bg-background/20 rounded-lg border",
        classNames?.createCard,
      )}
    >
      <div className={cn("space-y-3 p-5", classNames?.createContent)}>
        <label className={cn("block space-y-2 text-sm", classNames?.label)}>
          <span className={cn("text-foreground/70", classNames?.labelText)}>
            {resolvedCopy.nameLabel}
          </span>
          <input
            className={cn(
              "border-foreground/10 bg-foreground/5 text-foreground placeholder:text-foreground/35 focus:border-foreground/25 h-10 w-full rounded-md border px-3 text-sm transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-60",
              classNames?.input,
            )}
            disabled={!apiEnabled}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder={resolvedCopy.namePlaceholder}
            value={state.name}
          />
        </label>
        <ConvexApiKeyScopeButtons
          apiEnabled={apiEnabled}
          classNames={classNames}
          onScopesChange={onScopesChange}
          scopeOptions={scopeOptions}
          scopes={state.scopes}
        />
        <ConvexApiKeyCreateDetailsFields
          apiEnabled={apiEnabled}
          classNames={classNames}
          copy={resolvedCopy}
          expirationOptions={expirationOptions}
          onExpiresInDaysChange={onExpiresInDaysChange}
          onIpAllowlistChange={onIpAllowlistChange}
          state={state}
        />
        <button
          className={cn(
            "bg-foreground text-background hover:bg-foreground/90 inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            classNames?.primaryButton,
            !canCreate && classNames?.primaryButtonDisabled,
          )}
          disabled={!canCreate}
          onClick={onSubmit}
          type="button"
        >
          {creating ? resolvedCopy.creatingLabel : resolvedCopy.createLabel}
        </button>
      </div>
    </div>
  );
}

function ConvexApiKeyCreateDetailsFields<Scope extends string>(props: {
  apiEnabled: boolean;
  classNames?: ConvexApiKeyClassNames;
  copy: Required<ConvexApiKeyCreateFormCopy>;
  expirationOptions: readonly ConvexApiKeyExpirationOption[];
  onExpiresInDaysChange: (value: string) => void;
  onIpAllowlistChange: (value: string) => void;
  state: ConvexApiKeyCreateFormState<Scope>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className={cn("block space-y-2 text-sm", props.classNames?.label)}>
        <span className={cn("text-foreground/70", props.classNames?.labelText)}>
          {props.copy.expirationLabel}
        </span>
        <select
          aria-label="API key expiration"
          className={cn(
            "border-foreground/10 bg-foreground/5 text-foreground focus:border-foreground/25 h-10 w-full rounded-md border px-3 text-sm transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-60",
            props.classNames?.select,
          )}
          disabled={!props.apiEnabled}
          onChange={(event) => props.onExpiresInDaysChange(event.target.value)}
          value={props.state.expiresInDays}
        >
          {props.expirationOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className={cn("block space-y-2 text-sm", props.classNames?.label)}>
        <span className={cn("text-foreground/70", props.classNames?.labelText)}>
          {props.copy.ipAllowlistLabel}
        </span>
        <textarea
          aria-label="API key allowed IP ranges"
          className={cn(
            "border-foreground/10 bg-foreground/5 text-foreground placeholder:text-foreground/35 focus:border-foreground/25 min-h-20 w-full rounded-md border px-3 py-2 text-sm transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-60",
            props.classNames?.textarea,
          )}
          disabled={!props.apiEnabled}
          onChange={(event) => props.onIpAllowlistChange(event.target.value)}
          placeholder={props.copy.ipAllowlistPlaceholder}
          value={props.state.ipAllowlist}
        />
      </label>
    </div>
  );
}

function ConvexApiKeyScopeButtons<Scope extends string>(props: {
  apiEnabled: boolean;
  classNames?: ConvexApiKeyClassNames;
  onScopesChange: (value: Scope[]) => void;
  scopeOptions: readonly Scope[];
  scopes: readonly Scope[];
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", props.classNames?.scopeList)}>
      {props.scopeOptions.map((scope) => {
        const selected = props.scopes.includes(scope);
        return (
          <button
            aria-pressed={selected}
            className={cn(
              "rounded-md border px-3 py-2 text-xs font-medium transition-colors",
              selected
                ? "border-info/50 bg-info/10 text-info"
                : "border-foreground/10 bg-foreground/5 text-foreground/60 hover:bg-foreground/10",
              !props.apiEnabled && "cursor-not-allowed opacity-50",
              props.classNames?.scopeButton,
              selected && props.classNames?.scopeButtonSelected,
              !props.apiEnabled && props.classNames?.scopeButtonDisabled,
            )}
            disabled={!props.apiEnabled}
            key={scope}
            onClick={() => props.onScopesChange(toggleScope(props.scopes, scope))}
            type="button"
          >
            {scope}
          </button>
        );
      })}
    </div>
  );
}

export function ConvexApiKeyList<Scope extends string = string, ApiKeyId extends string = string>({
  apiKeys,
  classNames,
  copy,
  formatTimestamp = formatConvexApiKeyTimestamp,
  onRevoke,
  onRotate,
  renderTag,
}: ConvexApiKeyListProps<Scope, ApiKeyId>) {
  const resolvedCopy = resolveListCopy(copy);

  if (apiKeys === undefined) {
    return (
      <p className={cn("text-foreground/50 text-sm", classNames?.stateText)}>
        {resolvedCopy.loadingMessage}
      </p>
    );
  }

  if (apiKeys.length === 0) {
    return (
      <p className={cn("text-foreground/50 text-sm", classNames?.stateText)}>
        {resolvedCopy.emptyMessage}
      </p>
    );
  }

  return (
    <div className={cn("space-y-3", classNames?.list)}>
      {apiKeys.map((key) => (
        <ConvexApiKeyCard
          classNames={classNames}
          formatTimestamp={formatTimestamp}
          key={key._id}
          onRevoke={onRevoke}
          onRotate={onRotate}
          renderTag={renderTag}
          resolvedCopy={resolvedCopy}
          value={key}
        />
      ))}
    </div>
  );
}

function ConvexApiKeyCard<Scope extends string = string, ApiKeyId extends string = string>({
  classNames,
  formatTimestamp,
  onRevoke,
  onRotate,
  renderTag,
  resolvedCopy,
  value,
}: {
  classNames?: ConvexApiKeyClassNames;
  formatTimestamp: (timestamp: number) => string;
  onRevoke: (apiKeyId: ApiKeyId) => void;
  onRotate: (apiKeyId: ApiKeyId) => void;
  renderTag?: ConvexApiKeyListProps<Scope, ApiKeyId>["renderTag"];
  resolvedCopy: Required<ConvexApiKeyListCopy>;
  value: ConvexApiKeyListItem<Scope, ApiKeyId>;
}) {
  return (
    <article
      className={cn(
        "border-foreground/10 bg-background/20 rounded-lg border",
        classNames?.listCard,
      )}
      data-testid="api-key-card"
    >
      <div className={cn("p-5", classNames?.listContent)}>
        <div className={cn("flex items-start justify-between gap-4", classNames?.listHeader)}>
          <div className={cn("space-y-1", classNames?.keyDetails)}>
            <p className={cn("text-foreground font-medium", classNames?.keyName)}>{value.name}</p>
            <p className={cn("text-foreground/45 text-xs", classNames?.keyPrefix)}>
              {value.keyPrefix}
            </p>
            <p
              className={cn(
                "text-foreground/45 text-xs font-medium uppercase",
                classNames?.keyStatus,
              )}
            >
              {value.status}
            </p>
            <p className={cn("text-foreground/45 text-xs", classNames?.metadata)}>
              {resolvedCopy.createdByLabel}{" "}
              {getConvexApiKeyCreatorLabel(value, resolvedCopy.unknownCreatorLabel)}
            </p>
            <p className={cn("text-foreground/45 text-xs", classNames?.metadata)}>
              {resolvedCopy.lastUsedLabel}{" "}
              {value.lastUsedAt ? formatTimestamp(value.lastUsedAt) : resolvedCopy.neverLabel}
              {value.lastUsedIp ? ` from ${value.lastUsedIp}` : ""}
            </p>
            <p className={cn("text-foreground/45 text-xs", classNames?.metadata)}>
              {resolvedCopy.expiresLabel}{" "}
              {value.expiresAt ? formatTimestamp(value.expiresAt) : resolvedCopy.neverLabel}
            </p>
          </div>
          <ConvexApiKeyCardActions
            classNames={classNames}
            onRevoke={() => onRevoke(value._id)}
            onRotate={() => onRotate(value._id)}
            resolvedCopy={resolvedCopy}
            status={value.status}
          />
        </div>
        <div className={cn("mt-3 flex flex-wrap gap-2", classNames?.tags)}>
          {[...value.scopes, ...value.allowedIpRanges].map((label) =>
            renderApiKeyTag(label, classNames, renderTag),
          )}
        </div>
      </div>
    </article>
  );
}

function ConvexApiKeyCardActions({
  classNames,
  onRevoke,
  onRotate,
  resolvedCopy,
  status,
}: {
  classNames?: ConvexApiKeyClassNames;
  onRevoke: () => void;
  onRotate: () => void;
  resolvedCopy: Required<ConvexApiKeyListCopy>;
  status: ConvexApiKeyStatus;
}) {
  if (status !== "active") {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap justify-end gap-2", classNames?.actions)}>
      <button
        className={cn(
          "border-foreground/15 text-foreground/70 hover:bg-foreground/5 inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors",
          classNames?.secondaryButton,
        )}
        onClick={onRotate}
        type="button"
      >
        {resolvedCopy.rotateLabel}
      </button>
      <button
        className={cn(
          "border-foreground/15 text-foreground/70 hover:bg-foreground/5 inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors",
          classNames?.secondaryButton,
        )}
        onClick={onRevoke}
        type="button"
      >
        {resolvedCopy.revokeLabel}
      </button>
    </div>
  );
}

function toggleScope<Scope extends string>(scopes: readonly Scope[], scope: Scope): Scope[] {
  return scopes.includes(scope) ? scopes.filter((item) => item !== scope) : [...scopes, scope];
}

function renderApiKeyTag(
  label: string,
  classNames: ConvexApiKeyClassNames | undefined,
  renderTag: ConvexApiKeyListProps["renderTag"],
): ReactNode {
  if (renderTag) {
    return renderTag(label);
  }

  return (
    <span
      className={cn(
        "border-foreground/10 text-foreground/70 inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium",
        classNames?.tag,
      )}
      key={label}
    >
      {label}
    </span>
  );
}

function resolveCreateCopy(
  copy: ConvexApiKeyCreateFormCopy | undefined,
): Required<ConvexApiKeyCreateFormCopy> {
  return { ...defaultCreateCopy, ...copy };
}

function resolveListCopy(copy: ConvexApiKeyListCopy): Required<ConvexApiKeyListCopy> {
  return { ...defaultListCopy, ...copy, emptyMessage: copy.emptyMessage };
}
