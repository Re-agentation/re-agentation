/**
 * tools — registers Re-agentation tools on an MCP server.
 *
 * Tool descriptions explicitly state that items in a batch represent ONE
 * coherent user intent so the model edits them together. This is the most
 * important architectural cue we give to Claude.
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { QueueClient } from './queue-client'

const NEXT_BATCH_DESC = [
  'Return the oldest unprocessed annotation batch from the running React Native app.',
  '',
  'IMPORTANT: A batch contains 1..N items. ALL items in a single batch are ONE coherent',
  'user intent and MUST be processed together — not as independent tasks. Specifically:',
  '',
  '  • Items in the SAME file: merge into a single edit.',
  '  • Items in DIFFERENT files: edit them in parallel as one coherent change set.',
  '  • Do NOT call this tool again until you have called `agentation.ack` for the',
  '    current batch (otherwise you will keep receiving the same batch).',
  '',
  'Each item has: { component, tree, source: { file, line }, props, comment, screenshotUrl? }.',
  'Use `source.file` and `source.line` to locate the exact edit site — do NOT grep.',
  'If `source` is null, the item is a `fallback` (probe could not resolve a path); use',
  '`component` + `tree` to find the file yourself.',
  '',
  'Returns null if the queue is empty.',
].join('\n')

const LIST_BATCHES_DESC =
  'Preview up to `limit` recent unprocessed batches without consuming them. Useful for showing the user what is pending before you start editing.'

const ACK_DESC = [
  'Acknowledge a batch as processed.',
  '',
  '  • Whole batch:   { batchId }',
  '  • Partial:       { batchId, itemIds: ["id1", ...] }',
  '',
  'After whole-batch ack, the batch is archived and will not appear in `nextBatch` again.',
  'After partial ack, the remaining items stay inflight.',
].join('\n')

const SUBSCRIBE_DESC =
  'NOTE: Streaming via this tool is not supported in stdio mode — use `nextBatch` polling instead. For SSE-based clients (`re-agentation-mcp-http`), this tool yields batches as they arrive.'

export interface RegisterToolsOptions {
  queue: QueueClient
}

export function registerTools(server: McpServer, { queue }: RegisterToolsOptions): void {
  // Empty-input tools still need a Zod object schema in MCP SDK 1.x.
  const Empty = z.object({}).strict()
  const LimitInput = z.object({ limit: z.number().int().positive().max(100).optional() }).strict()
  const AckInput = z
    .object({
      batchId: z.string().min(1),
      itemIds: z.array(z.string().min(1)).optional(),
    })
    .strict()

  server.tool('agentation_nextBatch', NEXT_BATCH_DESC, Empty.shape, async () => {
    const batch = await queue.nextBatch()
    return {
      content: [
        {
          type: 'text' as const,
          text: batch ? JSON.stringify(batch, null, 2) : 'null',
        },
      ],
    }
  })

  server.tool('agentation_listBatches', LIST_BATCHES_DESC, LimitInput.shape, async (args) => {
    const limit = args.limit ?? 10
    const batches = await queue.listBatches(limit)
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(batches, null, 2),
        },
      ],
    }
  })

  server.tool('agentation_ack', ACK_DESC, AckInput.shape, async (args) => {
    const result = await queue.ack(args)
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result),
        },
      ],
    }
  })

  // `subscribe` is registered but explicitly documented as no-op in stdio.
  // The HTTP/SSE entry point uses the queue.subscribe iterator directly via
  // SSE events, not via this tool.
  server.tool('agentation_subscribe', SUBSCRIBE_DESC, Empty.shape, async () => ({
    content: [
      {
        type: 'text' as const,
        text:
          'Subscribe is a no-op in stdio mode. Poll `agentation_nextBatch` instead, ' +
          'or run `re-agentation-mcp-http` to use SSE streaming.',
      },
    ],
  }))
}
