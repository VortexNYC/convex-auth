import { AuthScreen } from "../../packages/auth/src/react/ui";

export default function AuthScreenPreview() {
  return (
    <AuthScreen
      title="Welcome back"
      description="Sign in to continue."
      footer={<p>Need an account? Contact your admin.</p>}
    >
      <p>Form content goes here.</p>
    </AuthScreen>
  );
}
