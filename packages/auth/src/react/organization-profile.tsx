import { cn } from "./lib/ui";
import { useState, type ReactNode } from "react";

import type { ConvexOrganizationBrand, ConvexOrganizationBrandUpdate } from "./organization-brand";
import type {
  ConvexOrganizationSecurity,
  ConvexOrganizationSecurityUpdate,
} from "./organization-security";

export type { ConvexOrganizationBrand, ConvexOrganizationBrandUpdate } from "./organization-brand";
export {
  mergeOrganizationBrandIntoMetadataJson,
  parseOrganizationBrandFromMetadataJson,
  ORGANIZATION_BRAND_METADATA_KEY,
} from "./organization-brand";
export type {
  ConvexOrganizationSecurity,
  ConvexOrganizationSecurityUpdate,
} from "./organization-security";
export {
  mergeOrganizationSecurityIntoMetadataJson,
  parseOrganizationSecurityFromMetadataJson,
  ORGANIZATION_SECURITY_METADATA_KEY,
  ORGANIZATION_SESSION_TIMEOUT_MAX,
  ORGANIZATION_SESSION_TIMEOUT_MIN,
} from "./organization-security";

// ─── Types ────────────────────────────────────────────────────────────────

export type ConvexOrgProfileOrganization = {
  _id: string;
  name: string;
  slug: string;
  imageUrl?: string;
  status: "active" | "suspended" | "deleted";
  /** Suite tenant brand (VOR-182). Product chrome stays in the consumer. */
  brand?: ConvexOrganizationBrand;
  /** Suite org security policy (VOR-183). */
  security?: ConvexOrganizationSecurity;
};

export type ConvexOrgProfileClassNames = {
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
  actions?: string;
  primaryButton?: string;
  secondaryButton?: string;
  dangerButton?: string;
  statusBadge?: string;
};

export type ConvexOrgProfileCopy = {
  title?: string;
  description?: string;
  nameLabel?: string;
  slugLabel?: string;
  statusLabel?: string;
  activeStatus?: string;
  suspendedStatus?: string;
  brandSectionTitle?: string;
  primaryColorLabel?: string;
  accentColorLabel?: string;
  websiteLabel?: string;
  emailFromNameLabel?: string;
  emailReplyToLabel?: string;
  securitySectionTitle?: string;
  requireMfaLabel?: string;
  requireMfaEnabled?: string;
  requireMfaDisabled?: string;
  sessionTimeoutLabel?: string;
  sessionTimeoutPlaceholder?: string;
  saveLabel?: string;
  savingLabel?: string;
  cancelLabel?: string;
  editLabel?: string;
  deleteLabel?: string;
  confirmDeleteTitle?: string;
  confirmDeleteDescription?: string;
};

export type ConvexOrgProfileUpdateInput = {
  name?: string;
  slug?: string;
  imageUrl?: string | null;
  brand?: ConvexOrganizationBrandUpdate;
  security?: ConvexOrganizationSecurityUpdate;
};

export type ConvexOrgProfileProps = {
  organization: ConvexOrgProfileOrganization | null | undefined;
  classNames?: ConvexOrgProfileClassNames;
  copy?: ConvexOrgProfileCopy;
  isAdmin?: boolean;
  isLoading?: boolean;
  /** When false, brand fields are hidden (default true). */
  showBrandFields?: boolean;
  /** When false, security fields are hidden (default true). */
  showSecurityFields?: boolean;
  onUpdate?: (input: ConvexOrgProfileUpdateInput) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  renderDeleteConfirm?: (args: { onConfirm: () => void; onCancel: () => void }) => ReactNode;
};

// ─── Default copy ──────────────────────────────────────────────────────────

const defaultCopy: Required<ConvexOrgProfileCopy> = {
  title: "Workspace settings",
  description: "Manage your workspace profile.",
  nameLabel: "Name",
  slugLabel: "Slug",
  statusLabel: "Status",
  activeStatus: "Active",
  suspendedStatus: "Suspended",
  brandSectionTitle: "Brand",
  primaryColorLabel: "Primary color",
  accentColorLabel: "Accent color",
  websiteLabel: "Website",
  emailFromNameLabel: "Email from name",
  emailReplyToLabel: "Email reply-to",
  securitySectionTitle: "Security",
  requireMfaLabel: "Require MFA",
  requireMfaEnabled: "Required",
  requireMfaDisabled: "Not required",
  sessionTimeoutLabel: "Session timeout (minutes)",
  sessionTimeoutPlaceholder: "Platform default",
  saveLabel: "Save",
  savingLabel: "Saving...",
  cancelLabel: "Cancel",
  editLabel: "Edit",
  deleteLabel: "Delete workspace",
  confirmDeleteTitle: "Delete workspace?",
  confirmDeleteDescription: "This cannot be undone.",
};

function resolveCopy(copy: ConvexOrgProfileCopy | undefined): Required<ConvexOrgProfileCopy> {
  return { ...defaultCopy, ...copy };
}

function OrganizationProfileHeader(props: {
  classNames?: ConvexOrgProfileClassNames;
  copy: Required<ConvexOrgProfileCopy>;
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

function OrganizationProfileImage(props: {
  organization: ConvexOrgProfileOrganization;
  classNames?: ConvexOrgProfileClassNames;
}) {
  const { organization, classNames } = props;
  if (!organization.imageUrl) return null;

  return (
    <img
      src={organization.imageUrl}
      alt={organization.name}
      className={cn("mb-4 size-12 rounded-md object-cover", classNames?.image)}
    />
  );
}

function EditableProfileField(props: {
  label: string;
  value: string;
  editing: boolean;
  classNames?: ConvexOrgProfileClassNames;
  onChange: (value: string) => void;
}) {
  const { label, value, editing, classNames, onChange } = props;

  return (
    <div className={cn("space-y-1", classNames?.field)}>
      <label className={cn("text-foreground/70 text-sm", classNames?.label)}>{label}</label>
      {editing ? (
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "border-foreground/10 bg-foreground/5 text-foreground focus:border-foreground/25 h-9 w-full rounded-md border px-3 text-sm transition-colors outline-none",
            classNames?.input,
          )}
        />
      ) : (
        <p className={cn("text-foreground text-sm", classNames?.value)}>{value}</p>
      )}
    </div>
  );
}

function OrganizationStatusField(props: {
  organization: ConvexOrgProfileOrganization;
  classNames?: ConvexOrgProfileClassNames;
  copy: Required<ConvexOrgProfileCopy>;
}) {
  const { organization, classNames, copy } = props;
  const statusLabel = organization.status === "active" ? copy.activeStatus : copy.suspendedStatus;
  const statusClass = organization.status === "active" ? "text-success" : "text-warning";

  return (
    <div className={cn("space-y-1", classNames?.field)}>
      <label className={cn("text-foreground/70 text-sm", classNames?.label)}>
        {copy.statusLabel}
      </label>
      <span className={cn("inline-flex text-sm font-medium", statusClass, classNames?.statusBadge)}>
        {statusLabel}
      </span>
    </div>
  );
}

function OrganizationProfileBody(props: {
  organization: ConvexOrgProfileOrganization;
  editing: boolean;
  name: string;
  slug: string;
  brand: ConvexOrganizationBrand;
  security: ConvexOrganizationSecurity;
  showBrandFields: boolean;
  showSecurityFields: boolean;
  classNames?: ConvexOrgProfileClassNames;
  copy: Required<ConvexOrgProfileCopy>;
  onNameChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onBrandChange: (key: keyof ConvexOrganizationBrand, value: string) => void;
  onRequireMfaChange: (value: boolean) => void;
  onSessionTimeoutChange: (value: string) => void;
}) {
  const {
    organization,
    editing,
    name,
    slug,
    brand,
    security,
    showBrandFields,
    showSecurityFields,
    classNames,
    copy,
    onNameChange,
    onSlugChange,
    onBrandChange,
    onRequireMfaChange,
    onSessionTimeoutChange,
  } = props;

  const brandSource = editing ? brand : (organization.brand ?? {});
  const securitySource = editing ? security : (organization.security ?? {});
  const requireMfa = securitySource.requireMfa === true;
  const timeoutDisplay =
    securitySource.sessionTimeoutMinutes !== undefined
      ? String(securitySource.sessionTimeoutMinutes)
      : copy.sessionTimeoutPlaceholder;

  return (
    <div className={cn("space-y-3", classNames?.body)}>
      <EditableProfileField
        label={copy.nameLabel}
        value={editing ? name : organization.name}
        editing={editing}
        classNames={classNames}
        onChange={onNameChange}
      />
      <EditableProfileField
        label={copy.slugLabel}
        value={editing ? slug : organization.slug}
        editing={editing}
        classNames={classNames}
        onChange={onSlugChange}
      />
      <OrganizationStatusField organization={organization} classNames={classNames} copy={copy} />
      {showBrandFields ? (
        <div className="border-foreground/10 space-y-3 border-t pt-3">
          <p className={cn("text-foreground/70 text-sm font-medium")}>{copy.brandSectionTitle}</p>
          <EditableProfileField
            label={copy.primaryColorLabel}
            value={brandSource.primaryColor ?? ""}
            editing={editing}
            classNames={classNames}
            onChange={(value) => onBrandChange("primaryColor", value)}
          />
          <EditableProfileField
            label={copy.accentColorLabel}
            value={brandSource.accentColor ?? ""}
            editing={editing}
            classNames={classNames}
            onChange={(value) => onBrandChange("accentColor", value)}
          />
          <EditableProfileField
            label={copy.websiteLabel}
            value={brandSource.website ?? ""}
            editing={editing}
            classNames={classNames}
            onChange={(value) => onBrandChange("website", value)}
          />
          <EditableProfileField
            label={copy.emailFromNameLabel}
            value={brandSource.emailFromName ?? ""}
            editing={editing}
            classNames={classNames}
            onChange={(value) => onBrandChange("emailFromName", value)}
          />
          <EditableProfileField
            label={copy.emailReplyToLabel}
            value={brandSource.emailReplyTo ?? ""}
            editing={editing}
            classNames={classNames}
            onChange={(value) => onBrandChange("emailReplyTo", value)}
          />
        </div>
      ) : null}
      {showSecurityFields ? (
        <div className="border-foreground/10 space-y-3 border-t pt-3">
          <p className={cn("text-foreground/70 text-sm font-medium")}>
            {copy.securitySectionTitle}
          </p>
          <div className={cn("space-y-1", classNames?.field)}>
            <label className={cn("text-foreground/70 text-sm", classNames?.label)}>
              {copy.requireMfaLabel}
            </label>
            {editing ? (
              <label className="text-foreground flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={requireMfa}
                  onChange={(event) => onRequireMfaChange(event.target.checked)}
                />
                {requireMfa ? copy.requireMfaEnabled : copy.requireMfaDisabled}
              </label>
            ) : (
              <p className={cn("text-foreground text-sm", classNames?.value)}>
                {requireMfa ? copy.requireMfaEnabled : copy.requireMfaDisabled}
              </p>
            )}
          </div>
          <div className={cn("space-y-1", classNames?.field)}>
            <label className={cn("text-foreground/70 text-sm", classNames?.label)}>
              {copy.sessionTimeoutLabel}
            </label>
            {editing ? (
              <input
                type="number"
                min={15}
                max={1440}
                value={
                  security.sessionTimeoutMinutes !== undefined
                    ? String(security.sessionTimeoutMinutes)
                    : ""
                }
                placeholder={copy.sessionTimeoutPlaceholder}
                onChange={(event) => onSessionTimeoutChange(event.target.value)}
                className={cn(
                  "border-foreground/10 bg-foreground/5 text-foreground focus:border-foreground/25 h-9 w-full rounded-md border px-3 text-sm transition-colors outline-none",
                  classNames?.input,
                )}
              />
            ) : (
              <p className={cn("text-foreground text-sm", classNames?.value)}>{timeoutDisplay}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProfileButton(props: {
  children: ReactNode;
  className: string;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
}) {
  const { children, className, disabled, onClick } = props;

  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function EditingActions(props: {
  saving: boolean;
  isLoading?: boolean;
  classNames?: ConvexOrgProfileClassNames;
  copy: Required<ConvexOrgProfileCopy>;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const { saving, isLoading, classNames, copy, onSave, onCancel } = props;

  return (
    <>
      <ProfileButton
        className={cn(
          "bg-foreground text-background hover:bg-foreground/90 inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          classNames?.primaryButton,
        )}
        onClick={onSave}
        disabled={saving || isLoading}
      >
        {saving ? copy.savingLabel : copy.saveLabel}
      </ProfileButton>
      <ProfileButton
        className={cn(
          "border-foreground/15 text-foreground/70 hover:bg-foreground/5 inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors",
          classNames?.secondaryButton,
        )}
        onClick={onCancel}
        disabled={saving}
      >
        {copy.cancelLabel}
      </ProfileButton>
    </>
  );
}

function ReadOnlyActions(props: {
  isLoading?: boolean;
  canDelete: boolean;
  classNames?: ConvexOrgProfileClassNames;
  copy: Required<ConvexOrgProfileCopy>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { isLoading, canDelete, classNames, copy, onEdit, onDelete } = props;

  return (
    <>
      <ProfileButton
        className={cn(
          "bg-foreground text-background hover:bg-foreground/90 inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors",
          classNames?.primaryButton,
        )}
        onClick={onEdit}
        disabled={isLoading}
      >
        {copy.editLabel}
      </ProfileButton>
      {canDelete ? (
        <ProfileButton
          className={cn(
            "border-destructive/30 text-destructive hover:bg-destructive/10 inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors",
            classNames?.dangerButton,
          )}
          onClick={onDelete}
          disabled={isLoading}
        >
          {copy.deleteLabel}
        </ProfileButton>
      ) : null}
    </>
  );
}

function OrganizationProfileActions(props: {
  isAdmin?: boolean;
  editing: boolean;
  saving: boolean;
  isLoading?: boolean;
  canDelete: boolean;
  classNames?: ConvexOrgProfileClassNames;
  copy: Required<ConvexOrgProfileCopy>;
  onEdit: () => void;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const {
    isAdmin,
    editing,
    saving,
    isLoading,
    canDelete,
    classNames,
    copy,
    onEdit,
    onSave,
    onCancel,
    onDelete,
  } = props;
  if (!isAdmin) return null;

  return (
    <div className={cn("mt-4 flex flex-wrap gap-2", classNames?.actions)}>
      {editing ? (
        <EditingActions
          saving={saving}
          isLoading={isLoading}
          classNames={classNames}
          copy={copy}
          onSave={onSave}
          onCancel={onCancel}
        />
      ) : (
        <ReadOnlyActions
          isLoading={isLoading}
          canDelete={canDelete}
          classNames={classNames}
          copy={copy}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

function DefaultDeleteConfirm(props: {
  copy: Required<ConvexOrgProfileCopy>;
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
            {copy.deleteLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirm(props: {
  open: boolean;
  copy: Required<ConvexOrgProfileCopy>;
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

export function ConvexOrganizationProfile(props: ConvexOrgProfileProps) {
  const {
    organization,
    classNames,
    copy,
    isAdmin,
    isLoading,
    showBrandFields = true,
    showSecurityFields = true,
    onUpdate,
    onDelete,
    renderDeleteConfirm,
  } = props;
  const resolvedCopy = resolveCopy(copy);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(organization?.name ?? "");
  const [slug, setSlug] = useState(organization?.slug ?? "");
  const [brand, setBrand] = useState<ConvexOrganizationBrand>(organization?.brand ?? {});
  const [security, setSecurity] = useState<ConvexOrganizationSecurity>(
    organization?.security ?? {},
  );
  const [saving, setSaving] = useState(false);

  if (!organization) {
    return null;
  }

  const startEdit = () => {
    setName(organization.name);
    setSlug(organization.slug);
    setBrand(organization.brand ?? {});
    setSecurity(organization.security ?? {});
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const saveEdit = async () => {
    if (!onUpdate) return;
    setSaving(true);
    try {
      const brandUpdate: ConvexOrganizationBrandUpdate = {
        primaryColor: brand.primaryColor?.trim() ? brand.primaryColor.trim() : null,
        accentColor: brand.accentColor?.trim() ? brand.accentColor.trim() : null,
        website: brand.website?.trim() ? brand.website.trim() : null,
        emailFromName: brand.emailFromName?.trim() ? brand.emailFromName.trim() : null,
        emailReplyTo: brand.emailReplyTo?.trim() ? brand.emailReplyTo.trim() : null,
      };
      const securityUpdate: ConvexOrganizationSecurityUpdate = {
        requireMfa: security.requireMfa === true ? true : null,
        sessionTimeoutMinutes:
          security.sessionTimeoutMinutes !== undefined ? security.sessionTimeoutMinutes : null,
      };
      await onUpdate({
        name: name.trim() || undefined,
        slug: slug.trim() || undefined,
        ...(showBrandFields ? { brand: brandUpdate } : {}),
        ...(showSecurityFields ? { security: securityUpdate } : {}),
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setConfirmDelete(false);
    await onDelete();
  };

  const onBrandChange = (key: keyof ConvexOrganizationBrand, value: string) => {
    setBrand((current) => ({ ...current, [key]: value }));
  };

  return (
    <>
      <div
        className={cn(
          "border-foreground/10 bg-foreground/5 rounded-lg border p-5",
          classNames?.card,
        )}
      >
        <OrganizationProfileHeader classNames={classNames} copy={resolvedCopy} />
        <OrganizationProfileImage organization={organization} classNames={classNames} />
        <OrganizationProfileBody
          organization={organization}
          editing={editing}
          name={name}
          slug={slug}
          brand={brand}
          security={security}
          showBrandFields={showBrandFields}
          showSecurityFields={showSecurityFields}
          classNames={classNames}
          copy={resolvedCopy}
          onNameChange={setName}
          onSlugChange={setSlug}
          onBrandChange={onBrandChange}
          onRequireMfaChange={(value) =>
            setSecurity((current) => ({ ...current, requireMfa: value }))
          }
          onSessionTimeoutChange={(value) => {
            const trimmed = value.trim();
            if (trimmed === "") {
              setSecurity((current) => {
                const next = { ...current };
                delete next.sessionTimeoutMinutes;
                return next;
              });
              return;
            }
            const parsed = Number(trimmed);
            if (!Number.isFinite(parsed)) {
              return;
            }
            setSecurity((current) => ({
              ...current,
              sessionTimeoutMinutes: Math.round(parsed),
            }));
          }}
        />
        <OrganizationProfileActions
          isAdmin={isAdmin}
          editing={editing}
          saving={saving}
          isLoading={isLoading}
          canDelete={typeof onDelete === "function"}
          classNames={classNames}
          copy={resolvedCopy}
          onEdit={startEdit}
          onSave={saveEdit}
          onCancel={cancelEdit}
          onDelete={() => setConfirmDelete(true)}
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
