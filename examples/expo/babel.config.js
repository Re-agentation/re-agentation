/* eslint-env node */
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    // Re-agentation relies on @babel/plugin-transform-react-jsx-source which
    // babel-preset-expo enables in dev by default. If you ever need to force it:
    //   plugins: process.env.NODE_ENV === 'development'
    //     ? ['@babel/plugin-transform-react-jsx-source']
    //     : [],
  }
}
