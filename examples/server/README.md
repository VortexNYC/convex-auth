# `examples/server`

A Hono server that calls `convex-auth` actions through `ConvexHttpClient`.

## Run

```bash
cd examples/server
pnpm install
pnpm run dev
```

The server listens on `http://localhost:3000` by default.

## Environment

- `CONVEX_URL` — your Convex deployment URL.
- `CONVEX_SITE_URL` — your Convex HTTP actions site URL (used for OAuth callback URLs).

Copy `.env.example` to `.env.local` and fill in the values. OAuth credentials are set on the Convex deployment itself:

```bash
pnpm dlx convex env set GITHUB_CLIENT_ID '...'
pnpm dlx convex env set GITHUB_CLIENT_SECRET '...'
```

For an example deployment:

```bash
CONVEX_URL=https://<your-deployment>.convex.cloud pnpm run dev
```

## Endpoints

- `POST /auth/sign-up` — `{ name, email, password }`
- `POST /auth/sign-in` — `{ email, password }`
- `POST /auth/oauth/:provider` — `{ callbackURL, errorURL }`
- `POST /auth/sign-out` — `{}`

## Example request

```bash
curl -X POST http://localhost:3000/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","password":"S3cur3P@ss!0001"}'
```
