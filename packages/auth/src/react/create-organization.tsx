import { cn } from "./lib/ui";
import { useCallback, useState, type FormEvent, type ReactNode } from "react";

// ─── Types ────────────────────────────────────────────────────────────────

export type ConvexCreateOrganizationInput = {
  name: string;
  slug: string;
  imageUrl?: string | null;
};

export type ConvexCreateOrganizationClassNames = {
  card?: string;
  header?: string;
  title?: string;
  description?: string;
  body?: string;
  field?: string;
  label?: string;
  input?: string;
  helper?: string;
  actions?: string;
  primaryButton?: string;
  secondaryButton?: string;
  errorBanner?: string;
};

export type ConvexCreateOrganizationCopy = {
  title?: string;
  description?: string;
  nameLabel?: string;
  namePlaceholder?: string;
  slugLabel?: string;
  slugPlaceholder?: string;
  imageUrlLabel?: string;
  imageUrlPlaceholder?: string;
  slugHelper?: string;
  createLabel?: string;
  creatingLabel?: string;
  cancelLabel?: string;
  nameRequiredError?: string;
  slugRequiredError?: string;
  invalidSlugError?: string;
};

export type ConvexCreateOrganizationProps = {
  classNames?: ConvexCreateOrganizationClassNames;
  copy?: ConvexCreateOrganizationCopy;
  isLoading?: boolean;
  errorMessage?: string | null;
  defaultName?: string;
  defaultSlug?: string;
  defaultImageUrl?: string | null;
  onCreate?: (input: ConvexCreateOrganizationInput) => void | Promise<void>;
  onCancel?: () => void;
  renderHeader?: (args: { title: ReactNode; description: ReactNode }) => ReactNode;
};

// ─── Default copy ──────────────────────────────────────────────────────────

const defaultCopy: Required<ConvexCreateOrganizationCopy> = {
  title: "Create workspace",
  description: "Set up a new workspace for your team.",
  nameLabel: "Workspace name",
  namePlaceholder: "Acme Corp",
  slugLabel: "Slug",
  slugPlaceholder: "acme-corp",
  imageUrlLabel: "Logo URL (optional)",
  imageUrlPlaceholder: "https://...",
  slugHelper: "Used in URLs. Lowercase letters, numbers, and hyphens only.",
  createLabel: "Create workspace",
  creatingLabel: "Creating...",
  cancelLabel: "Cancel",
  nameRequiredError: "Name is required.",
  slugRequiredError: "Slug is required.",
  invalidSlugError: "Slug must contain only lowercase letters, numbers, and hyphens.",
};

function resolveCopy(
  copy: ConvexCreateOrganizationCopy | undefined,
): Required<ConvexCreateOrganizationCopy> {
  return { ...defaultCopy, ...copy };
}

const slugRegex = /^[a-z0-9-]+$/;

// ─── Component ────────────────────────────────────────────────────────────

function CreateOrganizationHeader(props: {
  classNames?: ConvexCreateOrganizationClassNames;
  copy: Required<ConvexCreateOrganizationCopy>;
  renderHeader?: ConvexCreateOrganizationProps["renderHeader"];
}) {
  const { classNames, copy, renderHeader } = props;
  const title = <h3 className={cn("text-base font-semibold", classNames?.title)}>{copy.title}</h3>;
  const description = (
    <p className={cn("text-foreground/60 text-sm", classNames?.description)}>{copy.description}</p>
  );

  if (renderHeader) {
    return renderHeader({ title, description });
  }

  return (
    <div className={cn("mb-4 space-y-1", classNames?.header)}>
      {title}
      {description}
    </div>
  );
}

function CreateOrganizationErrorBanner(props: {
  classNames?: ConvexCreateOrganizationClassNames;
  errorMessage?: string | null;
}) {
  if (!props.errorMessage) {
    return null;
  }

  return (
    <div
      className={cn(
        "border-destructive/30 bg-destructive/10 text-destructive mb-4 rounded-md border px-3 py-2 text-sm",
        props.classNames?.errorBanner,
      )}
    >
      {props.errorMessage}
    </div>
  );
}

function CreateOrganizationField(props: {
  classNames?: ConvexCreateOrganizationClassNames;
  disabled: boolean;
  error?: string | null;
  helper?: string;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div className={cn("space-y-1", props.classNames?.field)}>
      <label className={cn("text-foreground/70 text-sm", props.classNames?.label)}>
        {props.label}
      </label>
      <input
        type="text"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        disabled={props.disabled}
        className={cn(
          "border-foreground/10 bg-foreground/5 text-foreground focus:border-foreground/25 h-9 w-full rounded-md border px-3 text-sm transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50",
          props.classNames?.input,
          props.error && "border-destructive/40",
        )}
      />
      {props.error ? <p className="text-destructive text-xs">{props.error}</p> : null}
      {props.helper ? (
        <p className={cn("text-foreground/40 text-xs", props.classNames?.helper)}>{props.helper}</p>
      ) : null}
    </div>
  );
}

function CreateOrganizationActions(props: {
  busy: boolean;
  classNames?: ConvexCreateOrganizationClassNames;
  copy: Required<ConvexCreateOrganizationCopy>;
  hasCreateHandler: boolean;
  onCancel?: () => void;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2 pt-1", props.classNames?.actions)}>
      <button
        type="submit"
        disabled={props.busy || !props.hasCreateHandler}
        className={cn(
          "bg-foreground text-background hover:bg-foreground/90 inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          props.classNames?.primaryButton,
        )}
      >
        {props.busy ? props.copy.creatingLabel : props.copy.createLabel}
      </button>
      {props.onCancel ? (
        <button
          type="button"
          disabled={props.busy}
          onClick={props.onCancel}
          className={cn(
            "border-foreground/15 text-foreground/70 hover:bg-foreground/5 inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            props.classNames?.secondaryButton,
          )}
        >
          {props.copy.cancelLabel}
        </button>
      ) : null}
    </div>
  );
}

function CreateOrganizationFields(props: {
  busy: boolean;
  classNames?: ConvexCreateOrganizationClassNames;
  copy: Required<ConvexCreateOrganizationCopy>;
  imageUrl: string;
  name: string;
  nameError: string | null;
  setImageUrl: (value: string) => void;
  setName: (value: string) => void;
  setNameError: (value: string | null) => void;
  setSlug: (value: string) => void;
  setSlugError: (value: string | null) => void;
  slug: string;
  slugError: string | null;
}) {
  return (
    <>
      <CreateOrganizationField
        classNames={props.classNames}
        disabled={props.busy}
        error={props.nameError}
        label={props.copy.nameLabel}
        onChange={(value) => {
          props.setName(value);
          if (props.nameError) props.setNameError(null);
        }}
        placeholder={props.copy.namePlaceholder}
        value={props.name}
      />
      <CreateOrganizationField
        classNames={props.classNames}
        disabled={props.busy}
        error={props.slugError}
        helper={props.copy.slugHelper}
        label={props.copy.slugLabel}
        onChange={(value) => {
          props.setSlug(value);
          if (props.slugError) props.setSlugError(null);
        }}
        placeholder={props.copy.slugPlaceholder}
        value={props.slug}
      />
      <CreateOrganizationField
        classNames={props.classNames}
        disabled={props.busy}
        label={props.copy.imageUrlLabel}
        onChange={props.setImageUrl}
        placeholder={props.copy.imageUrlPlaceholder}
        value={props.imageUrl}
      />
    </>
  );
}

export function ConvexCreateOrganization({
  classNames,
  copy,
  isLoading,
  errorMessage,
  defaultName,
  defaultSlug,
  defaultImageUrl,
  onCreate,
  onCancel,
  renderHeader,
}: ConvexCreateOrganizationProps) {
  const resolvedCopy = resolveCopy(copy);
  const [name, setName] = useState(defaultName ?? "");
  const [slug, setSlug] = useState(defaultSlug ?? "");
  const [imageUrl, setImageUrl] = useState(defaultImageUrl ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validate = useCallback((): boolean => {
    let valid = true;
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();

    if (!trimmedName) {
      setNameError(resolvedCopy.nameRequiredError);
      valid = false;
    } else {
      setNameError(null);
    }

    if (!trimmedSlug) {
      setSlugError(resolvedCopy.slugRequiredError);
      valid = false;
    } else if (!slugRegex.test(trimmedSlug)) {
      setSlugError(resolvedCopy.invalidSlugError);
      valid = false;
    } else {
      setSlugError(null);
    }

    return valid;
  }, [
    name,
    resolvedCopy.invalidSlugError,
    resolvedCopy.nameRequiredError,
    resolvedCopy.slugRequiredError,
    slug,
  ]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!validate() || !onCreate) return;
      setSubmitting(true);
      try {
        await onCreate({
          name: name.trim(),
          slug: slug.trim(),
          imageUrl: imageUrl.trim() || null,
        });
      } finally {
        setSubmitting(false);
      }
    },
    [name, slug, imageUrl, onCreate, validate],
  );

  const busy = isLoading || submitting;

  return (
    <div
      className={cn("border-foreground/10 bg-foreground/5 rounded-lg border p-5", classNames?.card)}
    >
      <CreateOrganizationHeader
        classNames={classNames}
        copy={resolvedCopy}
        renderHeader={renderHeader}
      />
      <CreateOrganizationErrorBanner classNames={classNames} errorMessage={errorMessage} />

      <form onSubmit={handleSubmit} className={cn("space-y-3", classNames?.body)}>
        <CreateOrganizationFields
          busy={busy}
          classNames={classNames}
          copy={resolvedCopy}
          imageUrl={imageUrl}
          name={name}
          nameError={nameError}
          setImageUrl={setImageUrl}
          setName={setName}
          setNameError={setNameError}
          setSlug={setSlug}
          setSlugError={setSlugError}
          slug={slug}
          slugError={slugError}
        />
        <CreateOrganizationActions
          busy={busy}
          classNames={classNames}
          copy={resolvedCopy}
          hasCreateHandler={Boolean(onCreate)}
          onCancel={onCancel}
        />
      </form>
    </div>
  );
}
