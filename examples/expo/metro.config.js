/* eslint-env node */
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')
const { withReagentation } = require('@re-agentation/metro')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)
// Watch the whole monorepo so Metro can resolve hoisted / pnpm-symlinked deps.
config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
config.resolver.unstable_enableSymlinks = true

module.exports = withReagentation(config)
