/**
 * ConvexOrganizationSwitcher (RN) — props-driven org switcher
 * mirroring the web component. Renders the current org as a button;
 * tapping it opens a Modal listing the other orgs + (optional)
 * personal account + (optional) create-org action.
 *
 * Consumer brings the org list + callbacks. The package owns the
 * UI shape so all B2B mobile apps render the switcher the same way.
 */
import { useState, type ReactNode } from "react";
import {
  Image,
  Modal,
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

export type ConvexOrgSwitcherOrganization = {
  _id: string;
  name: string;
  slug?: string;
  imageUrl?: string;
};

export type ExpoOrgSwitcherStyles = {
  trigger?: StyleProp<ViewStyle>;
  triggerName?: StyleProp<TextStyle>;
  triggerImage?: StyleProp<ImageStyle>;
  triggerPlaceholder?: StyleProp<ViewStyle>;
  modal?: StyleProp<ViewStyle>;
  panel?: StyleProp<ViewStyle>;
  sectionTitle?: StyleProp<TextStyle>;
  item?: StyleProp<ViewStyle>;
  itemActive?: StyleProp<ViewStyle>;
  itemLabel?: StyleProp<TextStyle>;
  itemMeta?: StyleProp<TextStyle>;
  divider?: StyleProp<ViewStyle>;
  createButton?: StyleProp<ViewStyle>;
  createButtonText?: StyleProp<TextStyle>;
};

export type ExpoOrgSwitcherClassNames = {
  trigger?: string;
  triggerName?: string;
  triggerImage?: string;
  triggerPlaceholder?: string;
  modal?: string;
  panel?: string;
  sectionTitle?: string;
  item?: string;
  itemActive?: string;
  itemLabel?: string;
  itemMeta?: string;
  divider?: string;
  createButton?: string;
  createButtonText?: string;
};

export type ExpoOrgSwitcherCopy = {
  currentOrganizationLabel?: string;
  otherOrganizationsLabel?: string;
  createOrganizationLabel?: string;
  personalAccountLabel?: string;
  noOrganizationsLabel?: string;
};

export type ExpoOrgSwitcherProps = {
  organizations: readonly ConvexOrgSwitcherOrganization[];
  currentOrganizationId?: string | null;
  currentOrganization?: ConvexOrgSwitcherOrganization | null;
  showPersonalAccount?: boolean;
  styles?: ExpoOrgSwitcherStyles;
  classNames?: ExpoOrgSwitcherClassNames;
  copy?: ExpoOrgSwitcherCopy;
  onSelectOrganization: (organizationId: string) => void | Promise<void>;
  onSelectPersonalAccount?: () => void | Promise<void>;
  onCreateOrganization?: () => void | Promise<void>;
  renderCustomTrigger?: (args: {
    organization: ConvexOrgSwitcherOrganization | null;
    onPress: () => void;
  }) => ReactNode;
};

const DEFAULT_COPY: Required<ExpoOrgSwitcherCopy> = {
  currentOrganizationLabel: "Current",
  otherOrganizationsLabel: "Switch to",
  createOrganizationLabel: "Create workspace",
  personalAccountLabel: "Personal account",
  noOrganizationsLabel: "No other workspaces.",
};

function OrganizationSwitcherTrigger(props: {
  copy: Required<ExpoOrgSwitcherCopy>;
  current: ConvexOrgSwitcherOrganization | null;
  onPress: () => void;
  renderCustomTrigger?: ExpoOrgSwitcherProps["renderCustomTrigger"];
  styles: ExpoOrgSwitcherStyles;
  classNames: ExpoOrgSwitcherClassNames;
}) {
  const s = props.styles;
  const c = props.classNames;
  const custom = props.renderCustomTrigger?.({
    organization: props.current,
    onPress: props.onPress,
  });
  if (custom !== undefined) {
    return custom;
  }

  return (
    <Pressable
      onPress={props.onPress}
      className={clsx(
        "flex-row items-center px-3 py-2 rounded-md border border-border gap-2",
        c.trigger,
      )}
      style={s.trigger}
      accessibilityRole="button"
      accessibilityLabel={props.current?.name ?? props.copy.personalAccountLabel}
    >
      {props.current?.imageUrl !== undefined && props.current.imageUrl.length > 0 ? (
        <Image
          source={{ uri: props.current.imageUrl }}
          className={clsx("w-6 h-6 rounded-full", c.triggerImage)}
          style={s.triggerImage}
        />
      ) : (
        <View
          className={clsx(
            "w-6 h-6 rounded-full border border-input bg-muted opacity-40",
            c.triggerPlaceholder,
          )}
          style={s.triggerPlaceholder}
        />
      )}
      <Text
        className={clsx("text-sm font-medium text-foreground", c.triggerName)}
        style={s.triggerName}
      >
        {props.current?.name ?? props.copy.personalAccountLabel}
      </Text>
    </Pressable>
  );
}

function CurrentOrganizationSection(props: {
  copy: Required<ExpoOrgSwitcherCopy>;
  current: ConvexOrgSwitcherOrganization | null;
  styles: ExpoOrgSwitcherStyles;
  classNames: ExpoOrgSwitcherClassNames;
}) {
  const s = props.styles;
  const c = props.classNames;
  if (props.current === null) {
    return null;
  }

  return (
    <View>
      <Text
        className={clsx("text-xs text-muted-foreground mt-3 mb-2 font-medium", c.sectionTitle)}
        style={s.sectionTitle}
      >
        {props.copy.currentOrganizationLabel}
      </Text>
      <View
        className={clsx("py-3 px-2 rounded-md opacity-60 bg-muted/50", c.item, c.itemActive)}
        style={[s.item, s.itemActive]}
      >
        <Text
          className={clsx("text-base font-medium text-foreground", c.itemLabel)}
          style={s.itemLabel}
        >
          {props.current.name}
        </Text>
        {props.current.slug !== undefined ? (
          <Text
            className={clsx("text-xs text-muted-foreground mt-0.5", c.itemMeta)}
            style={s.itemMeta}
          >
            {props.current.slug}
          </Text>
        ) : null}
      </View>
      <View className={clsx("bg-border h-px my-2", c.divider)} style={s.divider} />
    </View>
  );
}

export function ConvexOrganizationSwitcher(props: ExpoOrgSwitcherProps) {
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const s = props.styles ?? {};
  const c = props.classNames ?? {};
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const [open, setOpen] = useState(false);

  const current =
    props.currentOrganization ??
    props.organizations.find((org) => org._id === props.currentOrganizationId) ??
    null;
  const others = props.organizations.filter((org) => org._id !== current?._id);

  async function pickOrg(id: string) {
    setOpen(false);
    await props.onSelectOrganization(id);
  }
  async function pickPersonal() {
    setOpen(false);
    await props.onSelectPersonalAccount?.();
  }
  async function pickCreate() {
    setOpen(false);
    await props.onCreateOrganization?.();
  }

  return (
    <View>
      <OrganizationSwitcherTrigger
        copy={copy}
        current={current}
        onPress={() => setOpen(true)}
        renderCustomTrigger={props.renderCustomTrigger}
        styles={s}
        classNames={c}
      />
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={[
            { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
            s.modal,
          ]}
          className={clsx(c.modal)}
        >
          <Pressable
            onPress={() => {}}
            className={clsx("bg-card px-4 py-5 rounded-t-xl", c.panel, isDark && "dark")}
            style={s.panel}
          >
            <CurrentOrganizationSection copy={copy} current={current} styles={s} classNames={c} />
            <Text
              className={clsx(
                "text-xs text-muted-foreground mt-3 mb-2 font-medium",
                c.sectionTitle,
              )}
              style={s.sectionTitle}
            >
              {copy.otherOrganizationsLabel}
            </Text>
            {others.length === 0 ? (
              <Text
                className={clsx("text-xs text-muted-foreground mt-0.5", c.itemMeta)}
                style={s.itemMeta}
              >
                {copy.noOrganizationsLabel}
              </Text>
            ) : (
              others.map((org) => (
                <Pressable
                  key={org._id}
                  onPress={() => void pickOrg(org._id)}
                  className={clsx("py-3 px-2 rounded-md", c.item)}
                  style={s.item}
                  accessibilityRole="button"
                  accessibilityLabel={org.name}
                >
                  <Text
                    className={clsx("text-base font-medium text-foreground", c.itemLabel)}
                    style={s.itemLabel}
                  >
                    {org.name}
                  </Text>
                  {org.slug !== undefined ? (
                    <Text
                      className={clsx("text-xs text-muted-foreground mt-0.5", c.itemMeta)}
                      style={s.itemMeta}
                    >
                      {org.slug}
                    </Text>
                  ) : null}
                </Pressable>
              ))
            )}
            {props.showPersonalAccount === true && props.onSelectPersonalAccount !== undefined ? (
              <View>
                <View className={clsx("bg-border h-px my-2", c.divider)} style={s.divider} />
                <Pressable
                  onPress={() => void pickPersonal()}
                  className={clsx("py-3 px-2 rounded-md", c.item)}
                  style={s.item}
                  accessibilityRole="button"
                  accessibilityLabel={copy.personalAccountLabel}
                >
                  <Text
                    className={clsx("text-base font-medium text-foreground", c.itemLabel)}
                    style={s.itemLabel}
                  >
                    {copy.personalAccountLabel}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {props.onCreateOrganization !== undefined ? (
              <View>
                <View className={clsx("bg-border h-px my-2", c.divider)} style={s.divider} />
                <Pressable
                  onPress={() => void pickCreate()}
                  className={clsx(
                    "py-3 px-2 rounded-md border border-border bg-card items-center",
                    c.createButton,
                  )}
                  style={s.createButton}
                  accessibilityRole="button"
                  accessibilityLabel={copy.createOrganizationLabel}
                >
                  <Text
                    className={clsx("text-sm font-medium text-card-foreground", c.createButtonText)}
                    style={s.createButtonText}
                  >
                    {copy.createOrganizationLabel}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
