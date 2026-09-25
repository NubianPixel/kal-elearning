/**
 * Type shim so `import sqlText from './x.sql?raw'` type-checks. At runtime
 * Metro resolves the `?raw` suffix through its inline requires support and
 * inlines the file's contents as a JS string module — see metro.config.ts
 * (`transformer.babelPlugins`). Used only for the committed drizzle
 * migration files in src/db/migrations/.
 */
declare module '*.sql?raw' {
  const content: string;
  export default content;
}
