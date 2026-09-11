import { describe, it } from "vitest";
import type { ComponentApi as FullComponentApi } from "../../component/_generated/component";
import type { ComponentApi as AgentAuthComponentApi } from "../../component/agentAuth/_generated/component";
import type { ComponentApi as ApiKeysComponentApi } from "../../component/apiKeys/_generated/component";
import type { ComponentApi as AuthMdComponentApi } from "../../component/authMd/_generated/component";
import type { ComponentApi as CoreComponentApi } from "../../component/core/_generated/component";
import type { ComponentApi as McpOauthComponentApi } from "../../component/mcpOauth/_generated/component";
import type { ComponentApi as OrganizationsComponentApi } from "../../component/organizations/_generated/component";
import type { ComponentApi as ServicePrincipalsComponentApi } from "../../component/servicePrincipals/_generated/component";
import type { ComponentApi as WebhooksComponentApi } from "../../component/webhooks/_generated/component";
import { convexAuth } from "./convexAuth";
import type { NativeEmailAndPasswordComponentHandle } from "./types";

// Compile-time checks that the full, core, and organizations components can be
// passed to convexAuth() as components.core.
type _AssertFullSatisfiesNativeHandle =
  FullComponentApi<"convexAuth"> extends NativeEmailAndPasswordComponentHandle ? true : false;
type _AssertCoreSatisfiesNativeHandle =
  CoreComponentApi<"convexAuthCore"> extends NativeEmailAndPasswordComponentHandle ? true : false;
type _AssertOrganizationsSatisfiesNativeHandle =
  OrganizationsComponentApi<"convexAuthOrganizations"> extends NativeEmailAndPasswordComponentHandle
    ? true
    : false;

describe("convexAuth component handle types", () => {
  it("accepts convexAuth, convexAuthCore, and convexAuthOrganizations as component/components.core", () => {
    const fullComponent = {} as unknown as FullComponentApi<"convexAuth">;
    const coreComponent = {} as unknown as CoreComponentApi<"convexAuthCore">;
    const organizationsComponent =
      {} as unknown as OrganizationsComponentApi<"convexAuthOrganizations">;

    // If these compile, the config accepts all three generated component handles.
    convexAuth({ component: fullComponent });
    convexAuth({ component: coreComponent });
    convexAuth({ component: organizationsComponent });
    convexAuth({ components: { core: fullComponent } });
    convexAuth({ components: { core: coreComponent } });
    convexAuth({ components: { core: organizationsComponent } });

    const testOauthProvider = {
      clients: [
        {
          clientId: "test-client",
          name: "Test Client",
          redirectUris: ["https://example.com/callback"],
          allowedScopes: ["openid", "email"],
        },
      ],
    };

    // oauthProvider requires the full component (mcp namespace) at runtime.
    convexAuth({ component: fullComponent, oauthProvider: testOauthProvider });

    const agentAuthComponent = {} as unknown as AgentAuthComponentApi<"convexAuthAgentAuth">;
    const apiKeysComponent = {} as unknown as ApiKeysComponentApi<"convexAuthApiKeys">;
    const authMdComponent = {} as unknown as AuthMdComponentApi<"convexAuthAuthMd">;
    const mcpOauthComponent = {} as unknown as McpOauthComponentApi<"convexAuthMcpOauth">;
    const servicePrincipalsComponent =
      {} as unknown as ServicePrincipalsComponentApi<"convexAuthServicePrincipals">;
    const webhooksComponent = {} as unknown as WebhooksComponentApi<"convexAuthWebhooks">;

    // These are not valid as the core native-auth handle because they do not
    // expose the email/password, session, and verifier functions.
    // @ts-expect-error agentAuth is not a core auth component
    convexAuth({ components: { core: agentAuthComponent } });
    // @ts-expect-error apiKeys is not a core auth component
    convexAuth({ components: { core: apiKeysComponent } });
    // @ts-expect-error authMd is not a core auth component
    convexAuth({ components: { core: authMdComponent } });
    // @ts-expect-error mcpOauth is not a core auth component
    convexAuth({ components: { core: mcpOauthComponent } });
    // @ts-expect-error servicePrincipals is not a core auth component
    convexAuth({ components: { core: servicePrincipalsComponent } });
    // @ts-expect-error webhooks is not a core auth component
    convexAuth({ components: { core: webhooksComponent } });

    // Runtime assertion placeholder.
    const _yes = true;
    void _yes;
  });
});
