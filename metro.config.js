// Metro configuration for Expo.
// The `wasm` asset extension + COOP/COEP headers are required by
// expo-sqlite's web (WASM) implementation so the app can also run in a
// browser for quick testing.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    middleware(req, res, next);
  },
};

module.exports = config;
