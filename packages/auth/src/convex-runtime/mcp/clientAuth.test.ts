import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { validateTokenEndpointClientAuthentication } from "./clientAuth";

describe("validateTokenEndpointClientAuthentication", () => {
  it("accepts token requests without client auth", () => {
    assert.equal(
      validateTokenEndpointClientAuthentication({
        authorizationHeader: null,
        clientSecret: null,
      }),
      null,
    );
  });

  it("rejects authorization header auth", () => {
    assert.deepEqual(
      validateTokenEndpointClientAuthentication({
        authorizationHeader: "Basic abc123",
        clientSecret: null,
      }),
      {
        error: "invalid_client",
        error_description:
          "Client authentication is not supported. Supported token endpoint auth methods: none",
      },
    );
  });

  it("accepts a posted client secret when the deployment supports it", () => {
    /**
     * `supportedMethods` used to affect only the error text: a confidential
     * method could be advertised and still be refused. Machine clients
     * (client_credentials) authenticate with exactly this credential, so an
     * advertised method has to actually be honoured.
     */
    assert.equal(
      validateTokenEndpointClientAuthentication({
        authorizationHeader: null,
        clientSecret: "secret",
        supportedMethods: ["none", "client_secret_post"],
      }),
      null,
    );
  });

  it("accepts basic auth when the deployment supports it", () => {
    assert.equal(
      validateTokenEndpointClientAuthentication({
        authorizationHeader: "Basic abc123",
        clientSecret: null,
        supportedMethods: ["client_secret_basic"],
      }),
      null,
    );
  });

  it("rejects a method the deployment does not advertise", () => {
    assert.deepEqual(
      validateTokenEndpointClientAuthentication({
        authorizationHeader: "Basic abc123",
        clientSecret: null,
        supportedMethods: ["none", "client_secret_post"],
      }),
      {
        error: "invalid_client",
        error_description:
          "Client authentication is not supported. Supported token endpoint auth methods: none, client_secret_post",
      },
    );
  });

  it("requires a credential when public clients are not allowed", () => {
    /**
     * A confidential-only deployment must not fall back to an unauthenticated
     * client just because none was presented.
     */
    assert.deepEqual(
      validateTokenEndpointClientAuthentication({
        authorizationHeader: null,
        clientSecret: null,
        supportedMethods: ["client_secret_post"],
      }),
      {
        error: "invalid_client",
        error_description:
          "Client authentication is required. Supported token endpoint auth methods: client_secret_post",
      },
    );
  });
});
