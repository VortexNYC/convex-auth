import { ConvexAuthLoadingCard } from "../../packages/auth/src/react/auth-pages";

export default function AuthLoadingCardPreview() {
  return (
    <ConvexAuthLoadingCard
      title="Checking your session"
      description="We're confirming your sign-in before routing you on."
    />
  );
}
