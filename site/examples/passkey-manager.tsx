import { PasskeyManager } from "../../packages/auth/src/react/passkey-manager";
import { PREVIEW_NOW, PreviewVariant } from "./_shared";

const notInPreview = () => Promise.reject(new Error("preview only"));

const PASSKEYS = [
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
];

export default function PasskeyManagerPreview() {
  return (
    <>
      <PreviewVariant label="registered passkeys">
        <PasskeyManager
          rpName="Acme Corp"
          passkeys={PASSKEYS}
          onRegister={notInPreview}
          onVerifyRegistration={notInPreview}
          onAuthenticate={notInPreview}
          onVerifyAuthentication={notInPreview}
          onRevoke={async () => {}}
          onRename={async () => {}}
        />
      </PreviewVariant>
      <PreviewVariant label="loading">
        <PasskeyManager
          rpName="Acme Corp"
          loading
          onRegister={notInPreview}
          onVerifyRegistration={notInPreview}
          onAuthenticate={notInPreview}
          onVerifyAuthentication={notInPreview}
          onRevoke={async () => {}}
          onRename={async () => {}}
        />
      </PreviewVariant>
      <PreviewVariant label="empty">
        <PasskeyManager
          rpName="Acme Corp"
          passkeys={[]}
          onRegister={notInPreview}
          onVerifyRegistration={notInPreview}
          onAuthenticate={notInPreview}
          onVerifyAuthentication={notInPreview}
          onRevoke={async () => {}}
          onRename={async () => {}}
        />
      </PreviewVariant>
    </>
  );
}
