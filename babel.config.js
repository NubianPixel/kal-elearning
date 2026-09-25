module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Lets src/db/progress.ts import drizzle migration SQL files as plain
      // strings (the expo-sqlite migrator needs their contents at runtime).
      'babel-plugin-extract-import',
    ],
  };
};
