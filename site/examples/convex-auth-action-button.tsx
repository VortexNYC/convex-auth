import { ConvexAuthActionButton } from "../../packages/auth/src/react/auth-pages";

export default function AuthActionButtonPreview() {
  return (
    <div style={{ display: "flex", gap: "0.5rem" }}>
      <ConvexAuthActionButton onClick={() => {}}>Continue</ConvexAuthActionButton>
      <ConvexAuthActionButton variant="secondary" onClick={() => {}}>
        Back
      </ConvexAuthActionButton>
    </div>
  );
}
