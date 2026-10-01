import { ConvexAuthAcceptInvitePage } from "../../packages/auth/src/react/auth-pages";

export default function AcceptInvitePagePreview() {
  return (
    <ConvexAuthAcceptInvitePage
      buildSignUpUrl={() => "/sign-up"}
      redirectToSignIn={() => {}}
      signInPath="/sign-in"
      signUpPath="/sign-up"
      postSignUpPath="/post-sign-up"
    />
  );
}
