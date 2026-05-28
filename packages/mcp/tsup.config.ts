import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    server: 'src/server.ts',
    'http-server': 'src/http-server.ts',
  },
  format: ['esm', 'cjs'],
  dts: { entry: 'src/index.ts' },
  sourcemap: true,
  clean: true,
  treeshake: true,
  platform: 'node',
  target: 'node20',
  // Mark bin entries as Node executables (adds shebang).
  banner: ({ format }) => {
    if (format === 'cjs') {
      return { js: '#!/usr/bin/env node' }
    }
    return {}
  },
})
