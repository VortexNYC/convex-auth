import { PasskeyManager } from "../../packages/auth/src/react/passkey-manager";

const notInPreview = () => Promise.reject(new Error("preview only"));

export default function PasskeyManagerPreview() {
  return (
    <PasskeyManager
      rpName="Acme Corp"
      passkeys={[
        {
          credentialId: "cred_1",
          name: "MacBook Pro Touch ID",
          createdAt: Date.now() - 86400000 * 30,
          lastUsedAt: Date.now() - 3600000,
          transports: ["internal"],
        },
        {
          credentialId: "cred_2",
          name: "YubiKey 5C",
          createdAt: Date.now() - 86400000 * 90,
          lastUsedAt: Date.now() - 86400000 * 7,
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
