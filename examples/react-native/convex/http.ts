import { httpRouter } from "convex/server";
import { env, httpAction } from "./_generated/server";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);

// Native passkey association files. Hosting these on the .convex.site domain
// lets rpID default to that domain — no separate website needed for the demo.
// Set PASSKEY_IOS_APP_ID ("TEAMID.bundle.id") and PASSKEY_ANDROID_PACKAGE +
// PASSKEY_ANDROID_SHA256_CERT_FINGERPRINT in the deployment env. Each route
// 404s until its env vars are configured.

http.route({
  path: "/.well-known/apple-app-site-association",
  method: "GET",
  handler: httpAction(async () => {
    const appId = env.PASSKEY_IOS_APP_ID;
    if (!appId) {
      return new Response("Not configured", { status: 404 });
    }
    return new Response(
      JSON.stringify({
        webcredentials: { apps: [appId] },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }),
});

http.route({
  path: "/.well-known/assetlinks.json",
  method: "GET",
  handler: httpAction(async () => {
    const packageName = env.PASSKEY_ANDROID_PACKAGE;
    const sha256 = env.PASSKEY_ANDROID_SHA256_CERT_FINGERPRINT;
    if (!packageName || !sha256) {
      return new Response("Not configured", { status: 404 });
    }
    return new Response(
      JSON.stringify([
        {
          relation: [
            "delegate_permission/common.handle_all_urls",
            // Required for Credential Manager passkey flows.
            "delegate_permission/common.get_login_creds",
          ],
          target: {
            namespace: "android_app",
            package_name: packageName,
            sha256_cert_fingerprints: [sha256],
          },
        },
      ]),
      { headers: { "Content-Type": "application/json" } },
    );
  }),
});

export default http;
