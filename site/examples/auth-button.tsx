import { AuthButton } from "../../packages/auth/src/react/ui";

export default function AuthButtonPreview() {
  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      <AuthButton variant="primary">Continue</AuthButton>
      <AuthButton variant="secondary">Use another method</AuthButton>
      <AuthButton variant="ghost">Cancel</AuthButton>
    </div>
  );
}
