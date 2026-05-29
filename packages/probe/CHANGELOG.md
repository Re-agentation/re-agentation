# @re-agentation/probe

## 0.2.1

### Patch Changes

- 6a893d8: Docs + DX polish (no behavior changes to the published runtime):
  - Refresh each package's npm README with the real-flow hero GIF and the
    current, tree-shake-safe setup so the npm pages match the repo.
  - `re-agentation-apply` now prints a clear hint when an edit changes
    `package.json` (new dependency → install + restart Metro to pick it up).
  - Document known limitations (new deps need a Metro restart; Undo covers
    only tool-made changes; the particle effect is JS-driven Animated).

## 0.2.0

### Minor Changes

- 2186d5a: v0.2.0 — History, reliable Undo/Redo, and a little magic.

  **Probe**
  - New full-screen **History** view: lazy infinite scroll (10/page), search by prompt
    text, and All / Applied / Undo / Failed status tabs.
  - History **detail** with a swipeable before/after carousel (peek + pagination dots),
    **Undo**, **Redo**, and **Delete** (with a confirm modal). Multi-select bulk delete
    in the list.
  - **Magic-dust apply effect**: a purple/gold emitter orbits the changing component's
    border and sprays particles that arc down under gravity and fade out.
  - Image/video attachments in the comment sheet (gallery picker; videos sampled to
    frames for the agent).
  - Reliable outside-tap to minimize sheets (wrap-the-sheet backdrop), batch cap of 3,
    SVG icons throughout, and assorted layout/contrast fixes.

  **Metro**
  - New `history`, `undo`, and `media` stores + endpoints. `/history` supports
    `limit` / `offset` / `q` / `status`; per-entry `undo`, `redo`, and `delete`.

  **MCP / watcher**
  - `re-agentation-apply` now snapshots the working tree with `git` before each edit,
    so **Undo/Redo revert every file the change touched** (not just the tapped one).
  - Acks on file-change _or_ claude-exit (whichever first), so a no-op never stalls the
    queue; triggers a clean full reload only when an edit adds/removes an import or
    asset (no more red-screen flash on image edits); captures before/after screenshots.
