---
'@re-agentation/probe': patch
'@re-agentation/metro': patch
'@re-agentation/mcp': patch
---

Docs + DX polish (no behavior changes to the published runtime):

- Refresh each package's npm README with the real-flow hero GIF and the
  current, tree-shake-safe setup so the npm pages match the repo.
- `re-agentation-apply` now prints a clear hint when an edit changes
  `package.json` (new dependency → install + restart Metro to pick it up).
- Document known limitations (new deps need a Metro restart; Undo covers
  only tool-made changes; the particle effect is JS-driven Animated).
