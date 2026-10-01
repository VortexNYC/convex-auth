import { PasskeyManager } from "../../packages/auth/src/react/passkey-manager";

const notInPreview = () => Promise.reject(new Error("preview only"));
import { PREVIEW_NOW } from "./_shared";

export default function PasskeyManagerPreview() {
  return (
    <PasskeyManager
      rpName="Acme Corp"
      passkeys={[
        {
          credentialId: "cred_1",
          name: "MacBook Pro Touch ID",
          createdAt: PREVIEW_NOW - 86400000 * 30,
          lastUsedAt: PREVIEW_NOW - 3600000,
          transports: ["internal"],
        },
        {
          credentialId: "cred_2",
          name: "YubiKey 5C",
          createdAt: PREVIEW_NOW - 86400000 * 90,
          lastUsedAt: PREVIEW_NOW - 86400000 * 7,
          transports: ["usb", "nfc"],
        },
      ]}
      onRegister={notInPreview}
      onVerifyRegistration={notInPreview}
      onAuthenticate={notInPreview}
      onVerifyAuthentication={notInPreview}
      onRevoke={async () => {}}
      onRename={async () => {}}
    />
  );
}
