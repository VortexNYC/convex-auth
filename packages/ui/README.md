# convex-auth-ui

Base shadcn-style UI primitives used by `convex-auth-react`.

This package exports unstyled, composable React components (Button, Input, Dialog, DropdownMenu, etc.) and a Tailwind-first style sheet. It is a peer dependency of `convex-auth-react`; you can also use the primitives directly in your own auth UI.

## Install

```bash
pnpm add convex-auth-ui
```

## Quick start

Import the primitives and use them in your own auth forms, or rely on `convex-auth-react` to render them for you.

```tsx
import { Button } from "convex-auth-ui";

export function MyButton() {
  return <Button>Sign in</Button>;
}
```

See the [full docs](https://convex-auth.vortex.nyc).

## License

Apache-2.0
