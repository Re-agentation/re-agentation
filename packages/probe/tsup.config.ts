import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['react', 'react-native', 'react-native-view-shot'],
  // RN bundler expects platform-neutral output.
  platform: 'neutral',
  target: 'es2022',
})
