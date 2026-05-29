# @re-agentation/metro

## 0.2.0

### Minor Changes

- v0.2.0 — History, reliable Undo/Redo, and a little magic.

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
