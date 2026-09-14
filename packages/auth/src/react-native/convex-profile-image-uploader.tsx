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
  View,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

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

  return (
    <View className="w-full py-2" style={s.root}>
      <View className="px-4 pb-3" style={s.header}>
        <Text className="text-base font-semibold" style={s.title}>
          {copy.title}
        </Text>
        <Text className="text-sm text-muted-foreground mt-0.5" style={s.description}>
          {copy.description}
        </Text>
      </View>
      <View className="items-center px-4">
        {currentImage !== null ? (
          <Image
            source={{ uri: currentImage }}
            className="w-24 h-24 rounded-full"
            style={s.preview}
          />
        ) : (
          <Text className="text-sm text-muted-foreground py-3" style={s.noPreview}>
            {copy.noImage}
          </Text>
        )}
        <Pressable
          onPress={() => void handlePick()}
          disabled={isUploading}
          className="mt-3 px-4 py-2.5 rounded-md border border-input"
          style={s.pickButton}
        >
          <Text className="text-sm font-medium" style={s.pickButtonText}>
            {isUploading ? copy.uploading : copy.pick}
          </Text>
        </Pressable>
        {success !== null ? (
          <Text className="text-success pt-2 text-sm" style={s.successState}>
            {success}
          </Text>
        ) : null}
        {error !== null ? (
          <Text className="text-destructive pt-2 text-sm" style={s.errorState}>
            {error}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
