/* eslint-env node */
const { getDefaultConfig } = require('expo/metro-config')
const { withReagentation } = require('@re-agentation/metro')

const config = getDefaultConfig(__dirname)

module.exports = withReagentation(config)
