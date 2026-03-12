import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { Effect } from "effect";
import { loadConfig, ConfigError } from "../src/config.ts";

describe("ConfigError", () => {
  test("should have correct _tag", () => {
    const error = new ConfigError({ message: "missing token" });
    expect(error._tag).toBe("ConfigError");
    expect(error.message).toBe("missing token");
  });
});

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("should load config from environment", async () => {
    process.env.SLAB_API_TOKEN = "my-token";
    process.env.SLAB_TEAM = "my-team";

    const config = await Effect.runPromise(loadConfig());
    expect(config.apiToken).toBe("my-token");
    expect(config.team).toBe("my-team");
    expect(config.graphqlUrl).toBe("https://api.slab.com/v1/graphql");
  });

  test("should fail when SLAB_API_TOKEN is missing", async () => {
    delete process.env.SLAB_API_TOKEN;
    process.env.SLAB_TEAM = "my-team";

    const result = await Effect.runPromise(loadConfig().pipe(Effect.either));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("ConfigError");
      expect(result.left.message).toContain("SLAB_API_TOKEN");
    }
  });

  test("should fail when SLAB_TEAM is missing", async () => {
    process.env.SLAB_API_TOKEN = "my-token";
    delete process.env.SLAB_TEAM;

    const result = await Effect.runPromise(loadConfig().pipe(Effect.either));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("ConfigError");
      expect(result.left.message).toContain("SLAB_TEAM");
    }
  });

  test("should fail when both env vars are missing", async () => {
    delete process.env.SLAB_API_TOKEN;
    delete process.env.SLAB_TEAM;

    const result = await Effect.runPromise(loadConfig().pipe(Effect.either));
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("ConfigError");
      expect(result.left.message).toContain("SLAB_API_TOKEN");
    }
  });
});
