/**
 * Uniwind className type surface for this library.
 *
 * These components emit Tailwind `className` strings; the consuming Expo app's
 * Uniwind runtime (Metro + the app's own Uniwind CSS entry) resolves
 * them at build time. This ambient augmentation declares the `className` (and
 * the `accent-`-prefixed color-prop) surface so the library typechecks
 * standalone, without depending on the consumer's Metro-generated uniwind
 * types. It adds only optional props — no runtime effect.
 */
import "react-native";

declare module "react-native" {
  interface ViewProps {
    className?: string;
  }
  interface TextProps {
    className?: string;
    selectionColorClassName?: string;
  }
  interface PressableProps {
    className?: string;
  }
  interface TextInputProps {
    className?: string;
    placeholderTextColorClassName?: string;
    cursorColorClassName?: string;
    selectionColorClassName?: string;
    selectionHandleColorClassName?: string;
    underlineColorAndroidClassName?: string;
  }
  interface ScrollViewProps {
    className?: string;
    contentContainerClassName?: string;
  }
  interface FlatListProps<ItemT> {
    className?: string;
    contentContainerClassName?: string;
    columnWrapperClassName?: string;
  }
  interface ImageProps {
    className?: string;
    tintColorClassName?: string;
  }
  interface ActivityIndicatorProps {
    className?: string;
    colorClassName?: string;
  }
  interface ModalProps {
    className?: string;
    backdropColorClassName?: string;
  }
  interface SwitchProps {
    thumbColorClassName?: string;
    trackColorOnClassName?: string;
    trackColorOffClassName?: string;
    ios_backgroundColorClassName?: string;
  }
  interface RefreshControlProps {
    className?: string;
    tintColorClassName?: string;
  }
  interface KeyboardAvoidingViewProps {
    className?: string;
    contentContainerClassName?: string;
  }
  interface TouchableOpacityProps {
    className?: string;
  }
}
