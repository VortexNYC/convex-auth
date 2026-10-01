import { AuthInput } from "../../packages/auth/src/react/ui";
import { PreviewVariant } from "./_shared";

export default function AuthInputPreview() {
  return (
    <>
      <PreviewVariant label="empty">
        <AuthInput type="email" placeholder="you@example.com" />
      </PreviewVariant>
      <PreviewVariant label="filled">
        <AuthInput type="email" defaultValue="ada@example.com" />
      </PreviewVariant>
      <PreviewVariant label="disabled">
        <AuthInput type="email" defaultValue="locked@example.com" disabled />
      </PreviewVariant>
    </>
  );
}
