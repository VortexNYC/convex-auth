import {
  ConvexAuthActionButton,
  ConvexAuthUnavailableCard,
} from "../../packages/auth/src/react/auth-pages";

export default function AuthUnavailableCardPreview() {
  return (
    <ConvexAuthUnavailableCard
      title="Authentication unavailable"
      description="We couldn't reach the auth service. Try again in a moment."
      actions={<ConvexAuthActionButton onClick={() => {}}>Retry</ConvexAuthActionButton>}
    />
  );
}
