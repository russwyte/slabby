/**
 * Copyright 2025 Russ White
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Configuration service using Effect Context
 */

import { Context, Effect, Layer } from "effect";

/**
 * Error types for configuration
 */
export class ConfigError {
  readonly _tag = "ConfigError";
  constructor(readonly message: string) {}
}

/**
 * Slab configuration
 */
export interface SlabConfig {
  readonly apiToken: string;
  readonly team: string;
  readonly baseUrl: string;
}

/**
 * Configuration service interface
 */
export interface ConfigService {
  readonly config: SlabConfig;
}

/**
 * Configuration context tag
 */
export const ConfigService = Context.GenericTag<ConfigService>("@services/ConfigService");

/**
 * Load configuration from environment variables
 */
export const loadConfig = (): Effect.Effect<SlabConfig, ConfigError> =>
  Effect.gen(function* () {
    const apiToken = process.env.SLAB_API_TOKEN;
    const team = process.env.SLAB_TEAM;

    if (!apiToken) {
      return yield* Effect.fail(new ConfigError("SLAB_API_TOKEN environment variable is required"));
    }

    if (!team) {
      return yield* Effect.fail(new ConfigError("SLAB_TEAM environment variable is required"));
    }

    return {
      apiToken,
      team,
      baseUrl: `https://${team}.slab.com/api/v1`,
    };
  });

/**
 * Live configuration layer - loads from environment
 */
export const ConfigServiceLive = Layer.effect(
  ConfigService,
  Effect.gen(function* () {
    const config = yield* loadConfig();
    return { config };
  })
);
