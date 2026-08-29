/**
 * Metro configuration for Expo (TypeScript).
 *
 * The `wasm` asset extension + COOP/COEP headers are required by
 * expo-sqlite's web (WASM) implementation so the app can also run in a
 * browser for quick testing.
 *
 * Node 24 loads TypeScript config files natively (type stripping), and
 * Metro's own loader searches `.ts`/`.cts`/`.mts` for `metro.config.*`
 * (SEARCH_TS_EXTS). This file is intentionally excluded from the app's
 * `tsc --noEmit` type-check — the same way `expo/tsconfig.base.json`
 * excludes `metro.config.js` — because it is Node/tooling code, not app
 * code, and has no `@types/node` globals in this project's compiler.
 */
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
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
