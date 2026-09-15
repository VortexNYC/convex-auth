/**
 * ConvexProfileImageUploader (RN) — drop-in profile avatar uploader.
 *
 * Consumer usage:
 *   <ConvexProfileImageUploader
 *     authClient={convexAuth.authClient}
 *     pickImage={async () => {
 *       const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
 *       return r.canceled ? null : r.assets[0]?.uri ?? null;
 *     }}
 *     uploadFile={async (uri) => {
 *       const url = await convex.action(api.users.profileImageUploadUrl);
 *       const blob = typeof uri === 'string' ? await (await fetch(uri)).blob() : uri;
 *       const res = await fetch(url, { method: 'POST', body: blob });
 *       const { storageId } = await res.json();
 *       return await convex.action(api.users.profileImageUrl, { storageId });
 *     }}
 *     initialImage={user?.image ?? null}
 *   />
 *
 * The package owns the orchestration; the consumer brings their
 * own ImagePicker (expo-image-picker / react-native-image-picker)
 * and storage strategy.
 */
import { useState } from "react";
import {
  Image,
  Pressable,
  Text,
  useColorScheme,
  View,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { clsx } from "clsx";

import {
  useConvexAuthUploadProfileImage,
  useConvexAuthClientContext,
  type ConvexBetterAuthClient,
} from "../react/client";

export type ExpoProfileImageUploaderStyles = {
  root?: StyleProp<ViewStyle>;
  header?: StyleProp<ViewStyle>;
  title?: StyleProp<TextStyle>;
  description?: StyleProp<TextStyle>;
  preview?: StyleProp<ImageStyle>;
  noPreview?: StyleProp<TextStyle>;
  pickButton?: StyleProp<ViewStyle>;
  pickButtonText?: StyleProp<TextStyle>;
  successState?: StyleProp<TextStyle>;
  errorState?: StyleProp<TextStyle>;
};

export type ExpoProfileImageUploaderClassNames = {
  root?: string;
  header?: string;
  title?: string;
  description?: string;
  preview?: string;
  noPreview?: string;
  pickButton?: string;
  pickButtonText?: string;
  successState?: string;
  errorState?: string;
};

export type ExpoProfileImageUploaderCopy = {
  title?: string;
  description?: string;
  pick?: string;
  uploading?: string;
  noImage?: string;
  successMessage?: string;
  unavailable?: string;
};

export type ExpoProfileImageUploaderProps = {
  authClient?: ConvexBetterAuthClient | null;
  /** Consumer-provided picker. Returns a local file URI or null if cancelled. */
  pickImage: () => Promise<string | Blob | null>;
  /** Consumer-provided uploader. Returns the canonical public URL. */
  uploadFile: (file: Blob | string) => Promise<string>;
  initialImage?: string | null;
  styles?: ExpoProfileImageUploaderStyles;
  classNames?: ExpoProfileImageUploaderClassNames;
  copy?: ExpoProfileImageUploaderCopy;
  onUploaded?: (url: string) => void;
};

const DEFAULT_COPY: Required<ExpoProfileImageUploaderCopy> = {
  title: "Profile picture",
  description: "Pick an image to use as your avatar.",
  pick: "Choose image…",
  uploading: "Uploading…",
  noImage: "No image set.",
  successMessage: "Profile picture updated.",
  unavailable: "Image upload is not available on this auth client.",
};

export function ConvexProfileImageUploader(props: ExpoProfileImageUploaderProps) {
  const contextClient = useConvexAuthClientContext();
  const authClient = props.authClient ?? contextClient ?? null;
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const s = props.styles ?? {};
  const c = props.classNames ?? {};
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { uploadAndSave, isUploading } = useConvexAuthUploadProfileImage(authClient, {
    uploadFile: props.uploadFile,
  });
  const [currentImage, setCurrentImage] = useState(props.initialImage ?? null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePick() {
    setSuccess(null);
    setError(null);
    try {
      const picked = await props.pickImage();
      if (picked === null) return;
      const result = await uploadAndSave(picked);
      if (!result.ok || result.url === null) {
        setError(result.error);
        return;
      }
      setCurrentImage(result.url);
      setSuccess(copy.successMessage);
      props.onUploaded?.(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not pick image");
    }
  }

  const rootClassName = clsx(
    "w-full max-w-md self-center p-4 bg-background",
    c.root,
    isDark && "dark",
  );

  return (
    <View className={rootClassName} style={s.root}>
      <View className={clsx("pb-3", c.header)} style={s.header}>
        <Text className={clsx("text-2xl font-bold text-foreground", c.title)} style={s.title}>
          {copy.title}
        </Text>
        <Text
          className={clsx("text-sm text-muted-foreground", c.description)}
          style={s.description}
        >
          {copy.description}
        </Text>
      </View>
      <View className="items-center w-full">
        {currentImage !== null ? (
          <Image
            source={{ uri: currentImage }}
            className={clsx("w-24 h-24 rounded-full", c.preview)}
            style={s.preview}
            accessibilityLabel="Profile picture"
          />
        ) : (
          <Text
            className={clsx("text-sm text-muted-foreground py-3", c.noPreview)}
            style={s.noPreview}
          >
            {copy.noImage}
          </Text>
        )}
        <Pressable
          onPress={() => void handlePick()}
          disabled={isUploading}
          className={clsx(
            "mt-3 px-4 py-2.5 rounded-md border border-border bg-card items-center",
            c.pickButton,
          )}
          style={s.pickButton}
          accessibilityRole="button"
          accessibilityLabel={isUploading ? copy.uploading : copy.pick}
        >
          <Text
            className={clsx("text-sm font-medium text-card-foreground", c.pickButtonText)}
            style={s.pickButtonText}
          >
            {isUploading ? copy.uploading : copy.pick}
          </Text>
        </Pressable>
        {success !== null ? (
          <Text
            className={clsx("text-sm text-success mt-2", c.successState)}
            style={s.successState}
          >
            {success}
          </Text>
        ) : null}
        {error !== null ? (
          <Text
            className={clsx("text-sm text-destructive mt-2", c.errorState)}
            style={s.errorState}
          >
            {error}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
