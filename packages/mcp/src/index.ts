/**
 * @re-agentation/mcp — programmatic entry.
 *
 * For CLI use, see the `re-agentation-mcp` (stdio) and
 * `re-agentation-mcp-http` (HTTP+SSE) bin entries.
 */

export { createMcpServer } from './server'
export type { McpServerOptions } from './server'

export { createHttpMcpServer } from './http-server'
export type { HttpMcpServerOptions } from './http-server'

export { createQueueClient } from './queue-client'
export type {
  QueueClient,
  QueueClientOptions,
  QueueEntry,
  AckArgs,
  AckResult,
} from './queue-client'

export { registerTools } from './tools'
export type { RegisterToolsOptions } from './tools'

export { runApplyWatcher } from './apply-watcher'
export type { ApplyWatcherOptions } from './apply-watcher'
