# convex-auth-react

React UI components and hooks for `convex-auth`.

## Install

```bash
pnpm add convex-auth-react
```

## Quick start

Wrap your app in the provider:

```tsx
import { ConvexReactClient, ConvexProvider } from "convex/react";
import { ConvexAuthClientProvider } from "convex-auth/react";
import { api } from "../convex/_generated/api";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

function App() {
  return (
    <ConvexProvider client={convex}>
      <ConvexAuthClientProvider actions={api.auth}>{/* your app */}</ConvexAuthClientProvider>
    </ConvexProvider>
  );
}
```

Use the auth actions in components:

```tsx
import { useAuthActions } from "convex-auth/react";

export function SignIn() {
  const { signIn, isLoading } = useAuthActions();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await signIn({
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="email" type="email" required />
      <input name="password" type="password" required />
      <button type="submit" disabled={isLoading}>
        {isLoading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
```

See the [full docs](https://convex-auth.vortex.nyc).

## License

Apache-2.0
