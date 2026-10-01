import { AuthField, AuthInput, AuthLabel } from "../../packages/auth/src/react/ui";

export default function AuthFieldPreview() {
  return (
    <AuthField>
      <AuthLabel htmlFor="email">Email</AuthLabel>
      <AuthInput id="email" type="email" placeholder="you@example.com" />
    </AuthField>
  );
}
