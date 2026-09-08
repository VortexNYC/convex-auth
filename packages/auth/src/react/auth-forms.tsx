import { cn } from "./lib/ui";
import { useId, useState, type ReactNode } from "react";

import {
  AuthAlert,
  AuthButton,
  AuthCard,
  AuthCardContent,
  AuthCardHeader,
  AuthDivider,
  AuthField,
  AuthInput,
  AuthLabel,
  AuthProviderButton,
} from "./ui";

export type AuthProviderOption = {
  id: string;
  label: string;
  disabled?: boolean;
};

export type AuthProviderButtonsProps = {
  providers: readonly AuthProviderOption[];
  onSelect: (providerId: string) => void | Promise<void>;
  isSubmitting?: boolean;
  className?: string;
  providerButtonClassName?: string;
};

export type AuthSignInFormValues = {
  email: string;
  password: string;
};

export type AuthSignUpFormValues = {
  name: string;
  email: string;
  password: string;
};

export type AuthFormClassNames = {
  card?: string;
  header?: string;
  title?: string;
  description?: string;
  content?: string;
  field?: string;
  label?: string;
  input?: string;
  primaryButton?: string;
  secondaryButton?: string;
  alert?: string;
  divider?: string;
  providers?: string;
  providerButton?: string;
  footer?: string;
  link?: string;
};

export type AuthFormSharedProps = {
  title?: string;
  description?: string;
  error?: string | null;
  success?: string | null;
  footer?: ReactNode;
  providers?: readonly AuthProviderOption[];
  onProviderSelect?: (providerId: string) => void | Promise<void>;
  submitLabel?: string;
  submittingLabel?: string;
  isSubmitting?: boolean;
  className?: string;
  classNames?: AuthFormClassNames;
};

export type AuthSignInFormProps = AuthFormSharedProps & {
  defaultValues?: Partial<AuthSignInFormValues>;
  onSubmit: (values: AuthSignInFormValues) => void | Promise<void>;
  forgotPasswordHref?: string;
};

export type AuthSignUpFormProps = AuthFormSharedProps & {
  defaultValues?: Partial<AuthSignUpFormValues>;
  onSubmit: (values: AuthSignUpFormValues) => void | Promise<void>;
  termsNotice?: ReactNode;
};

export function AuthProviderButtons(props: AuthProviderButtonsProps) {
  return (
    <div className={cn("space-y-2", props.className)}>
      {props.providers.map((provider) => (
        <AuthProviderButton
          key={provider.id}
          className={props.providerButtonClassName}
          disabled={props.isSubmitting || provider.disabled}
          onClick={() => {
            void props.onSelect(provider.id);
          }}
          providerLabel={provider.label}
          type="button"
        />
      ))}
    </div>
  );
}

function shouldShowAuthProviders(props: AuthFormSharedProps): props is AuthFormSharedProps & {
  onProviderSelect: NonNullable<AuthFormSharedProps["onProviderSelect"]>;
  providers: readonly AuthProviderOption[];
} {
  return (
    props.providers !== undefined &&
    props.providers.length > 0 &&
    props.onProviderSelect !== undefined
  );
}

function AuthFormAlerts(
  props: Pick<AuthFormSharedProps, "error" | "success"> & {
    classNames?: AuthFormClassNames;
  },
) {
  return (
    <>
      {props.error ? (
        <AuthAlert className={props.classNames?.alert} tone="error">
          {props.error}
        </AuthAlert>
      ) : null}
      {props.success ? (
        <AuthAlert className={props.classNames?.alert} tone="success">
          {props.success}
        </AuthAlert>
      ) : null}
    </>
  );
}

function AuthFormProviders(props: AuthFormSharedProps & { classNames?: AuthFormClassNames }) {
  if (!shouldShowAuthProviders(props)) {
    return null;
  }

  return (
    <>
      <AuthProviderButtons
        providers={props.providers}
        onSelect={props.onProviderSelect}
        isSubmitting={props.isSubmitting}
        className={props.classNames?.providers}
        providerButtonClassName={props.classNames?.providerButton}
      />
      <AuthDivider className={props.classNames?.divider} label="or" />
    </>
  );
}

function AuthFormFooter(props: { classNames?: AuthFormClassNames; footer?: ReactNode }) {
  if (!props.footer) {
    return null;
  }

  return (
    <div className={cn("text-muted-foreground pt-1 text-center text-sm", props.classNames?.footer)}>
      {props.footer}
    </div>
  );
}

function AuthTextField(props: {
  autoComplete: string;
  classNames?: AuthFormClassNames;
  id: string;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  type: string;
  value: string;
}) {
  return (
    <AuthField className={props.classNames?.field}>
      <AuthLabel className={props.classNames?.label} htmlFor={props.id}>
        {props.label}
      </AuthLabel>
      <AuthInput
        autoComplete={props.autoComplete}
        className={props.classNames?.input}
        id={props.id}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        placeholder={props.placeholder}
        type={props.type}
        value={props.value}
      />
    </AuthField>
  );
}

function resolveAuthButtonLabel(
  props: AuthFormSharedProps,
  defaults: {
    submitLabel: string;
    submittingLabel: string;
  },
): string {
  if (props.isSubmitting) {
    return props.submittingLabel ?? defaults.submittingLabel;
  }
  return props.submitLabel ?? defaults.submitLabel;
}

function signInHeaderCopy(props: AuthSignInFormProps) {
  return {
    title: props.title ?? "Sign in",
    description: props.description ?? "Access your account and continue where you left off.",
  };
}

function signUpHeaderCopy(props: AuthSignUpFormProps) {
  return {
    title: props.title ?? "Create account",
    description: props.description ?? "Create your account and continue into setup.",
  };
}

function SignInPasswordField(props: {
  classNames?: AuthFormClassNames;
  forgotPasswordHref?: string;
  password: string;
  passwordId: string;
  setPassword: (value: string) => void;
}) {
  return (
    <AuthField className={props.classNames?.field}>
      <div className="flex items-center justify-between gap-3">
        <AuthLabel className={props.classNames?.label} htmlFor={props.passwordId}>
          Password
        </AuthLabel>
        {props.forgotPasswordHref ? (
          <a
            className={cn(
              "text-muted-foreground hover:text-foreground text-xs",
              props.classNames?.link,
            )}
            href={props.forgotPasswordHref}
          >
            Forgot password?
          </a>
        ) : null}
      </div>
      <AuthInput
        autoComplete="current-password"
        className={props.classNames?.input}
        id={props.passwordId}
        onChange={(event) => props.setPassword(event.currentTarget.value)}
        placeholder="••••••••"
        type="password"
        value={props.password}
      />
    </AuthField>
  );
}

export function AuthSignInForm(props: AuthSignInFormProps) {
  const [email, setEmail] = useState(props.defaultValues?.email ?? "");
  const [password, setPassword] = useState(props.defaultValues?.password ?? "");
  const emailId = useId();
  const passwordId = useId();
  const classNames = props.classNames;
  const headerCopy = signInHeaderCopy(props);

  return (
    <AuthCard className={cn(props.className, classNames?.card)}>
      <AuthCardHeader
        title={headerCopy.title}
        description={headerCopy.description}
        classNames={{
          header: classNames?.header,
          title: classNames?.title,
          description: classNames?.description,
        }}
      />
      <AuthCardContent className={classNames?.content}>
        <AuthFormAlerts classNames={classNames} error={props.error} success={props.success} />
        <AuthFormProviders {...props} classNames={classNames} />
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void props.onSubmit({ email: email.trim(), password });
          }}
        >
          <AuthTextField
            autoComplete="email"
            classNames={classNames}
            id={emailId}
            label="Email"
            onChange={setEmail}
            placeholder="you@company.com"
            type="email"
            value={email}
          />
          <SignInPasswordField
            classNames={classNames}
            forgotPasswordHref={props.forgotPasswordHref}
            password={password}
            passwordId={passwordId}
            setPassword={setPassword}
          />
          <AuthButton
            className={classNames?.primaryButton}
            disabled={props.isSubmitting}
            type="submit"
          >
            {resolveAuthButtonLabel(props, {
              submitLabel: "Sign in",
              submittingLabel: "Signing in...",
            })}
          </AuthButton>
        </form>
        <AuthFormFooter classNames={classNames} footer={props.footer} />
      </AuthCardContent>
    </AuthCard>
  );
}

export function AuthSignUpForm(props: AuthSignUpFormProps) {
  const [name, setName] = useState(props.defaultValues?.name ?? "");
  const [email, setEmail] = useState(props.defaultValues?.email ?? "");
  const [password, setPassword] = useState(props.defaultValues?.password ?? "");
  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const classNames = props.classNames;
  const headerCopy = signUpHeaderCopy(props);

  return (
    <AuthCard className={cn(props.className, classNames?.card)}>
      <AuthCardHeader
        title={headerCopy.title}
        description={headerCopy.description}
        classNames={{
          header: classNames?.header,
          title: classNames?.title,
          description: classNames?.description,
        }}
      />
      <AuthCardContent className={classNames?.content}>
        <AuthFormAlerts classNames={classNames} error={props.error} success={props.success} />
        <AuthFormProviders {...props} classNames={classNames} />
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void props.onSubmit({
              name: name.trim(),
              email: email.trim(),
              password,
            });
          }}
        >
          <AuthTextField
            autoComplete="name"
            classNames={classNames}
            id={nameId}
            label="Name"
            onChange={setName}
            placeholder="Jane Doe"
            type="text"
            value={name}
          />
          <AuthTextField
            autoComplete="email"
            classNames={classNames}
            id={emailId}
            label="Email"
            onChange={setEmail}
            placeholder="you@company.com"
            type="email"
            value={email}
          />
          <AuthTextField
            autoComplete="new-password"
            classNames={classNames}
            id={passwordId}
            label="Password"
            onChange={setPassword}
            placeholder="Create a strong password"
            type="password"
            value={password}
          />
          {props.termsNotice ? (
            <div className="text-muted-foreground text-xs">{props.termsNotice}</div>
          ) : null}
          <AuthButton
            className={classNames?.primaryButton}
            disabled={props.isSubmitting}
            type="submit"
          >
            {resolveAuthButtonLabel(props, {
              submitLabel: "Create account",
              submittingLabel: "Creating account...",
            })}
          </AuthButton>
        </form>
        <AuthFormFooter classNames={classNames} footer={props.footer} />
      </AuthCardContent>
    </AuthCard>
  );
}
