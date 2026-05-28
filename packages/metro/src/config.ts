/**
 * withReagentation — wraps a Metro config to register our middleware.
 *
 * Works with `getDefaultConfig` from both `@react-native/metro-config` and
 * `expo/metro-config`. No-ops in production builds.
 *
 * Status: SCAFFOLD. See Re-agentation plan §1-B.
 */

import { createMiddleware, type MiddlewareOptions } from './middleware'

export interface WithReagentationOptions extends MiddlewareOptions {
  /** Force-enable in non-development. Default `false`. */
  enableInProduction?: boolean
}

// Loose typing: Metro's config type is complex and version-dependent. The
// shape we care about is `server.enhanceMiddleware`.
type AnyMetroConfig = Record<string, unknown> & {
  server?: {
    enhanceMiddleware?: (m: unknown, server: unknown) => unknown
    [k: string]: unknown
  }
}

export function withReagentation<T extends AnyMetroConfig>(
  config: T,
  options: WithReagentationOptions = {},
): T {
  if (!options.enableInProduction && process.env.NODE_ENV === 'production') {
    return config
  }

  const reagentationMiddleware = createMiddleware(options)
  const previous = config.server?.enhanceMiddleware

  return {
    ...config,
    server: {
      ...(config.server ?? {}),
      enhanceMiddleware: (metro: unknown, server: unknown) => {
        const wrapped = previous ? previous(metro, server) : metro
        return reagentationMiddleware(wrapped)
      },
    },
  } as T
}
