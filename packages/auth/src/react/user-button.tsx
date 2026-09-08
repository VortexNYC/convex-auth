import { cn } from "./lib/ui";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

// ─── Types ────────────────────────────────────────────────────────────────

export type ConvexUserButtonOrganizationItem = {
  _id: string;
  name: string;
  imageUrl?: string;
  roleKey?: string;
};

export type ConvexUserButtonUser = {
  id: string;
  email: string;
  name?: string | null;
  imageUrl?: string | null;
};

export type ConvexUserButtonClassNames = {
  trigger?: string;
  avatar?: string;
  initials?: string;
  dropdown?: string;
  dropdownPanel?: string;
  dropdownSection?: string;
  dropdownSectionTitle?: string;
  dropdownItem?: string;
  dropdownItemActive?: string;
  dropdownItemLabel?: string;
  dropdownItemMeta?: string;
  dropdownDivider?: string;
  signOutButton?: string;
};

export type ConvexUserButtonCopy = {
  manageAccountLabel?: string;
  manageOrganizationLabel?: string;
  signOutLabel?: string;
  signedInAsLabel?: string;
  switchOrganizationLabel?: string;
  createOrganizationLabel?: string;
  personalAccountLabel?: string;
};

export type ConvexUserButtonProps = {
  user: ConvexUserButtonUser | null | undefined;
  currentOrganizationId?: string | null;
  organizations?: readonly ConvexUserButtonOrganizationItem[];
  classNames?: ConvexUserButtonClassNames;
  copy?: ConvexUserButtonCopy;
  onSignOut?: () => void | Promise<void>;
  onManageAccount?: () => void | Promise<void>;
  onManageOrganization?: () => void | Promise<void>;
  onSelectOrganization?: (organizationId: string) => void | Promise<void>;
  onCreateOrganization?: () => void | Promise<void>;
  showManageOrganization?: boolean;
  renderCustomTrigger?: (args: {
    user: ConvexUserButtonUser | null | undefined;
    onClick: () => void;
  }) => ReactNode;
};

// ─── Default copy ──────────────────────────────────────────────────────────

const defaultCopy: Required<ConvexUserButtonCopy> = {
  manageAccountLabel: "Manage account",
  manageOrganizationLabel: "Manage organization",
  signOutLabel: "Sign out",
  signedInAsLabel: "Signed in as",
  switchOrganizationLabel: "Switch organization",
  createOrganizationLabel: "Create organization",
  personalAccountLabel: "Personal account",
};

function resolveCopy(copy: ConvexUserButtonCopy | undefined): Required<ConvexUserButtonCopy> {
  return { ...defaultCopy, ...copy };
}

function getInitials(name: string | null | undefined, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
    return (first + last).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

// ─── Component ────────────────────────────────────────────────────────────

export function ConvexUserButton(props: ConvexUserButtonProps) {
  const {
    user,
    currentOrganizationId,
    organizations = [],
    classNames,
    copy,
    onSignOut,
    onManageAccount,
    onManageOrganization,
    onSelectOrganization,
    onCreateOrganization,
    showManageOrganization,
    renderCustomTrigger,
  } = props;

  const resolvedCopy = resolveCopy(copy);
  const [open, setOpen] = useState(false);
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

  const handleSignOut = useCallback(async () => {
    setOpen(false);
    await onSignOut?.();
  }, [onSignOut]);

  const handleManageAccount = useCallback(async () => {
    setOpen(false);
    await onManageAccount?.();
  }, [onManageAccount]);

  const handleManageOrganization = useCallback(async () => {
    setOpen(false);
    await onManageOrganization?.();
  }, [onManageOrganization]);

  const handleSelectOrganization = useCallback(
    async (orgId: string) => {
      setOpen(false);
      await onSelectOrganization?.(orgId);
    },
    [onSelectOrganization],
  );

  const handleCreateOrganization = useCallback(async () => {
    setOpen(false);
    await onCreateOrganization?.();
  }, [onCreateOrganization]);

  if (!user) return null;

  const initials = getInitials(user.name, user.email);
  const hasOrgs = organizations.length > 0;
  const toggleOpen = () => setOpen((prev) => !prev);

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {renderCustomTrigger ? (
        renderCustomTrigger({ user, onClick: toggleOpen })
      ) : (
        <UserButtonTrigger
          classNames={classNames}
          initials={initials}
          onClick={toggleOpen}
          open={open}
          user={user}
        />
      )}

      {open ? (
        <UserButtonDropdown
          classNames={classNames}
          copy={resolvedCopy}
          currentOrganizationId={currentOrganizationId}
          hasOrgs={hasOrgs}
          onCreateOrganization={onCreateOrganization ? handleCreateOrganization : undefined}
          onManageAccount={handleManageAccount}
          onManageOrganization={
            showManageOrganization && onManageOrganization ? handleManageOrganization : undefined
          }
          onSelectOrganization={handleSelectOrganization}
          onSignOut={handleSignOut}
          organizations={organizations}
          user={user}
        />
      ) : null}
    </div>
  );
}

type ResolvedUserButtonCopy = Required<ConvexUserButtonCopy>;

function UserButtonTrigger(args: {
  classNames?: ConvexUserButtonClassNames;
  initials: string;
  onClick: () => void;
  open: boolean;
  user: ConvexUserButtonUser;
}) {
  return (
    <button
      type="button"
      onClick={args.onClick}
      className={cn(
        "border-foreground/10 bg-foreground/5 text-foreground hover:bg-foreground/10 inline-flex items-center gap-2 rounded-full border px-2 py-1.5 text-sm transition-colors",
        args.classNames?.trigger,
      )}
      aria-haspopup="menu"
      aria-expanded={args.open}
    >
      <UserButtonAvatar classNames={args.classNames} initials={args.initials} user={args.user} />
      <span className="hidden max-w-[8rem] truncate sm:inline">
        {args.user.name ?? args.user.email}
      </span>
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        className={cn("text-foreground/60 transition-transform", args.open && "rotate-180")}
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

function UserButtonAvatar(args: {
  classNames?: ConvexUserButtonClassNames;
  initials: string;
  user: ConvexUserButtonUser;
}) {
  return args.user.imageUrl ? (
    <img
      src={args.user.imageUrl}
      alt=""
      className={cn("size-7 rounded-full object-cover", args.classNames?.avatar)}
    />
  ) : (
    <span
      className={cn(
        "bg-foreground/10 inline-flex size-7 items-center justify-center rounded-full text-xs font-medium",
        args.classNames?.initials,
      )}
    >
      {args.initials}
    </span>
  );
}

function UserButtonDropdown(args: {
  classNames?: ConvexUserButtonClassNames;
  copy: ResolvedUserButtonCopy;
  currentOrganizationId?: string | null;
  hasOrgs: boolean;
  onCreateOrganization?: () => void;
  onManageAccount: () => void;
  onManageOrganization?: () => void;
  onSelectOrganization: (organizationId: string) => void;
  onSignOut: () => void;
  organizations: readonly ConvexUserButtonOrganizationItem[];
  user: ConvexUserButtonUser;
}) {
  return (
    <div
      className={cn(
        "border-foreground/10 bg-background absolute top-full right-0 z-50 mt-2 w-64 rounded-lg border shadow-xl",
        args.classNames?.dropdown,
      )}
      role="menu"
    >
      <SignedInSection classNames={args.classNames} copy={args.copy} user={args.user} />
      <DropdownDivider classNames={args.classNames} />
      <AccountActionSection {...args} />
      {args.hasOrgs ? <OrganizationSwitcherSection {...args} /> : null}
      {args.onManageOrganization ? <ManageOrganizationSection {...args} /> : null}
      <SignOutSection {...args} />
    </div>
  );
}

function SignedInSection(args: {
  classNames?: ConvexUserButtonClassNames;
  copy: ResolvedUserButtonCopy;
  user: ConvexUserButtonUser;
}) {
  return (
    <div className={cn("px-3 py-2", args.classNames?.dropdownPanel)}>
      <p className={cn("text-foreground/50 text-xs", args.classNames?.dropdownSectionTitle)}>
        {args.copy.signedInAsLabel}
      </p>
      <p className="text-foreground text-sm font-medium">{args.user.email}</p>
    </div>
  );
}

function AccountActionSection(args: {
  classNames?: ConvexUserButtonClassNames;
  copy: ResolvedUserButtonCopy;
  onManageAccount: () => void;
}) {
  return (
    <div className={cn("py-1", args.classNames?.dropdownPanel)} role="group" aria-label="Account">
      <DropdownAction
        classNames={args.classNames}
        icon="account"
        label={args.copy.manageAccountLabel}
        onClick={args.onManageAccount}
      />
    </div>
  );
}

function OrganizationSwitcherSection(args: {
  classNames?: ConvexUserButtonClassNames;
  copy: ResolvedUserButtonCopy;
  currentOrganizationId?: string | null;
  onCreateOrganization?: () => void;
  onSelectOrganization: (organizationId: string) => void;
  organizations: readonly ConvexUserButtonOrganizationItem[];
}) {
  return (
    <>
      <DropdownDivider classNames={args.classNames} />
      <div
        className={cn(
          "text-foreground/50 px-3 py-1.5 text-xs font-medium",
          args.classNames?.dropdownSectionTitle,
        )}
        role="group"
        aria-label={args.copy.switchOrganizationLabel}
      >
        {args.copy.switchOrganizationLabel}
      </div>
      <div className={cn("pb-1", args.classNames?.dropdownPanel)}>
        {args.organizations.map((organization) => (
          <OrganizationSwitcherItem
            key={organization._id}
            classNames={args.classNames}
            currentOrganizationId={args.currentOrganizationId}
            onSelectOrganization={args.onSelectOrganization}
            organization={organization}
          />
        ))}
        {args.onCreateOrganization ? (
          <DropdownAction
            classNames={args.classNames}
            icon="plus"
            label={args.copy.createOrganizationLabel}
            muted
            onClick={args.onCreateOrganization}
          />
        ) : null}
      </div>
    </>
  );
}

function OrganizationSwitcherItem(args: {
  classNames?: ConvexUserButtonClassNames;
  currentOrganizationId?: string | null;
  onSelectOrganization: (organizationId: string) => void;
  organization: ConvexUserButtonOrganizationItem;
}) {
  const active = args.organization._id === args.currentOrganizationId;
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
        active ? "bg-foreground/10 text-foreground" : "text-foreground/80 hover:bg-foreground/5",
        active ? args.classNames?.dropdownItemActive : args.classNames?.dropdownItem,
      )}
      onClick={() => args.onSelectOrganization(args.organization._id)}
    >
      <OrganizationSwitcherAvatar organization={args.organization} />
      <span className={cn("flex-1 truncate", args.classNames?.dropdownItemLabel)}>
        {args.organization.name}
      </span>
      {args.organization.roleKey ? (
        <span className={cn("text-foreground/40 text-[10px]", args.classNames?.dropdownItemMeta)}>
          {args.organization.roleKey}
        </span>
      ) : null}
    </button>
  );
}

function OrganizationSwitcherAvatar(args: { organization: ConvexUserButtonOrganizationItem }) {
  return args.organization.imageUrl ? (
    <img src={args.organization.imageUrl} alt="" className="size-5 rounded-md object-cover" />
  ) : (
    <span className="bg-foreground/10 inline-flex size-5 items-center justify-center rounded-md text-[10px] font-medium">
      {args.organization.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function ManageOrganizationSection(args: {
  classNames?: ConvexUserButtonClassNames;
  copy: ResolvedUserButtonCopy;
  onManageOrganization?: () => void;
}) {
  return (
    <>
      <DropdownDivider classNames={args.classNames} />
      <div className={cn("py-1", args.classNames?.dropdownPanel)}>
        <DropdownAction
          classNames={args.classNames}
          icon="organization"
          label={args.copy.manageOrganizationLabel}
          onClick={() => args.onManageOrganization?.()}
        />
      </div>
    </>
  );
}

function SignOutSection(args: {
  classNames?: ConvexUserButtonClassNames;
  copy: ResolvedUserButtonCopy;
  onSignOut: () => void;
}) {
  return (
    <>
      <DropdownDivider classNames={args.classNames} />
      <div className={cn("py-1", args.classNames?.dropdownPanel)}>
        <DropdownAction
          classNames={args.classNames}
          danger
          icon="signOut"
          label={args.copy.signOutLabel}
          onClick={args.onSignOut}
        />
      </div>
    </>
  );
}

function DropdownAction(args: {
  classNames?: ConvexUserButtonClassNames;
  danger?: boolean;
  icon: "account" | "organization" | "plus" | "signOut";
  label: string;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        "hover:bg-foreground/5 flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
        args.danger ? "text-destructive" : args.muted ? "text-foreground/60" : "text-foreground/80",
        args.danger ? args.classNames?.signOutButton : args.classNames?.dropdownItem,
      )}
      onClick={args.onClick}
    >
      <DropdownActionIcon danger={args.danger} icon={args.icon} muted={args.muted} />
      <span className={cn(args.classNames?.dropdownItemLabel)}>{args.label}</span>
    </button>
  );
}

function DropdownActionIcon(args: {
  danger?: boolean;
  icon: "account" | "organization" | "plus" | "signOut";
  muted?: boolean;
}) {
  const className = args.danger
    ? "text-destructive/70"
    : args.muted
      ? "text-foreground/40"
      : "text-foreground/50";
  if (args.icon === "account") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
        <path
          d="M8 8a3 3 0 100-6 3 3 0 000 6zm0 1a5 5 0 00-5 5v1h10v-1a5 5 0 00-5-5z"
          fill="currentColor"
        />
      </svg>
    );
  }
  if (args.icon === "plus") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
        <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (args.icon === "organization") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
        <path
          d="M8 1.5l1.5 3 3.5.5-2.5 2.5.6 3.5L8 9.5l-3.5 2 .6-3.5L2.5 5 6 4.5z"
          fill="currentColor"
        />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M11 11l3-3-3-3M14 8H6"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function DropdownDivider(args: { classNames?: ConvexUserButtonClassNames }) {
  return <div className={cn("border-foreground/10 border-t", args.classNames?.dropdownDivider)} />;
}
