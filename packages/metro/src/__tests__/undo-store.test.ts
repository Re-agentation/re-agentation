/**
 * undo-store tests — multi-file revert, deletes, legacy shape, path resolution.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { createUndoStore } from '../undo-store'

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'reagentation-undo-test-'))
})
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function writeStash(batchId: string, itemId: string, stash: unknown): Promise<void> {
  const dir = path.join(root, '.agentation', 'undo', batchId)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, `${itemId}.json`), JSON.stringify(stash))
}

describe('undo-store', () => {
  it('restores multiple files Claude changed (relative paths resolved to projectRoot)', async () => {
    // Two files were edited; record their originals.
    await fs.mkdir(path.join(root, 'apps/mobile/src'), { recursive: true })
    await fs.mkdir(path.join(root, 'packages/i18n'), { recursive: true })
    await fs.writeFile(path.join(root, 'apps/mobile/src/A.tsx'), 'EDITED-A')
    await fs.writeFile(path.join(root, 'packages/i18n/en.json'), 'EDITED-EN')

    await writeStash('b1', 'i1', {
      files: [
        { file: 'apps/mobile/src/A.tsx', content: 'ORIGINAL-A' },
        { file: 'packages/i18n/en.json', content: 'ORIGINAL-EN' },
      ],
    })

    const store = createUndoStore(root)
    const res = await store.restore('b1', 'i1')

    expect(res.restored).toBe(2)
    expect(await fs.readFile(path.join(root, 'apps/mobile/src/A.tsx'), 'utf8')).toBe('ORIGINAL-A')
    expect(await fs.readFile(path.join(root, 'packages/i18n/en.json'), 'utf8')).toBe('ORIGINAL-EN')
  })

  it('deletes files that were newly created by the edit', async () => {
    await fs.writeFile(path.join(root, 'new-asset.png'), 'BINARY')
    await writeStash('b2', 'i1', { files: [{ file: 'new-asset.png', deleted: true }] })

    const store = createUndoStore(root)
    const res = await store.restore('b2', 'i1')

    expect(res.restored).toBe(1)
    await expect(fs.access(path.join(root, 'new-asset.png'))).rejects.toBeTruthy()
  })

  it('undo restores before, redo re-applies after (before/after shape)', async () => {
    await fs.writeFile(path.join(root, 'F.tsx'), 'EDITED')
    await writeStash('bredo', 'i1', { files: [{ file: 'F.tsx', before: 'ORIG', after: 'EDITED' }] })
    const store = createUndoStore(root)

    const undo = await store.restore('bredo', 'i1', 'undo')
    expect(undo.restored).toBe(1)
    expect(await fs.readFile(path.join(root, 'F.tsx'), 'utf8')).toBe('ORIG')

    const redo = await store.restore('bredo', 'i1', 'redo')
    expect(redo.restored).toBe(1)
    expect(await fs.readFile(path.join(root, 'F.tsx'), 'utf8')).toBe('EDITED')
  })

  it('redo recreates a file that undo deleted (created file)', async () => {
    await writeStash('bnew', 'i1', { files: [{ file: 'created.tsx', before: null, after: 'NEW' }] })
    const store = createUndoStore(root)
    // redo writes the created content
    await store.restore('bnew', 'i1', 'redo')
    expect(await fs.readFile(path.join(root, 'created.tsx'), 'utf8')).toBe('NEW')
    // undo deletes it again
    await store.restore('bnew', 'i1', 'undo')
    await expect(fs.access(path.join(root, 'created.tsx'))).rejects.toBeTruthy()
  })

  it('still accepts the legacy single-file shape', async () => {
    await fs.writeFile(path.join(root, 'Legacy.tsx'), 'EDITED')
    await writeStash('b3', 'i1', { file: 'Legacy.tsx', content: 'ORIGINAL' })

    const store = createUndoStore(root)
    const res = await store.restore('b3', 'i1')

    expect(res.restored).toBe(1)
    expect(await fs.readFile(path.join(root, 'Legacy.tsx'), 'utf8')).toBe('ORIGINAL')
  })

  it('restores every item in a batch when no itemId is given', async () => {
    await fs.writeFile(path.join(root, 'X.tsx'), 'EDITED-X')
    await fs.writeFile(path.join(root, 'Y.tsx'), 'EDITED-Y')
    await writeStash('b4', 'i1', { files: [{ file: 'X.tsx', content: 'ORIG-X' }] })
    await writeStash('b4', 'i2', { files: [{ file: 'Y.tsx', content: 'ORIG-Y' }] })

    const store = createUndoStore(root)
    const res = await store.restore('b4')

    expect(res.restored).toBe(2)
    expect(await fs.readFile(path.join(root, 'X.tsx'), 'utf8')).toBe('ORIG-X')
    expect(await fs.readFile(path.join(root, 'Y.tsx'), 'utf8')).toBe('ORIG-Y')
  })
})
