/**
 * HTTP+SSE MCP server entry. Used by Cursor / Windsurf / any non-stdio
 * The `#!/usr/bin/env node` shebang is injected by tsup for the CJS bin output.
 * client that speaks MCP over Server-Sent Events.
 *
 * Run via:
 *   npx re-agentation-mcp-http [--port 4747] [--metro http://localhost:8081]
 *
 * Endpoints:
 *   GET  /sse           — SSE stream (MCP transport)
 *   POST /message       — JSON-RPC message inbound (per MCP SSE spec)
 *   GET  /health        — liveness
 */

import * as http from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'

import { createQueueClient, type QueueClient } from './queue-client'
import { registerTools } from './tools'

export interface HttpMcpServerOptions {
  port?: number
  host?: string
  metroHost?: string
  queue?: QueueClient
}

export async function createHttpMcpServer(options: HttpMcpServerOptions = {}): Promise<{
  url: string
  shutdown: () => Promise<void>
}> {
  const port = options.port ?? 4747
  const host = options.host ?? '127.0.0.1'

  const queue = options.queue ?? createQueueClient({ metroHost: options.metroHost })

  // We accept multiple concurrent SSE clients (e.g. Cursor + Windsurf).
  // Each gets its own McpServer + transport instance so state doesn't bleed.
  const transports = new Map<string, SSEServerTransport>()

  const httpServer = http.createServer(async (req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ ok: true, transports: transports.size }))
      return
    }

    if (req.url === '/sse' && req.method === 'GET') {
      const transport = new SSEServerTransport('/message', res)
      transports.set(transport.sessionId, transport)
      res.on('close', () => {
        transports.delete(transport.sessionId)
      })

      const server = new McpServer(
        { name: 're-agentation', version: '0.0.0' },
        { capabilities: { tools: {} } },
      )
      registerTools(server, { queue })
      await server.connect(transport)
      return
    }

    if (req.url?.startsWith('/message') && req.method === 'POST') {
      const url = new URL(req.url, 'http://localhost')
      const sessionId = url.searchParams.get('sessionId')
      const transport = sessionId ? transports.get(sessionId) : undefined
      if (!transport) {
        res.statusCode = 404
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ error: 'no_session' }))
        return
      }
      await transport.handlePostMessage(req, res)
      return
    }

    res.statusCode = 404
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: 'not_found' }))
  })

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(port, host, () => {
      httpServer.off('error', reject)
      resolve()
    })
  })

  const url = `http://${host}:${port}`
  console.log(`[re-agentation-mcp-http] listening on ${url}`)
  console.log(`[re-agentation-mcp-http]   SSE endpoint: ${url}/sse`)
  console.log(`[re-agentation-mcp-http]   Health:       ${url}/health`)

  return {
    url,
    shutdown: () =>
      new Promise<void>((resolve) => {
        for (const t of transports.values()) {
          void t.close().catch(() => undefined)
        }
        transports.clear()
        httpServer.close(() => resolve())
      }),
  }
}

function parseFlag(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1]
  return undefined
}

// See server.ts for why require.main === module is the primary check
// (symlink-safe for global bins / npx shims).
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
  const port = Number(parseFlag('--port') ?? process.env.REAGENTATION_MCP_PORT ?? 4747)
  const metroHost = parseFlag('--metro') ?? process.env.REAGENTATION_METRO_HOST
  createHttpMcpServer({ port, metroHost }).catch((err) => {
    console.error('[re-agentation-mcp-http] fatal:', err)
    process.exit(1)
  })
}
