import { AuthProviderButtons } from "../../packages/auth/src/react/auth-forms";

export default function ProviderButtonsPreview() {
  return (
    <AuthProviderButtons
      providers={[
        { id: "google", label: "Google" },
        { id: "github", label: "GitHub" },
        { id: "discord", label: "Discord" },
      ]}
      onSelect={() => {}}
    />
  );
}
