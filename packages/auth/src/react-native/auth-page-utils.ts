export function buildExpoAuthSignUpUrl(args: {
  signUpPath: string;
  token: string;
  email?: string | null;
}): string {
  const url = new URL(args.signUpPath, "https://expo.invalid");
  url.searchParams.set("token", args.token);
  if (args.email !== undefined && args.email !== null) {
    url.searchParams.set("email", args.email);
  }
  return `${url.pathname}${url.search}`;
}
