/* eslint-env node */
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')
const { withReagentation } = require('@re-agentation/metro')

const baseConfig = getDefaultConfig(__dirname)

module.exports = withReagentation(mergeConfig(baseConfig, {}))
