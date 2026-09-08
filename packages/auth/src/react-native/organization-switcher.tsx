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
  StyleSheet,
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
    <Pressable onPress={props.onPress} style={[styles.trigger, props.styles.trigger]}>
      {props.current?.imageUrl !== undefined && props.current.imageUrl.length > 0 ? (
        <Image
          source={{ uri: props.current.imageUrl }}
          style={[styles.triggerImage, props.styles.triggerImage]}
        />
      ) : (
        <View style={[styles.triggerPlaceholder, props.styles.triggerPlaceholder]} />
      )}
      <Text style={[styles.triggerName, props.styles.triggerName]}>
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
      <Text style={[styles.sectionTitle, props.styles.sectionTitle]}>
        {props.copy.currentOrganizationLabel}
      </Text>
      <View style={[styles.item, styles.itemActive, props.styles.item, props.styles.itemActive]}>
        <Text style={[styles.itemLabel, props.styles.itemLabel]}>{props.current.name}</Text>
        {props.current.slug !== undefined ? (
          <Text style={[styles.itemMeta, props.styles.itemMeta]}>{props.current.slug}</Text>
        ) : null}
      </View>
      <View className="bg-border" style={[styles.divider, props.styles.divider]} />
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
        <Pressable style={[styles.modal, s.modal]} onPress={() => setOpen(false)}>
          <Pressable className="bg-popover" style={[styles.panel, s.panel]} onPress={() => {}}>
            <CurrentOrganizationSection copy={copy} current={current} styles={s} />
            <Text style={[styles.sectionTitle, s.sectionTitle]}>
              {copy.otherOrganizationsLabel}
            </Text>
            {others.length === 0 ? (
              <Text style={[styles.itemMeta, s.itemMeta]}>{copy.noOrganizationsLabel}</Text>
            ) : (
              others.map((org) => (
                <Pressable
                  key={org._id}
                  onPress={() => void pickOrg(org._id)}
                  style={[styles.item, s.item]}
                >
                  <Text style={[styles.itemLabel, s.itemLabel]}>{org.name}</Text>
                  {org.slug !== undefined ? (
                    <Text style={[styles.itemMeta, s.itemMeta]}>{org.slug}</Text>
                  ) : null}
                </Pressable>
              ))
            )}
            {props.showPersonalAccount === true && props.onSelectPersonalAccount !== undefined ? (
              <View>
                <View className="bg-border" style={[styles.divider, s.divider]} />
                <Pressable onPress={() => void pickPersonal()} style={[styles.item, s.item]}>
                  <Text style={[styles.itemLabel, s.itemLabel]}>{copy.personalAccountLabel}</Text>
                </Pressable>
              </View>
            ) : null}
            {props.onCreateOrganization !== undefined ? (
              <View>
                <View className="bg-border" style={[styles.divider, s.divider]} />
                <Pressable
                  onPress={() => void pickCreate()}
                  style={[styles.createButton, s.createButton]}
                >
                  <Text style={[styles.createButtonText, s.createButtonText]}>
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

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    gap: 8,
  },
  triggerImage: { width: 24, height: 24, borderRadius: 12 },
  triggerPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    opacity: 0.4,
  },
  triggerName: { fontSize: 14, fontWeight: "500" },
  modal: {
    flex: 1,
    justifyContent: "flex-end",
    // convex-allow-color: modal scrim
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  panel: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  sectionTitle: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 12,
    marginBottom: 8,
    fontWeight: "500",
  },
  item: { paddingVertical: 12, paddingHorizontal: 8, borderRadius: 6 },
  itemActive: { opacity: 0.6 },
  itemLabel: { fontSize: 15, fontWeight: "500" },
  itemMeta: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  divider: { height: 1, marginVertical: 8 },
  createButton: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
  },
  createButtonText: { fontSize: 14, fontWeight: "500" },
});
