/**
 * ConvexProfileEditForm — drop-in profile editor for consumers.
 *
 * Replaces the per-consumer provider-style name + image form that pile
 * had to hand-write against `user.update({firstName, lastName})` +
 * `user.reload()`. Uses the package's useConvexAuthUpdateProfile
 * hook so the component is purely presentational.
 *
 * Consumer usage:
 *   <ConvexProfileEditForm
 *     authClient={authClient}
 *     initialName={user?.name ?? ''}
 *     onUpdated={() => router.invalidate()}
 *   />
 *
 * Editing the email/password is a separate auth-flow concern handled
 * by Better-Auth's own surfaces (verify-email, forgot-password); this
 * component only handles the no-auth-flow profile fields (name + image).
 */
import { useState, type ChangeEvent, type FormEvent } from "react";

import { useConvexAuthUpdateProfile } from "./auth-client-hooks";
import type { ConvexBetterAuthClient } from "./auth-client-types";
import { useConvexAuthClientContext } from "./convex-auth-client-provider";
import { AuthCard, AuthCardContent, AuthCardHeader, AuthField, AuthInput, AuthLabel } from "./ui";

export type ConvexProfileEditFormClassNames = {
  root?: string;
  form?: string;
  field?: string;
  label?: string;
  input?: string;
  submitButton?: string;
  successState?: string;
  errorState?: string;
};

export type ConvexProfileEditFormCopy = {
  title?: string;
  description?: string;
  nameLabel?: string;
  imageLabel?: string;
  submit?: string;
  submitting?: string;
  successMessage?: string;
  unavailable?: string;
};

export type ConvexProfileEditFormProps = {
  authClient?: ConvexBetterAuthClient | null;
  initialName?: string;
  initialImage?: string;
  /**
   * Whether to show the image URL field. Defaults to true. Set to
   * false for consumers that don't surface avatar editing.
   */
  showImageField?: boolean;
  classNames?: ConvexProfileEditFormClassNames;
  copy?: ConvexProfileEditFormCopy;
  onUpdated?: (next: { name?: string; image?: string }) => void;
};

const DEFAULT_COPY: Required<ConvexProfileEditFormCopy> = {
  title: "Profile",
  description: "Update your display name and avatar.",
  nameLabel: "Display name",
  imageLabel: "Avatar URL",
  submit: "Save profile",
  submitting: "Saving…",
  successMessage: "Profile updated.",
  unavailable: "Profile update is not available on this auth client.",
};

export function ConvexProfileEditForm(props: ConvexProfileEditFormProps) {
  const contextClient = useConvexAuthClientContext();
  const authClient = props.authClient ?? contextClient;
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const cn = props.classNames ?? {};

  const { updateProfile, isUpdating } = useConvexAuthUpdateProfile(authClient);
  const [name, setName] = useState(props.initialName ?? "");
  const [image, setImage] = useState(props.initialImage ?? "");
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showImageField = props.showImageField ?? true;
  const isAvailable = authClient?.updateUser !== undefined;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(null);
    setError(null);
    const trimmedName = name.trim();
    const trimmedImage = image.trim();
    const args: { name?: string; image?: string } = {};
    if (trimmedName !== (props.initialName ?? "").trim()) args.name = trimmedName;
    if (showImageField && trimmedImage !== (props.initialImage ?? "").trim()) {
      args.image = trimmedImage;
    }
    if (Object.keys(args).length === 0) {
      // Nothing changed — no-op success.
      setSuccess(copy.successMessage);
      return;
    }
    const result = await updateProfile(args);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(copy.successMessage);
    props.onUpdated?.(args);
  }

  return (
    <AuthCard className={cn.root}>
      <AuthCardHeader title={copy.title} description={copy.description} />
      <AuthCardContent>
        {isAvailable ? (
          <form onSubmit={handleSubmit} className={cn.form}>
            <AuthField className={cn.field}>
              <AuthLabel htmlFor="convex-profile-name" className={cn.label}>
                {copy.nameLabel}
              </AuthLabel>
              <AuthInput
                id="convex-profile-name"
                value={name}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                className={cn.input}
              />
            </AuthField>
            {showImageField ? (
              <AuthField className={cn.field}>
                <AuthLabel htmlFor="convex-profile-image" className={cn.label}>
                  {copy.imageLabel}
                </AuthLabel>
                <AuthInput
                  id="convex-profile-image"
                  type="url"
                  value={image}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setImage(e.target.value)}
                  className={cn.input}
                />
              </AuthField>
            ) : null}
            <button type="submit" disabled={isUpdating} className={cn.submitButton}>
              {isUpdating ? copy.submitting : copy.submit}
            </button>
            {success !== null ? (
              <div className={cn.successState} role="status">
                {success}
              </div>
            ) : null}
            {error !== null ? (
              <div className={cn.errorState} role="alert">
                {error}
              </div>
            ) : null}
          </form>
        ) : (
          <div className={cn.errorState}>{copy.unavailable}</div>
        )}
      </AuthCardContent>
    </AuthCard>
  );
}
