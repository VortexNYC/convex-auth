import { AuthAlert } from "../../packages/auth/src/react/ui";

export default function AuthAlertPreview() {
  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      <AuthAlert tone="error" title="Sign-in failed">
        The password you entered doesn't match this account.
      </AuthAlert>
      <AuthAlert tone="success" title="Email verified">
        You're all set — continue to your workspace.
      </AuthAlert>
    </div>
  );
}
