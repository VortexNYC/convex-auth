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
  View,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

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
}) {
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
      className="flex-row items-center px-3 py-2 rounded-md border border-input gap-2"
      style={props.styles.trigger}
    >
      {props.current?.imageUrl !== undefined && props.current.imageUrl.length > 0 ? (
        <Image
          source={{ uri: props.current.imageUrl }}
          className="w-6 h-6 rounded-full"
          style={props.styles.triggerImage}
        />
      ) : (
        <View
          className="w-6 h-6 rounded-full border border-input opacity-40"
          style={props.styles.triggerPlaceholder}
        />
      )}
      <Text className="text-sm font-medium" style={props.styles.triggerName}>
        {props.current?.name ?? props.copy.personalAccountLabel}
      </Text>
    </Pressable>
  );
}

function CurrentOrganizationSection(props: {
  copy: Required<ExpoOrgSwitcherCopy>;
  current: ConvexOrgSwitcherOrganization | null;
  styles: ExpoOrgSwitcherStyles;
}) {
  if (props.current === null) {
    return null;
  }

  return (
    <View>
      <Text
        className="text-xs text-muted-foreground mt-3 mb-2 font-medium"
        style={props.styles.sectionTitle}
      >
        {props.copy.currentOrganizationLabel}
      </Text>
      <View
        className="py-3 px-2 rounded-md opacity-60"
        style={[props.styles.item, props.styles.itemActive]}
      >
        <Text className="text-base font-medium" style={props.styles.itemLabel}>
          {props.current.name}
        </Text>
        {props.current.slug !== undefined ? (
          <Text className="text-xs text-muted-foreground mt-0.5" style={props.styles.itemMeta}>
            {props.current.slug}
          </Text>
        ) : null}
      </View>
      <View className="bg-border h-px my-2" style={props.styles.divider} />
    </View>
  );
}

export function ConvexOrganizationSwitcher(props: ExpoOrgSwitcherProps) {
  const copy = { ...DEFAULT_COPY, ...props.copy };
  const s = props.styles ?? {};
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
      />
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={[
            { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
            s.modal,
          ]}
        >
          <Pressable
            onPress={() => {}}
            className="bg-popover px-4 py-5 rounded-t-xl"
            style={s.panel}
          >
            <CurrentOrganizationSection copy={copy} current={current} styles={s} />
            <Text
              className="text-xs text-muted-foreground mt-3 mb-2 font-medium"
              style={s.sectionTitle}
            >
              {copy.otherOrganizationsLabel}
            </Text>
            {others.length === 0 ? (
              <Text className="text-xs text-muted-foreground mt-0.5" style={s.itemMeta}>
                {copy.noOrganizationsLabel}
              </Text>
            ) : (
              others.map((org) => (
                <Pressable
                  key={org._id}
                  onPress={() => void pickOrg(org._id)}
                  className="py-3 px-2 rounded-md"
                  style={s.item}
                >
                  <Text className="text-base font-medium" style={s.itemLabel}>
                    {org.name}
                  </Text>
                  {org.slug !== undefined ? (
                    <Text className="text-xs text-muted-foreground mt-0.5" style={s.itemMeta}>
                      {org.slug}
                    </Text>
                  ) : null}
                </Pressable>
              ))
            )}
            {props.showPersonalAccount === true && props.onSelectPersonalAccount !== undefined ? (
              <View>
                <View className="bg-border h-px my-2" style={s.divider} />
                <Pressable
                  onPress={() => void pickPersonal()}
                  className="py-3 px-2 rounded-md"
                  style={s.item}
                >
                  <Text className="text-base font-medium" style={s.itemLabel}>
                    {copy.personalAccountLabel}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {props.onCreateOrganization !== undefined ? (
              <View>
                <View className="bg-border h-px my-2" style={s.divider} />
                <Pressable
                  onPress={() => void pickCreate()}
                  className="py-3 px-2 rounded-md border border-input items-center"
                  style={s.createButton}
                >
                  <Text className="text-sm font-medium" style={s.createButtonText}>
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
