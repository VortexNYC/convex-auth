import { AuthCard, AuthCardContent, AuthCardHeader } from "../../packages/auth/src/react/ui";

export default function AuthCardPreview() {
  return (
    <AuthCard>
      <AuthCardHeader title="Sign in" description="Access your workspace." />
      <AuthCardContent>
        <p>Card body content.</p>
      </AuthCardContent>
    </AuthCard>
  );
}
