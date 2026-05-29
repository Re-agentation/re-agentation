/* eslint-env node */
const path = require('path')
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')
const { withReagentation } = require('@re-agentation/metro')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')
const baseConfig = getDefaultConfig(projectRoot)

const monorepo = {
  // Watch the whole monorepo so Metro can resolve hoisted / pnpm-symlinked deps.
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    unstable_enableSymlinks: true,
  },
}

module.exports = withReagentation(mergeConfig(baseConfig, monorepo))
