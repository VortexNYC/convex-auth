import { cn } from "./lib/ui";
import { useCallback, useState, type FormEvent, type ReactNode } from "react";

// ─── Types ────────────────────────────────────────────────────────────────

export type ConvexUserIdentityProvider = {
  providerId: string;
  providerName?: string;
};

export type ConvexUserProfileUser = {
  id: string;
  email: string;
  name?: string | null;
  imageUrl?: string | null;
  emailVerified?: boolean;
  providers?: readonly ConvexUserIdentityProvider[];
};

export type ConvexUserProfileClassNames = {
  card?: string;
  header?: string;
  title?: string;
  description?: string;
  body?: string;
  field?: string;
  label?: string;
  value?: string;
  input?: string;
  image?: string;
  imagePlaceholder?: string;
  actions?: string;
  primaryButton?: string;
  secondaryButton?: string;
  dangerButton?: string;
  sectionDivider?: string;
  sectionTitle?: string;
  sectionBody?: string;
  providerItem?: string;
  providerLabel?: string;
  errorBanner?: string;
};

export type ConvexUserProfileCopy = {
  title?: string;
  description?: string;
  nameLabel?: string;
  emailLabel?: string;
  imageUrlLabel?: string;
  imageUrlPlaceholder?: string;
  verifiedLabel?: string;
  notVerifiedLabel?: string;
  saveLabel?: string;
  savingLabel?: string;
  cancelLabel?: string;
  editLabel?: string;
  deleteAccountLabel?: string;
  confirmDeleteTitle?: string;
  confirmDeleteDescription?: string;
  securityLabel?: string;
  changePasswordLabel?: string;
  twoFactorLabel?: string;
  connectedAccountsLabel?: string;
  nameRequiredError?: string;
};

export type ConvexUserProfileProps = {
  user: ConvexUserProfileUser | null | undefined;
  classNames?: ConvexUserProfileClassNames;
  copy?: ConvexUserProfileCopy;
  isLoading?: boolean;
  errorMessage?: string | null;
  isAdmin?: boolean;
  onUpdateProfile?: (input: { name: string; imageUrl?: string | null }) => void | Promise<void>;
  onDeleteAccount?: () => void | Promise<void>;
  onChangePassword?: () => void | Promise<void>;
  onManageTwoFactor?: () => void | Promise<void>;
  renderDeleteConfirm?: (args: { onConfirm: () => void; onCancel: () => void }) => ReactNode;
};

// ─── Default copy ──────────────────────────────────────────────────────────

const defaultCopy: Required<ConvexUserProfileCopy> = {
  title: "Account",
  description: "Manage your profile and security settings.",
  nameLabel: "Name",
  emailLabel: "Email",
  imageUrlLabel: "Profile picture URL",
  imageUrlPlaceholder: "https://...",
  verifiedLabel: "Verified",
  notVerifiedLabel: "Not verified",
  saveLabel: "Save",
  savingLabel: "Saving...",
  cancelLabel: "Cancel",
  editLabel: "Edit",
  deleteAccountLabel: "Delete account",
  confirmDeleteTitle: "Delete account?",
  confirmDeleteDescription: "This will permanently delete your account and cannot be undone.",
  securityLabel: "Security",
  changePasswordLabel: "Change password",
  twoFactorLabel: "Two-factor authentication",
  connectedAccountsLabel: "Connected accounts",
  nameRequiredError: "Name is required.",
};

function resolveCopy(copy: ConvexUserProfileCopy | undefined): Required<ConvexUserProfileCopy> {
  return { ...defaultCopy, ...copy };
}

function UserProfileHeader(props: {
  classNames?: ConvexUserProfileClassNames;
  copy: Required<ConvexUserProfileCopy>;
}) {
  const { classNames, copy } = props;

  return (
    <div className={cn("mb-4 space-y-1", classNames?.header)}>
      <h3 className={cn("text-base font-semibold", classNames?.title)}>{copy.title}</h3>
      <p className={cn("text-foreground/60 text-sm", classNames?.description)}>
        {copy.description}
      </p>
    </div>
  );
}

function UserProfileError(props: {
  message?: string | null;
  classNames?: ConvexUserProfileClassNames;
}) {
  const { message, classNames } = props;
  if (!message) return null;

  return (
    <div
      className={cn(
        "border-destructive/30 bg-destructive/10 text-destructive mb-4 rounded-md border px-3 py-2 text-sm",
        classNames?.errorBanner,
      )}
    >
      {message}
    </div>
  );
}

function UserProfileAvatar(props: {
  user: ConvexUserProfileUser;
  classNames?: ConvexUserProfileClassNames;
}) {
  const { user, classNames } = props;

  if (user.imageUrl) {
    return (
      <img
        src={user.imageUrl}
        alt=""
        className={cn("size-12 rounded-full object-cover", classNames?.image)}
      />
    );
  }

  return (
    <span
      className={cn(
        "bg-foreground/10 inline-flex size-12 items-center justify-center rounded-full text-sm font-medium",
        classNames?.imagePlaceholder,
      )}
    >
      {(user.name ?? user.email).slice(0, 1).toUpperCase()}
    </span>
  );
}

function UserProfileSummary(props: {
  user: ConvexUserProfileUser;
  classNames?: ConvexUserProfileClassNames;
}) {
  const { user, classNames } = props;

  return (
    <div className={cn("mb-4 flex items-center gap-3", classNames?.body)}>
      <UserProfileAvatar user={user} classNames={classNames} />
      <div className="min-w-0">
        <p className={cn("text-foreground text-sm font-medium", classNames?.value)}>
          {user.name ?? user.email}
        </p>
        <p className="text-foreground/40 text-xs">{user.email}</p>
      </div>
    </div>
  );
}

function NameField(props: {
  user: ConvexUserProfileUser;
  editing: boolean;
  name: string;
  nameError: string | null;
  busy: boolean;
  classNames?: ConvexUserProfileClassNames;
  copy: Required<ConvexUserProfileCopy>;
  onNameChange: (value: string) => void;
  onClearNameError: () => void;
}) {
  const { user, editing, name, nameError, busy, classNames, copy, onNameChange, onClearNameError } =
    props;

  return (
    <div className={cn("space-y-1", classNames?.field)}>
      <label className={cn("text-foreground/70 text-sm", classNames?.label)}>
        {copy.nameLabel}
      </label>
      {editing ? (
        <input
          type="text"
          value={name}
          onChange={(event) => {
            onNameChange(event.target.value);
            if (nameError) onClearNameError();
          }}
          disabled={busy}
          className={cn(
            "border-foreground/10 bg-foreground/5 text-foreground focus:border-foreground/25 h-9 w-full rounded-md border px-3 text-sm transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50",
            classNames?.input,
            nameError && "border-destructive/40",
          )}
        />
      ) : (
        <p className={cn("text-foreground text-sm", classNames?.value)}>{user.name ?? "—"}</p>
      )}
      {editing && nameError ? <p className="text-destructive text-xs">{nameError}</p> : null}
    </div>
  );
}

function EmailField(props: {
  user: ConvexUserProfileUser;
  classNames?: ConvexUserProfileClassNames;
  copy: Required<ConvexUserProfileCopy>;
}) {
  const { user, classNames, copy } = props;

  return (
    <div className={cn("space-y-1", classNames?.field)}>
      <label className={cn("text-foreground/70 text-sm", classNames?.label)}>
        {copy.emailLabel}
      </label>
      <div className="flex items-center gap-2">
        <p className={cn("text-foreground text-sm", classNames?.value)}>{user.email}</p>
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
            user.emailVerified ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
          )}
        >
          {user.emailVerified ? copy.verifiedLabel : copy.notVerifiedLabel}
        </span>
      </div>
    </div>
  );
}

function ImageUrlField(props: {
  editing: boolean;
  imageUrl: string;
  busy: boolean;
  classNames?: ConvexUserProfileClassNames;
  copy: Required<ConvexUserProfileCopy>;
  onImageUrlChange: (value: string) => void;
}) {
  const { editing, imageUrl, busy, classNames, copy, onImageUrlChange } = props;
  if (!editing) return null;

  return (
    <div className={cn("space-y-1", classNames?.field)}>
      <label className={cn("text-foreground/70 text-sm", classNames?.label)}>
        {copy.imageUrlLabel}
      </label>
      <input
        type="text"
        value={imageUrl}
        onChange={(event) => onImageUrlChange(event.target.value)}
        placeholder={copy.imageUrlPlaceholder}
        disabled={busy}
        className={cn(
          "border-foreground/10 bg-foreground/5 text-foreground focus:border-foreground/25 h-9 w-full rounded-md border px-3 text-sm transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50",
          classNames?.input,
        )}
      />
    </div>
  );
}

function UserProfileFormActions(props: {
  editing: boolean;
  saving: boolean;
  busy: boolean;
  isLoading?: boolean;
  classNames?: ConvexUserProfileClassNames;
  copy: Required<ConvexUserProfileCopy>;
  onCancel: () => void;
  onEdit: () => void;
}) {
  const { editing, saving, busy, isLoading, classNames, copy, onCancel, onEdit } = props;

  return (
    <div className={cn("flex flex-wrap gap-2 pt-1", classNames?.actions)}>
      {editing ? (
        <>
          <button
            type="submit"
            disabled={busy}
            className={cn(
              "bg-foreground text-background hover:bg-foreground/90 inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              classNames?.primaryButton,
            )}
          >
            {saving ? copy.savingLabel : copy.saveLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className={cn(
              "border-foreground/15 text-foreground/70 hover:bg-foreground/5 inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              classNames?.secondaryButton,
            )}
          >
            {copy.cancelLabel}
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={isLoading}
          onClick={onEdit}
          className={cn(
            "bg-foreground text-background hover:bg-foreground/90 inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            classNames?.primaryButton,
          )}
        >
          {copy.editLabel}
        </button>
      )}
    </div>
  );
}

function UserProfileForm(props: {
  user: ConvexUserProfileUser;
  editing: boolean;
  name: string;
  imageUrl: string;
  nameError: string | null;
  saving: boolean;
  busy: boolean;
  isLoading?: boolean;
  classNames?: ConvexUserProfileClassNames;
  copy: Required<ConvexUserProfileCopy>;
  onSubmit: (event: FormEvent) => void | Promise<void>;
  onNameChange: (value: string) => void;
  onImageUrlChange: (value: string) => void;
  onClearNameError: () => void;
  onCancel: () => void;
  onEdit: () => void;
}) {
  const { user, editing, name, imageUrl, nameError, saving, busy, isLoading, classNames, copy } =
    props;

  return (
    <form onSubmit={props.onSubmit} className={cn("space-y-3", classNames?.body)}>
      <NameField
        user={user}
        editing={editing}
        name={name}
        nameError={nameError}
        busy={busy}
        classNames={classNames}
        copy={copy}
        onNameChange={props.onNameChange}
        onClearNameError={props.onClearNameError}
      />
      <EmailField user={user} classNames={classNames} copy={copy} />
      <ImageUrlField
        editing={editing}
        imageUrl={imageUrl}
        busy={busy}
        classNames={classNames}
        copy={copy}
        onImageUrlChange={props.onImageUrlChange}
      />
      <UserProfileFormActions
        editing={editing}
        saving={saving}
        busy={busy}
        isLoading={isLoading}
        classNames={classNames}
        copy={copy}
        onCancel={props.onCancel}
        onEdit={props.onEdit}
      />
    </form>
  );
}

function SectionDivider(props: { classNames?: ConvexUserProfileClassNames }) {
  return (
    <div className={cn("border-foreground/10 my-4 border-t", props.classNames?.sectionDivider)} />
  );
}

function SecuritySection(props: {
  isLoading?: boolean;
  classNames?: ConvexUserProfileClassNames;
  copy: Required<ConvexUserProfileCopy>;
  onChangePassword?: () => void | Promise<void>;
  onManageTwoFactor?: () => void | Promise<void>;
}) {
  const { isLoading, classNames, copy, onChangePassword, onManageTwoFactor } = props;

  return (
    <>
      <SectionDivider classNames={classNames} />
      <div className={cn("text-foreground/50 mb-3 text-xs font-medium", classNames?.sectionTitle)}>
        {copy.securityLabel}
      </div>
      <div className={cn("flex flex-col gap-2", classNames?.sectionBody)}>
        <SecurityButton
          label={copy.changePasswordLabel}
          disabled={isLoading}
          onClick={onChangePassword}
          classNames={classNames}
        />
        <SecurityButton
          label={copy.twoFactorLabel}
          disabled={isLoading}
          onClick={onManageTwoFactor}
          classNames={classNames}
        />
      </div>
    </>
  );
}

function SecurityButton(props: {
  label: string;
  disabled?: boolean;
  onClick?: () => void | Promise<void>;
  classNames?: ConvexUserProfileClassNames;
}) {
  const { label, disabled, onClick, classNames } = props;
  if (!onClick) return null;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "border-foreground/15 text-foreground/70 hover:bg-foreground/5 inline-flex h-9 w-fit items-center justify-center rounded-md border px-4 text-left text-sm font-medium transition-colors",
        classNames?.secondaryButton,
      )}
    >
      {label}
    </button>
  );
}

function ConnectedAccountsSection(props: {
  providers?: readonly ConvexUserIdentityProvider[];
  classNames?: ConvexUserProfileClassNames;
  copy: Required<ConvexUserProfileCopy>;
}) {
  const { providers, classNames, copy } = props;
  if (!providers || providers.length === 0) return null;

  return (
    <>
      <SectionDivider classNames={classNames} />
      <div className={cn("text-foreground/50 mb-3 text-xs font-medium", classNames?.sectionTitle)}>
        {copy.connectedAccountsLabel}
      </div>
      <div className={cn("flex flex-col gap-1", classNames?.sectionBody)}>
        {providers.map((provider) => (
          <div
            key={provider.providerId}
            className={cn("flex items-center gap-2", classNames?.providerItem)}
          >
            <span
              className={cn(
                "bg-foreground/5 text-foreground/70 rounded-md px-2 py-1 text-xs",
                classNames?.providerLabel,
              )}
            >
              {provider.providerName ?? provider.providerId}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function DeleteAccountAction(props: {
  enabled: boolean;
  isLoading?: boolean;
  classNames?: ConvexUserProfileClassNames;
  copy: Required<ConvexUserProfileCopy>;
  onClick: () => void;
}) {
  const { enabled, isLoading, classNames, copy, onClick } = props;
  if (!enabled) return null;

  return (
    <>
      <SectionDivider classNames={classNames} />
      <button
        type="button"
        disabled={isLoading}
        onClick={onClick}
        className={cn(
          "border-destructive/30 text-destructive hover:bg-destructive/10 inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          classNames?.dangerButton,
        )}
      >
        {copy.deleteAccountLabel}
      </button>
    </>
  );
}

function DefaultDeleteConfirm(props: {
  copy: Required<ConvexUserProfileCopy>;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const { copy, onConfirm, onCancel } = props;

  return (
    // convex-allow-color: modal scrim — intentionally dark in both light and dark
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="border-foreground/10 bg-background w-full max-w-sm rounded-lg border p-5 shadow-xl">
        <h4 className="text-foreground text-base font-semibold">{copy.confirmDeleteTitle}</h4>
        <p className="text-foreground/60 mt-1 text-sm">{copy.confirmDeleteDescription}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="border-foreground/15 text-foreground/70 hover:bg-foreground/5 h-9 rounded-md border px-4 text-sm font-medium transition-colors"
            onClick={onCancel}
          >
            {copy.cancelLabel}
          </button>
          <button
            type="button"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 h-9 rounded-md px-4 text-sm font-medium transition-colors"
            onClick={onConfirm}
          >
            {copy.deleteAccountLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirm(props: {
  open: boolean;
  copy: Required<ConvexUserProfileCopy>;
  renderDeleteConfirm?: (args: { onConfirm: () => void; onCancel: () => void }) => ReactNode;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const { open, copy, renderDeleteConfirm, onConfirm, onCancel } = props;
  if (!open) return null;

  return renderDeleteConfirm ? (
    renderDeleteConfirm({ onConfirm, onCancel })
  ) : (
    <DefaultDeleteConfirm copy={copy} onConfirm={onConfirm} onCancel={onCancel} />
  );
}

// ─── Component ────────────────────────────────────────────────────────────

export function ConvexUserProfile(props: ConvexUserProfileProps) {
  const {
    user,
    classNames,
    copy,
    isLoading,
    errorMessage,
    onUpdateProfile,
    onDeleteAccount,
    onChangePassword,
    onManageTwoFactor,
    renderDeleteConfirm,
  } = props;

  const resolvedCopy = resolveCopy(copy);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [imageUrl, setImageUrl] = useState(user?.imageUrl ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const startEdit = useCallback(() => {
    setName(user?.name ?? "");
    setImageUrl(user?.imageUrl ?? "");
    setNameError(null);
    setEditing(true);
  }, [user?.name, user?.imageUrl]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setNameError(null);
  }, []);

  const saveEdit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!onUpdateProfile) return;
      const trimmed = name.trim();
      if (!trimmed) {
        setNameError(resolvedCopy.nameRequiredError);
        return;
      }
      setSaving(true);
      try {
        await onUpdateProfile({
          name: trimmed,
          imageUrl: imageUrl.trim() || null,
        });
        setEditing(false);
        setNameError(null);
      } finally {
        setSaving(false);
      }
    },
    [name, imageUrl, onUpdateProfile, resolvedCopy.nameRequiredError],
  );

  const handleDelete = useCallback(async () => {
    if (!onDeleteAccount) return;
    setConfirmDelete(false);
    await onDeleteAccount();
  }, [onDeleteAccount]);

  if (!user) return null;

  const busy = isLoading || saving;

  return (
    <>
      <div
        className={cn(
          "border-foreground/10 bg-foreground/5 rounded-lg border p-5",
          classNames?.card,
        )}
      >
        <UserProfileHeader classNames={classNames} copy={resolvedCopy} />
        <UserProfileError message={errorMessage} classNames={classNames} />
        <UserProfileSummary user={user} classNames={classNames} />
        <UserProfileForm
          user={user}
          editing={editing}
          name={name}
          imageUrl={imageUrl}
          nameError={nameError}
          saving={saving}
          busy={busy}
          isLoading={isLoading}
          classNames={classNames}
          copy={resolvedCopy}
          onSubmit={saveEdit}
          onNameChange={setName}
          onImageUrlChange={setImageUrl}
          onClearNameError={() => setNameError(null)}
          onCancel={cancelEdit}
          onEdit={startEdit}
        />
        <SecuritySection
          isLoading={isLoading}
          classNames={classNames}
          copy={resolvedCopy}
          onChangePassword={onChangePassword}
          onManageTwoFactor={onManageTwoFactor}
        />
        <ConnectedAccountsSection
          providers={user.providers}
          classNames={classNames}
          copy={resolvedCopy}
        />
        <DeleteAccountAction
          enabled={typeof onDeleteAccount === "function"}
          isLoading={isLoading}
          classNames={classNames}
          copy={resolvedCopy}
          onClick={() => setConfirmDelete(true)}
        />
      </div>

      <DeleteConfirm
        open={confirmDelete}
        copy={resolvedCopy}
        renderDeleteConfirm={renderDeleteConfirm}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
