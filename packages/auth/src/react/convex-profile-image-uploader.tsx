/**
 * ConvexProfileImageUploader — drop-in profile avatar uploader.
 *
 * Consumer usage:
 *   <ConvexProfileImageUploader
 *     authClient={authClient}
 *     uploadFile={async (file) => {
 *       // Convex example — generate URL, POST, return public URL:
 *       const uploadUrl = await convex.action(api.users.profileImageUploadUrl);
 *       const res = await fetch(uploadUrl, { method: 'POST', body: file });
 *       const { storageId } = await res.json();
 *       return await convex.action(api.users.profileImageUrl, { storageId });
 *     }}
 *     initialImage={user?.image ?? null}
 *     onUploaded={(url) => router.invalidate()}
 *   />
 *
 * The package owns the pick → upload → save flow; the consumer
 * provides `uploadFile` so storage stays decoupled from auth.
 */
import { useRef, useState, type ChangeEvent } from "react";

import { useConvexAuthUploadProfileImage } from "./auth-client-hooks";
import type { ConvexBetterAuthClient } from "./auth-client-types";
import { useConvexAuthClientContext } from "./convex-auth-client-provider";
import { AuthCard, AuthCardContent, AuthCardHeader } from "./ui";

export type ConvexProfileImageUploaderClassNames = {
  root?: string;
  preview?: string;
  noPreview?: string;
  pickButton?: string;
  successState?: string;
  errorState?: string;
};

export type ConvexProfileImageUploaderCopy = {
  title?: string;
  description?: string;
  pick?: string;
  uploading?: string;
  noImage?: string;
  successMessage?: string;
  unavailable?: string;
};

export type ConvexProfileImageUploaderProps = {
  authClient?: ConvexBetterAuthClient | null;
  /**
   * Consumer-provided upload strategy. Receives the picked file (a
   * browser `File`/`Blob` on web, a `Blob` or a base64/URI string on
   * React Native) and MUST return the canonical URL of the uploaded
   * image (the URL that will be stored on the user). The package
   * never sees the storage backend.
   */
  uploadFile: (file: Blob | string) => Promise<string>;
  initialImage?: string | null;
  /** File-input `accept` attribute (defaults to image/*). */
  accept?: string;
  classNames?: ConvexProfileImageUploaderClassNames;
  copy?: ConvexProfileImageUploaderCopy;
  onUploaded?: (url: string) => void;
};

const DEFAULT_COPY: Required<ConvexProfileImageUploaderCopy> = {
  title: "Profile picture",
  description: "Pick an image to use as your avatar.",
  pick: "Choose image…",
  uploading: "Uploading…",
  noImage: "No image set.",
  successMessage: "Profile picture updated.",
  unavailable: "Image upload is not available on this auth client.",
};

export function ConvexProfileImageUploader(props: ConvexProfileImageUploaderProps) {
  const contextClient = useConvexAuthClientContext();
  const authClient = props.authClient ?? contextClient;
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const cn = props.classNames ?? {};

  const { uploadAndSave, isUploading } = useConvexAuthUploadProfileImage(authClient, {
    uploadFile: props.uploadFile,
  });
  const [currentImage, setCurrentImage] = useState(props.initialImage ?? null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isAvailable = authClient?.updateUser !== undefined;

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    setSuccess(null);
    setError(null);
    const file = event.target.files?.[0];
    if (file === undefined) return;
    const result = await uploadAndSave(file);
    // Always clear the input value so the same file can be re-picked
    // after a failed upload.
    if (fileInputRef.current !== null) fileInputRef.current.value = "";
    if (!result.ok || result.url === null) {
      setError(result.error);
      return;
    }
    setCurrentImage(result.url);
    setSuccess(copy.successMessage);
    props.onUploaded?.(result.url);
  }

  return (
    <AuthCard className={cn.root}>
      <AuthCardHeader title={copy.title} description={copy.description} />
      <AuthCardContent>
        {isAvailable ? (
          <div>
            {currentImage !== null ? (
              <img
                src={currentImage}
                alt=""
                className={cn.preview}
                style={{ maxWidth: 96, maxHeight: 96, borderRadius: "50%" }}
              />
            ) : (
              <div className={cn.noPreview}>{copy.noImage}</div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={props.accept ?? "image/*"}
              onChange={(e) => void handleFile(e)}
              disabled={isUploading}
              className={cn.pickButton}
              aria-label={copy.pick}
            />
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
            {isUploading ? (
              <div className={cn.successState} role="status">
                {copy.uploading}
              </div>
            ) : null}
          </div>
        ) : (
          <div className={cn.errorState}>{copy.unavailable}</div>
        )}
      </AuthCardContent>
    </AuthCard>
  );
}
