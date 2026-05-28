/**
 * stdio MCP server entry. Used by Claude Code / Claude Desktop.
 * The `#!/usr/bin/env node` shebang is injected by tsup for the CJS bin output.
 *
 * Run via:
 *   npx re-agentation-mcp [--metro http://localhost:8081]
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { createQueueClient, type QueueClient } from './queue-client'
import { registerTools } from './tools'

export interface McpServerOptions {
  metroHost?: string
  pollIntervalMs?: number
  /** Test seam. */
  queue?: QueueClient
}

export async function createMcpServer(options: McpServerOptions = {}): Promise<{
  server: McpServer
  shutdown: () => Promise<void>
}> {
  const queue =
    options.queue ??
    createQueueClient({
      metroHost: options.metroHost,
      pollIntervalMs: options.pollIntervalMs,
    })

  const server = new McpServer(
    {
      name: 're-agentation',
      version: '0.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  )

  registerTools(server, { queue })

  const transport = new StdioServerTransport()
  await server.connect(transport)

  return {
    server,
    shutdown: async () => {
      await server.close()
    },
  }
}

function parseFlag(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1]
  return undefined
}

// Bin entry: detect direct execution. The published bin is the CJS build,
// so `require.main === module` is the primary check — it is symlink-safe
// (Node resolves require.main to the real entry module), unlike comparing
// import.meta.url to process.argv[1] which breaks when launched via a global
// bin symlink or `npx` shim.
const isMain = (() => {
  if (typeof require !== 'undefined' && typeof module !== 'undefined') {
    return require.main === module
  }
  try {
    return (import.meta as ImportMeta & { url?: string })?.url === `file://${process.argv[1]}`
  } catch {
    return false
  }
})()

if (isMain) {
  const metroHost = parseFlag('--metro') ?? process.env.REAGENTATION_METRO_HOST
  createMcpServer({ metroHost }).catch((err) => {
    console.error('[re-agentation-mcp] fatal:', err)
    process.exit(1)
  })
}
