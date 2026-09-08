import { cn } from "./lib/ui";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

// ─── Types ────────────────────────────────────────────────────────────────

export type ConvexOrgSwitcherOrganization = {
  _id: string;
  name: string;
  slug?: string;
  imageUrl?: string;
};

export type ConvexOrgSwitcherClassNames = {
  trigger?: string;
  triggerName?: string;
  triggerImage?: string;
  triggerPlaceholder?: string;
  dropdown?: string;
  dropdownPanel?: string;
  dropdownSection?: string;
  dropdownSectionTitle?: string;
  dropdownItem?: string;
  dropdownItemActive?: string;
  dropdownItemLabel?: string;
  dropdownItemMeta?: string;
  dropdownDivider?: string;
  createButton?: string;
  searchInput?: string;
  inPlaceCreateForm?: string;
  inPlaceCreateInput?: string;
  inPlaceCreateButton?: string;
  inPlaceCreateCancel?: string;
};

export type ConvexOrgSwitcherCopy = {
  currentOrganizationLabel?: string;
  otherOrganizationsLabel?: string;
  createOrganizationLabel?: string;
  personalAccountLabel?: string;
  noOrganizationsLabel?: string;
  searchPlaceholder?: string;
  inPlaceCreatePlaceholder?: string;
  inPlaceCreateButtonLabel?: string;
  inPlaceCreateCancelLabel?: string;
};

export type ConvexOrgSwitcherProps = {
  organizations: readonly ConvexOrgSwitcherOrganization[];
  currentOrganizationId?: string | null;
  classNames?: ConvexOrgSwitcherClassNames;
  copy?: ConvexOrgSwitcherCopy;
  onSelectOrganization: (organizationId: string) => void | Promise<void>;
  onSelectPersonalAccount?: () => void | Promise<void>;
  onCreateOrganization?: () => void | Promise<void>;
  onInPlaceCreateOrganization?: (name: string) => void | Promise<void>;
  showPersonalAccount?: boolean;
  enableSearch?: boolean;
  currentOrganization?: ConvexOrgSwitcherOrganization | null;
  personalAccountLabel?: string;
  renderCustomTrigger?: (args: {
    organization: ConvexOrgSwitcherOrganization | null;
    onClick: () => void;
  }) => ReactNode;
};

// ─── Default copy ──────────────────────────────────────────────────────────

const defaultCopy: Required<ConvexOrgSwitcherCopy> = {
  currentOrganizationLabel: "Current workspace",
  otherOrganizationsLabel: "Other workspaces",
  createOrganizationLabel: "Create workspace",
  personalAccountLabel: "Personal account",
  noOrganizationsLabel: "No organizations",
  searchPlaceholder: "Search workspaces",
  inPlaceCreatePlaceholder: "Workspace name",
  inPlaceCreateButtonLabel: "Create",
  inPlaceCreateCancelLabel: "Cancel",
};

function resolveCopy(copy: ConvexOrgSwitcherCopy | undefined): Required<ConvexOrgSwitcherCopy> {
  return { ...defaultCopy, ...copy };
}

function OrganizationAvatar(props: {
  organization: ConvexOrgSwitcherOrganization;
  className?: string;
  placeholderClassName?: string;
}) {
  const { organization, className, placeholderClassName } = props;

  if (organization.imageUrl) {
    return (
      <img
        src={organization.imageUrl}
        alt=""
        className={cn("size-5 rounded-md object-cover", className)}
      />
    );
  }

  return (
    <span
      className={cn(
        "bg-foreground/10 inline-flex size-5 items-center justify-center rounded-md text-[10px] font-medium",
        placeholderClassName,
      )}
    >
      {organization.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function OrganizationSwitcherTrigger(props: {
  currentOrg: ConvexOrgSwitcherOrganization | null;
  open: boolean;
  classNames?: ConvexOrgSwitcherClassNames;
  copy: Required<ConvexOrgSwitcherCopy>;
  onToggle: () => void;
}) {
  const { currentOrg, open, classNames, copy, onToggle } = props;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "border-foreground/10 bg-foreground/5 text-foreground hover:bg-foreground/10 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
        classNames?.trigger,
      )}
      aria-haspopup="menu"
      aria-expanded={open}
    >
      {currentOrg ? (
        <OrganizationAvatar
          organization={currentOrg}
          className={classNames?.triggerImage}
          placeholderClassName={classNames?.triggerPlaceholder}
        />
      ) : (
        <span className="text-foreground/40">{copy.noOrganizationsLabel}</span>
      )}
      <span className={cn("max-w-[12ch] truncate font-medium", classNames?.triggerName)}>
        {currentOrg?.name ?? copy.noOrganizationsLabel}
      </span>
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        className={cn("text-foreground/60 transition-transform", open && "rotate-180")}
      >
        <path
          d="M2.5 4.5L6 8L9.5 4.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

function DropdownDivider(props: { classNames?: ConvexOrgSwitcherClassNames }) {
  return <div className={cn("border-foreground/10 border-t", props.classNames?.dropdownDivider)} />;
}

function DropdownTitle(props: { children: ReactNode; classNames?: ConvexOrgSwitcherClassNames }) {
  return (
    <div
      className={cn(
        "text-foreground/50 px-3 py-1.5 text-xs font-medium",
        props.classNames?.dropdownSectionTitle,
      )}
    >
      {props.children}
    </div>
  );
}

function OrganizationMenuItem(props: {
  organization: ConvexOrgSwitcherOrganization;
  active?: boolean;
  classNames?: ConvexOrgSwitcherClassNames;
  onClick?: () => void;
}) {
  const { organization, active, classNames, onClick } = props;

  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active === true}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
        active
          ? "bg-foreground/10 text-foreground"
          : "text-foreground/80 hover:bg-foreground/5 transition-colors",
        active ? classNames?.dropdownItemActive : classNames?.dropdownItem,
      )}
      disabled={active}
      onClick={onClick}
    >
      <OrganizationAvatar organization={organization} />
      <span className={cn("flex-1 truncate", classNames?.dropdownItemLabel)}>
        {organization.name}
      </span>
    </button>
  );
}

function CurrentOrganizationSection(props: {
  currentOrg: ConvexOrgSwitcherOrganization | null;
  classNames?: ConvexOrgSwitcherClassNames;
  copy: Required<ConvexOrgSwitcherCopy>;
}) {
  const { currentOrg, classNames, copy } = props;
  if (!currentOrg) return null;

  return (
    <>
      <DropdownTitle classNames={classNames}>{copy.currentOrganizationLabel}</DropdownTitle>
      <div className={cn("pb-1", classNames?.dropdownPanel)}>
        <OrganizationMenuItem organization={currentOrg} active={true} classNames={classNames} />
      </div>
    </>
  );
}

function OtherOrganizationsSection(props: {
  organizations: readonly ConvexOrgSwitcherOrganization[];
  classNames?: ConvexOrgSwitcherClassNames;
  copy: Required<ConvexOrgSwitcherCopy>;
  onSelect: (organizationId: string) => void;
}) {
  const { organizations, classNames, copy, onSelect } = props;
  if (organizations.length === 0) return null;

  return (
    <>
      <DropdownDivider classNames={classNames} />
      <DropdownTitle classNames={classNames}>{copy.otherOrganizationsLabel}</DropdownTitle>
      <div className={cn("pb-1", classNames?.dropdownPanel)}>
        {organizations.map((org) => (
          <OrganizationMenuItem
            key={org._id}
            organization={org}
            classNames={classNames}
            onClick={() => onSelect(org._id)}
          />
        ))}
      </div>
    </>
  );
}

function PersonalAccountSection(props: {
  enabled: boolean;
  classNames?: ConvexOrgSwitcherClassNames;
  copy: Required<ConvexOrgSwitcherCopy>;
  onSelect: () => void;
}) {
  const { enabled, classNames, copy, onSelect } = props;
  if (!enabled) return null;

  return (
    <>
      <DropdownDivider classNames={classNames} />
      <div className={cn("py-1", classNames?.dropdownPanel)}>
        <button
          type="button"
          role="menuitem"
          className={cn(
            "text-foreground/80 hover:bg-foreground/5 flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
            classNames?.dropdownItem,
          )}
          onClick={onSelect}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="text-foreground/50"
          >
            <path
              d="M8 8a3 3 0 100-6 3 3 0 000 6zm0 1a5 5 0 00-5 5v1h10v-1a5 5 0 00-5-5z"
              fill="currentColor"
            />
          </svg>
          <span className={cn(classNames?.dropdownItemLabel)}>{copy.personalAccountLabel}</span>
        </button>
      </div>
    </>
  );
}

function CreateOrganizationSection(props: {
  enabled: boolean;
  classNames?: ConvexOrgSwitcherClassNames;
  copy: Required<ConvexOrgSwitcherCopy>;
  onCreate: () => void;
}) {
  const { enabled, classNames, copy, onCreate } = props;
  if (!enabled) return null;

  return (
    <>
      <DropdownDivider classNames={classNames} />
      <div className={cn("py-1", classNames?.dropdownPanel)}>
        <button
          type="button"
          role="menuitem"
          className={cn(
            "text-foreground/60 hover:bg-foreground/5 flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
            classNames?.createButton ?? classNames?.dropdownItem,
          )}
          onClick={onCreate}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="text-foreground/40"
          >
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <span className={cn(classNames?.dropdownItemLabel)}>{copy.createOrganizationLabel}</span>
        </button>
      </div>
    </>
  );
}

function SearchInput(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  classNames?: ConvexOrgSwitcherClassNames;
}) {
  return (
    <div className={cn("px-3 pb-2", props.classNames?.dropdownPanel)}>
      <input
        type="text"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        aria-label={props.placeholder}
        className={cn(
          "border-foreground/10 bg-foreground/5 text-foreground focus:border-foreground/25 h-9 w-full rounded-md border px-3 text-sm outline-none",
          props.classNames?.searchInput,
        )}
      />
    </div>
  );
}

function InPlaceCreateSection(props: {
  name: string;
  onNameChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  isLoading: boolean;
  classNames?: ConvexOrgSwitcherClassNames;
  copy: Required<ConvexOrgSwitcherCopy>;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit();
      }}
      className={cn("space-y-2 px-3 py-2", props.classNames?.inPlaceCreateForm)}
    >
      <input
        type="text"
        value={props.name}
        onChange={(event) => props.onNameChange(event.target.value)}
        placeholder={props.copy.inPlaceCreatePlaceholder}
        aria-label={props.copy.inPlaceCreatePlaceholder}
        disabled={props.isLoading}
        className={cn(
          "border-foreground/10 bg-foreground/5 text-foreground focus:border-foreground/25 h-9 w-full rounded-md border px-3 text-sm outline-none disabled:opacity-50",
          props.classNames?.inPlaceCreateInput,
        )}
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={props.isLoading || !props.name.trim()}
          className={cn(
            "bg-foreground text-background hover:bg-foreground/90 inline-flex h-9 flex-1 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            props.classNames?.inPlaceCreateButton,
          )}
        >
          {props.isLoading ? "Creating..." : props.copy.inPlaceCreateButtonLabel}
        </button>
        {props.onCancel ? (
          <button
            type="button"
            disabled={props.isLoading}
            onClick={props.onCancel}
            className={cn(
              "border-foreground/15 text-foreground/70 hover:bg-foreground/5 inline-flex h-9 flex-1 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              props.classNames?.inPlaceCreateCancel,
            )}
          >
            {props.copy.inPlaceCreateCancelLabel}
          </button>
        ) : null}
      </div>
    </form>
  );
}

function OrganizationSwitcherDropdown(props: {
  currentOrg: ConvexOrgSwitcherOrganization | null;
  otherOrgs: readonly ConvexOrgSwitcherOrganization[];
  classNames?: ConvexOrgSwitcherClassNames;
  copy: Required<ConvexOrgSwitcherCopy>;
  showPersonalAccount: boolean;
  canCreateOrganization: boolean;
  hasInPlaceCreate: boolean;
  enableSearch: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  creating: boolean;
  inPlaceCreateName: string;
  onInPlaceCreateNameChange: (value: string) => void;
  showInPlaceCreate: boolean;
  onToggleInPlaceCreate: () => void;
  onInPlaceCreateSubmit: () => void;
  onSelect: (organizationId: string) => void;
  onPersonal: () => void;
  onCreate: () => void;
}) {
  const {
    currentOrg,
    otherOrgs,
    classNames,
    copy,
    showPersonalAccount,
    canCreateOrganization,
    hasInPlaceCreate,
    enableSearch,
    searchQuery,
    onSearchChange,
    creating,
    inPlaceCreateName,
    onInPlaceCreateNameChange,
    showInPlaceCreate,
    onToggleInPlaceCreate,
    onInPlaceCreateSubmit,
    onSelect,
    onPersonal,
    onCreate,
  } = props;

  const filteredOtherOrgs = enableSearch
    ? otherOrgs.filter(
        (org) =>
          org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (org.slug ?? "").toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : otherOrgs;

  const canCreate = canCreateOrganization && !showInPlaceCreate;
  const creatingInPlace = showInPlaceCreate && hasInPlaceCreate;

  return (
    <div
      className={cn(
        "border-foreground/10 bg-background absolute top-full left-0 z-50 mt-2 w-64 rounded-lg border shadow-xl",
        classNames?.dropdown,
      )}
      role="menu"
    >
      {enableSearch ? (
        <SearchInput
          value={searchQuery}
          onChange={onSearchChange}
          placeholder={copy.searchPlaceholder}
          classNames={classNames}
        />
      ) : null}
      <CurrentOrganizationSection currentOrg={currentOrg} classNames={classNames} copy={copy} />
      <OtherOrganizationsSection
        organizations={filteredOtherOrgs}
        classNames={classNames}
        copy={copy}
        onSelect={onSelect}
      />
      <PersonalAccountSection
        enabled={showPersonalAccount}
        classNames={classNames}
        copy={copy}
        onSelect={onPersonal}
      />
      {creatingInPlace ? (
        <InPlaceCreateSection
          name={inPlaceCreateName}
          onNameChange={onInPlaceCreateNameChange}
          onSubmit={onInPlaceCreateSubmit}
          onCancel={canCreateOrganization ? onToggleInPlaceCreate : undefined}
          isLoading={creating}
          classNames={classNames}
          copy={copy}
        />
      ) : (
        <CreateOrganizationSection
          enabled={canCreate}
          classNames={classNames}
          copy={copy}
          onCreate={hasInPlaceCreate ? onToggleInPlaceCreate : onCreate}
        />
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────

export function ConvexOrganizationSwitcher(props: ConvexOrgSwitcherProps) {
  const {
    organizations,
    currentOrganizationId,
    classNames,
    copy,
    onSelectOrganization,
    onSelectPersonalAccount,
    onCreateOrganization,
    onInPlaceCreateOrganization,
    showPersonalAccount,
    enableSearch,
    currentOrganization,
    renderCustomTrigger,
  } = props;

  const resolvedCopy = resolveCopy(copy);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInPlaceCreate, setShowInPlaceCreate] = useState(false);
  const [inPlaceCreateName, setInPlaceCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        e.target instanceof Node &&
        !dropdownRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleSelect = useCallback(
    async (orgId: string) => {
      setOpen(false);
      await onSelectOrganization(orgId);
    },
    [onSelectOrganization],
  );

  const handlePersonal = useCallback(async () => {
    setOpen(false);
    await onSelectPersonalAccount?.();
  }, [onSelectPersonalAccount]);

  const handleCreate = useCallback(async () => {
    if (onInPlaceCreateOrganization) {
      setShowInPlaceCreate(true);
      return;
    }
    setOpen(false);
    await onCreateOrganization?.();
  }, [onCreateOrganization, onInPlaceCreateOrganization]);

  const handleInPlaceCreateSubmit = useCallback(async () => {
    if (!onInPlaceCreateOrganization || !inPlaceCreateName.trim()) return;
    setCreating(true);
    try {
      await onInPlaceCreateOrganization(inPlaceCreateName.trim());
      setInPlaceCreateName("");
      setShowInPlaceCreate(false);
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }, [inPlaceCreateName, onInPlaceCreateOrganization]);

  const currentOrg =
    currentOrganization ?? organizations.find((o) => o._id === currentOrganizationId) ?? null;
  const otherOrgs = organizations.filter((o) => o._id !== currentOrganizationId);

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {renderCustomTrigger ? (
        renderCustomTrigger({
          organization: currentOrg,
          onClick: () => setOpen((prev) => !prev),
        })
      ) : (
        <OrganizationSwitcherTrigger
          currentOrg={currentOrg}
          open={open}
          classNames={classNames}
          copy={resolvedCopy}
          onToggle={() => setOpen((prev) => !prev)}
        />
      )}

      {open ? (
        <OrganizationSwitcherDropdown
          currentOrg={currentOrg}
          otherOrgs={otherOrgs}
          classNames={classNames}
          copy={resolvedCopy}
          showPersonalAccount={
            showPersonalAccount === true && typeof onSelectPersonalAccount === "function"
          }
          canCreateOrganization={
            typeof onCreateOrganization === "function" ||
            typeof onInPlaceCreateOrganization === "function"
          }
          hasInPlaceCreate={typeof onInPlaceCreateOrganization === "function"}
          enableSearch={enableSearch === true}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          creating={creating}
          inPlaceCreateName={inPlaceCreateName}
          onInPlaceCreateNameChange={setInPlaceCreateName}
          showInPlaceCreate={showInPlaceCreate}
          onToggleInPlaceCreate={() => setShowInPlaceCreate((prev) => !prev)}
          onInPlaceCreateSubmit={handleInPlaceCreateSubmit}
          onSelect={handleSelect}
          onPersonal={handlePersonal}
          onCreate={handleCreate}
        />
      ) : null}
    </div>
  );
}
