/**
 * re-agentation-apply — auto-apply watcher.
 *
 * Run `re-agentation-apply` once in your project root and leave it running.
 * Every time you hit "Send" in the app, this watcher:
 *   1. pulls the batch from the Metro queue (marks it 'processing'),
 *   2. snapshots each source file (for Undo) + captures a BEFORE screenshot,
 *   3. runs headless `claude -p` to edit the exact file (passing any attached
 *      reference images / extracted video frames),
 *   4. acks each item the instant its file is saved (the app's progress ring
 *      fills in sync with Fast Refresh), then captures an AFTER screenshot and
 *      writes a history entry.
 *
 * No need to switch to Claude Code — Send just applies.
 *
 * System tools used when present (degrade gracefully if missing):
 *   - `claude`  (required) — applies the edits
 *   - `xcrun simctl` — before/after screenshots for history
 *   - `ffmpeg` / `ffprobe` — extract frames from attached videos
 */

import { spawn, spawnSync } from 'node:child_process'
import { promises as fs, statSync } from 'node:fs'
import * as path from 'node:path'
import { createQueueClient } from './queue-client'

export interface ApplyWatcherOptions {
  metroHost?: string
  pollMs?: number
  claudeBin?: string
  /** Working directory (project root). Defaults to cwd. */
  cwd?: string
  /** Extra flags passed to `claude`. */
  claudeArgs?: string[]
  /** Override the simulator UDID (else auto-detected from booted devices). */
  simUdid?: string
  /** Skip the post-apply full reload (keeps Fast Refresh + nav state). */
  noReload?: boolean
}

interface MediaRef {
  type: 'image' | 'video'
  url: string
  name?: string
}
interface Annotation {
  id: string
  comment: string
  fallback?: boolean
  route?: string | null
  media?: MediaRef[]
  element: {
    component: string
    tree?: string[]
    source: { file: string; line: number; column?: number } | null
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function gitOut(cwd: string, args: string[]): string | null {
  try {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
    if (r.status !== 0) return null
    return (r.stdout ?? '').replace(/\n$/, '')
  } catch {
    return null
  }
}

/**
 * A ref capturing the working tree's CURRENT state (tracked files), so we can
 * read any file's pre-edit content later via `git show <ref>:<file>`.
 * `stash create` snapshots staged+unstaged tracked changes without touching the
 * working tree or the stash list. Falls back to HEAD (clean tree) or null.
 */
function gitSnapshotRef(cwd: string): string | null {
  const created = gitOut(cwd, ['stash', 'create'])
  if (created) return created.trim()
  return gitOut(cwd, ['rev-parse', 'HEAD'])
}

function gitUntracked(cwd: string): Set<string> {
  const out = gitOut(cwd, ['ls-files', '--others', '--exclude-standard'])
  return new Set((out ?? '').split('\n').filter(Boolean))
}

/** Tracked files that differ between `ref` and the current working tree. */
function gitChangedSince(cwd: string, ref: string): string[] {
  const out = gitOut(cwd, ['diff', '--name-only', ref, '--'])
  return (out ?? '').split('\n').filter(Boolean)
}

function gitShow(cwd: string, ref: string, file: string): string | null {
  return gitOut(cwd, ['show', `${ref}:${file}`])
}

function which(bin: string): boolean {
  try {
    return spawnSync('which', [bin], { stdio: 'ignore' }).status === 0
  } catch {
    return false
  }
}

function detectUdid(override?: string): string | null {
  if (override) return override
  try {
    const out = spawnSync('xcrun', ['simctl', 'list', 'devices', 'booted'], {
      encoding: 'utf8',
    }).stdout
    const m = /\(([0-9A-F-]{36})\)\s*\(Booted\)/.exec(out ?? '')
    return m ? m[1]! : null
  } catch {
    return null
  }
}

function screenshot(udid: string, outPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('xcrun', ['simctl', 'io', udid, 'screenshot', outPath], { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('exit', (code) => resolve(code === 0))
  })
}

/**
 * Trigger a full RN reload via Metro's `/message` websocket. Fast Refresh alone
 * crashes (redbox) when an edit introduces a brand-new image asset or a new
 * `require`/import — the change only appears after a manual kill+relaunch. A
 * reload re-requests the bundle so the new asset/module resolves cleanly and
 * the change shows in real time. Best-effort: never throws or blocks for long.
 */
function triggerReload(metroHost: string): Promise<void> {
  return new Promise((resolve) => {
    const wsUrl = metroHost.replace(/^http/, 'ws').replace(/\/$/, '') + '/message'
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve()
    }
    try {
      // Node 22+ exposes a global WebSocket.
      const WS = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket
      if (!WS) return done()
      const ws = new WS(wsUrl)
      ws.onopen = () => {
        try {
          ws.send(JSON.stringify({ version: 2, method: 'reload' }))
        } catch {
          /* ignore */
        }
        setTimeout(() => {
          try {
            ws.close()
          } catch {
            /* ignore */
          }
          done()
        }, 400)
      }
      ws.onerror = () => done()
      setTimeout(done, 2000)
    } catch {
      done()
    }
  })
}

/**
 * Module/asset specifiers `import`ed or `require`d in a source file.
 */
function importSpecifiers(src: string): Set<string> {
  const out = new Set<string>()
  const re = /(?:import\s[^'"]*?from\s*|import\s*|require\s*\(\s*)['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) out.add(m[1]!)
  return out
}

/**
 * Decide whether an edit needs a FULL reload vs Fast Refresh. Fast Refresh
 * handles ordinary edits (including adding a remote-URL <Image>) smoothly and
 * keeps navigation state. It struggles when the module graph CHANGES — a new
 * import/asset redboxes until reload, and REMOVING an import/asset (e.g.
 * deleting an image) can flash a transient error mid-refresh. So we reload
 * whenever the import/require specifier set changes in EITHER direction.
 */
function needsReload(before: string | null, after: string | null): boolean {
  if (before == null || after == null) return false
  const b = importSpecifiers(before)
  const a = importSpecifiers(after)
  if (a.size !== b.size) return true
  for (const spec of a) if (!b.has(spec)) return true
  return false
}

function mtimeOf(file: string): number {
  try {
    return statSync(file).mtimeMs
  } catch {
    return 0
  }
}

async function waitForMtimeChange(file: string, base: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (mtimeOf(file) > base) return true
    await sleep(200)
  }
  return false
}

// ─── media (images + video frame extraction) ─────────────────────────────

function videoDurationSec(file: string): number {
  try {
    const out = spawnSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
      { encoding: 'utf8' },
    ).stdout
    const n = parseFloat((out ?? '').trim())
    return isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

function extractFrames(video: string, count: number, outDir: string, prefix: string): string[] {
  const dur = videoDurationSec(video)
  const frames: string[] = []
  if (dur <= 0 || !which('ffmpeg')) return frames
  for (let i = 0; i < count; i++) {
    const t = (dur * (i + 0.5)) / count
    const out = path.join(outDir, `${prefix}-frame${i + 1}.png`)
    const r = spawnSync('ffmpeg', ['-y', '-ss', t.toFixed(2), '-i', video, '-frames:v', '1', out], {
      stdio: 'ignore',
    })
    if (r.status === 0) frames.push(out)
  }
  return frames
}

/**
 * Local file path for an uploaded media URL. The URL is
 * `…/__agentation__/media/<seg>/<file>`; the `<seg>` namespace is chosen by the
 * probe at upload time (a per-capture id), independent of the batch id, so we
 * parse both segments straight from the URL.
 */
function mediaLocalPath(storage: string, url: string): { dir: string; file: string } | null {
  const m = /\/__agentation__\/media\/([^/]+)\/([^/]+)$/.exec(url)
  if (!m) return null
  return { dir: path.join(storage, 'media', m[1]!), file: m[2]! }
}

function resolveMediaImages(storage: string, media: MediaRef[] | undefined): string[] {
  if (!media?.length) return []
  const imgs: string[] = []
  for (const m of media) {
    const loc = mediaLocalPath(storage, m.url)
    if (!loc) continue
    const local = path.join(loc.dir, loc.file)
    if (m.type === 'image') {
      imgs.push(local)
    } else {
      const sec = videoDurationSec(local)
      const count = Math.min(10, Math.max(5, Math.round(sec / 3) || 5))
      imgs.push(...extractFrames(local, count, loc.dir, path.basename(local, path.extname(local))))
    }
  }
  return imgs
}

// ─── prompt + claude ──────────────────────────────────────────────────────

function itemPrompt(a: Annotation, mediaImages: string[]): string {
  const where = a.element.source
    ? `File: ${a.element.source.file} (around line ${a.element.source.line})`
    : `No resolved file — grep the codebase for the component \`${a.element.component}\`` +
      (a.element.tree?.length ? ` (render tree: ${a.element.tree.join(' > ')})` : '')
  const lines = [
    'You are applying a single UI annotation captured by Re-agentation in a',
    'React Native app. Make the MINIMAL edit that satisfies the request — no',
    'refactors, no unrelated changes, no new files.',
    '',
    `Component: ${a.element.component}`,
    where,
    `Requested change: "${a.comment}"`,
  ]
  if (mediaImages.length) {
    lines.push(
      '',
      'The user attached reference image(s) — READ them to understand the intended',
      'look, then apply the change to match:',
      ...mediaImages.map((p) => `  - ${p}`),
    )
  }
  lines.push(
    '',
    'Guidelines so the change loads without a crash (the app auto-reloads after',
    'you finish, so new assets/imports WILL resolve):',
    '- Make the edit complete and syntactically valid in a SINGLE pass (never',
    '  leave a half-written import/JSX that would redbox on save).',
    '- For an image with no attached asset, use a stable remote https URL via',
    '  `<Image source={{ uri: "https://…" }} style={{ width, height }} />` rather',
    '  than requiring a local file that does not exist yet.',
    '- If the request needs a package that is NOT already a dependency, do NOT',
    '  import it blindly — first install it (the dep must exist before import),',
    '  or implement the effect with React Native Animated / already-installed libs.',
    '',
    'Edit the file now. Reply with a one-line summary when done.',
  )
  return lines.join('\n')
}

function runClaude(prompt: string, opts: ApplyWatcherOptions): Promise<number> {
  const bin = opts.claudeBin ?? 'claude'
  const args = ['-p', prompt, '--permission-mode', 'acceptEdits', ...(opts.claudeArgs ?? [])]
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd: opts.cwd ?? process.cwd(),
      stdio: ['ignore', 'inherit', 'inherit'],
      env: process.env,
    })
    child.on('error', (err) => {
      console.error(`[re-agentation-apply] failed to spawn '${bin}':`, err.message)
      resolve(1)
    })
    child.on('exit', (code) => resolve(code ?? 0))
  })
}

// ─── per-item apply ─────────────────────────────────────────────────────

async function applyItem(
  item: Annotation,
  batchId: string,
  opts: ApplyWatcherOptions,
  ctx: { storage: string; udid: string | null; queue: ReturnType<typeof createQueueClient> },
): Promise<void> {
  const cwd = opts.cwd ?? process.cwd()
  // Keep the project-relative path for the stash/history meta (clean display +
  // matches how the Metro-side stores resolve it), but use an absolute path for
  // our own fs reads so they don't depend on this process's cwd.
  const file = item.element.source?.file ?? null
  const absFile = file ? (path.isAbsolute(file) ? file : path.resolve(cwd, file)) : null
  const entryId = `${Date.now().toString(36)}-${item.id.slice(0, 8)}`
  const histDir = path.join(ctx.storage, 'history', entryId)
  await fs.mkdir(histDir, { recursive: true })

  // BEFORE screenshot
  if (ctx.udid) await screenshot(ctx.udid, path.join(histDir, 'before.png'))

  // Snapshot the working tree BEFORE editing so Undo can revert EVERY file
  // Claude touches — not just the file the user pinned. (Claude often edits a
  // different file: e.g. an i18n-driven component's copy lives in a locale
  // JSON.) `git show <snapRef>:<file>` later yields each file's pre-edit bytes.
  const snapRef = gitSnapshotRef(cwd)
  const untrackedBefore = snapRef ? gitUntracked(cwd) : new Set<string>()

  const base = absFile ? mtimeOf(absFile) : 0
  const mediaImages = resolveMediaImages(ctx.storage, item.media)
  const claudeDone = runClaude(itemPrompt(item, mediaImages), opts)

  // Ack as soon as EITHER the file is written (keeps the bar in sync with Fast
  // Refresh) OR claude exits (so an item that needs no file change — or a
  // cancelled / failed one — never blocks the queue for 60s). Whichever first.
  let acked = false
  const ack = async () => {
    if (acked) return
    acked = true
    try {
      await ctx.queue.ack({ batchId, itemIds: [item.id] })
    } catch {
      /* ignore */
    }
  }
  if (absFile) {
    await Promise.race([
      waitForMtimeChange(absFile, base, 60_000).then(() => undefined),
      claudeDone.then(() => undefined),
    ])
    await ack()
  }
  await claudeDone
  await ack() // no-op if already acked (covers the no-file / fallback case)

  // Build the Undo/Redo stash from what Claude ACTUALLY changed (every file):
  // `before` (for Undo) + `after` (for Redo) per file. Also decide whether a
  // full reload is needed (new import/asset).
  const readNow = async (f: string): Promise<string | null> => {
    try {
      return await fs.readFile(path.resolve(cwd, f), 'utf8')
    } catch {
      return null
    }
  }
  const undoFiles: Array<{ file: string; before: string | null; after: string | null }> = []
  let addedImportOrAsset = false
  if (snapRef) {
    const changed = gitChangedSince(cwd, snapRef)
    for (const f of changed) {
      const before = gitShow(cwd, snapRef, f)
      if (before == null) continue
      const after = await readNow(f)
      undoFiles.push({ file: f, before, after })
      if (needsReload(before, after)) addedImportOrAsset = true
    }
    const untrackedAfter = gitUntracked(cwd)
    for (const f of untrackedAfter) {
      if (!untrackedBefore.has(f)) {
        // new file → undo deletes it (before=null), redo re-creates it (after)
        undoFiles.push({ file: f, before: null, after: await readNow(f) })
        addedImportOrAsset = true
      }
    }
  } else if (absFile) {
    // Fallback (not a git repo): stash just the pinned file.
    const before = await fs.readFile(absFile, 'utf8').catch(() => null)
    if (before != null) undoFiles.push({ file: file!, before, after: await readNow(file!) })
  }
  if (undoFiles.length) {
    try {
      const undoDir = path.join(ctx.storage, 'undo', batchId)
      await fs.mkdir(undoDir, { recursive: true })
      await fs.writeFile(
        path.join(undoDir, `${item.id}.json`),
        JSON.stringify({ files: undoFiles }),
      )
    } catch {
      /* ignore */
    }
  }

  // Reload ONLY when the edit added a new import / local asset — Fast Refresh
  // can't add those and would redbox (the crash the user hit). Ordinary edits
  // (incl. a remote-URL <Image>, an i18n copy change) reflow via Fast Refresh,
  // keeping nav state and avoiding a disruptive reload flash.
  let reloaded = false
  if (!opts.noReload && addedImportOrAsset) {
    console.log('[re-agentation-apply]   new import/asset detected → full reload')
    await triggerReload(opts.metroHost ?? 'http://localhost:8081')
    await sleep(2800)
    reloaded = true
  }
  if (!reloaded) await sleep(1200) // let Fast Refresh repaint
  if (ctx.udid) await screenshot(ctx.udid, path.join(histDir, 'after.png'))
  const meta = {
    id: entryId,
    ts: new Date().toISOString(),
    batchId,
    itemId: item.id,
    component: item.element.component,
    comment: item.comment,
    file,
    line: item.element.source?.line ?? null,
    route: item.route ?? null,
    changedFiles: undoFiles.map((u) => u.file),
    status: 'applied',
  }
  await fs.writeFile(path.join(histDir, 'meta.json'), JSON.stringify(meta, null, 2))
}

// ─── main loop ──────────────────────────────────────────────────────────

export async function runApplyWatcher(opts: ApplyWatcherOptions = {}): Promise<void> {
  const metroHost = (opts.metroHost ?? 'http://localhost:8081').replace(/\/$/, '')
  const pollMs = opts.pollMs ?? 1200
  const cwd = opts.cwd ?? process.cwd()
  const storage = path.join(cwd, '.agentation')
  const queue = createQueueClient({ metroHost })
  const udid = detectUdid(opts.simUdid)
  const seen = new Set<string>()

  console.log(`[re-agentation-apply] watching ${metroHost} (cwd: ${cwd})`)
  console.log(`[re-agentation-apply] simulator: ${udid ?? 'none (history screenshots disabled)'}`)
  if (!which('ffmpeg'))
    console.log('[re-agentation-apply] ffmpeg not found — video frames disabled')
  console.log('[re-agentation-apply] Send in the app → changes auto-apply. Ctrl+C to stop.')

  type Batch = { batchId: string; payload?: { items?: Annotation[] } }
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let batch: Batch | null = null
    try {
      batch = (await queue.nextBatch()) as Batch | null
    } catch {
      /* metro down / restarting */
    }
    if (batch && !seen.has(batch.batchId)) {
      seen.add(batch.batchId)
      const items = batch.payload?.items ?? []
      console.log(`\n[re-agentation-apply] batch ${batch.batchId} — ${items.length} change(s)`)
      for (const item of items) {
        console.log(`  → ${item.element.component}: ${item.comment}`)
        await applyItem(item, batch.batchId, opts, { storage, udid, queue })
      }
      console.log(`[re-agentation-apply] batch ${batch.batchId} applied ✓`)
    }
    await sleep(pollMs)
  }
}

function parseFlag(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1]
  return undefined
}

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
  const cwd = parseFlag('--cwd')
  const simUdid = parseFlag('--udid')
  const noReload = process.argv.includes('--no-reload')
  runApplyWatcher({ metroHost, cwd, simUdid, noReload }).catch((err) => {
    console.error('[re-agentation-apply] fatal:', err)
    process.exit(1)
  })
}
