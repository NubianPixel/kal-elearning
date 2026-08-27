import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL, DEFAULT_LANGUAGE, SEED_CATEGORIES, SEED_VOCABULARY } from './schema';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Open (once) and migrate the local database. Fully offline. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('kal-elearning.db');
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await db.execAsync(SCHEMA_SQL);
      await migrateCategoryEmojiToIcon(db);
      await migrateVocabularyAddImage(db);
      await migrateSeedIcons(db);
      await seedIfEmpty(db);
      return db;
    })();
  }
  return dbPromise;
}

/**
 * v1.1 migration: the categories table used an `emoji` column; icons are
 * now stored as Ionicons names. Rebuilds the table in place, mapping the
 * six seed glyphs to their icons, with foreign keys temporarily disabled
 * so vocabulary.category_id references survive the rebuild.
 */
async function migrateCategoryEmojiToIcon(db: SQLite.SQLiteDatabase): Promise<void> {
  const cols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(categories)');
  if (cols.length === 0 || !cols.some((c) => c.name === 'emoji')) return;

  // Legacy glyph keys are built from code points so no emoji appears in code.
  const glyph = (...codes: number[]) => String.fromCodePoint(...codes);
  const glyphToIcon: Record<string, string> = {
    [glyph(0x1f44b)]: 'hand-left-outline', // waving hand
    [glyph(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f466)]: 'people-outline', // family
    [glyph(0x1f436)]: 'paw-outline', // dog face
    [glyph(0x1f34e)]: 'nutrition-outline', // red apple
    [glyph(0x1f4e6)]: 'cube-outline', // package
    [glyph(0x1f4ac)]: 'chatbubble-outline', // speech balloon
  };

  const rows = await db.getAllAsync<{ id: number; language_id: number; name: string; emoji: string | null }>(
    'SELECT id, language_id, name, emoji FROM categories',
  );

  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await db.withTransactionAsync(async () => {
      await db.execAsync(
        `CREATE TABLE categories_new (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           language_id INTEGER NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
           name TEXT NOT NULL,
           icon TEXT,
           UNIQUE(language_id, name)
         );`,
      );
      for (const r of rows) {
        await db.runAsync(
          'INSERT INTO categories_new (id, language_id, name, icon) VALUES (?, ?, ?, ?)',
          [r.id, r.language_id, r.name, (r.emoji && glyphToIcon[r.emoji]) || null],
        );
      }
      await db.execAsync('DROP TABLE categories;');
      await db.execAsync('ALTER TABLE categories_new RENAME TO categories;');
    });
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}

/**
 * v1.2 migration: vocabulary gained an optional picture column.
 * ALTER TABLE ADD COLUMN is safe on any SQLite version.
 */
async function migrateVocabularyAddImage(db: SQLite.SQLiteDatabase): Promise<void> {
  const cols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(vocabulary)');
  if (cols.length === 0 || cols.some((c) => c.name === 'image_uri')) return;
  await db.execAsync('ALTER TABLE vocabulary ADD COLUMN image_uri TEXT;');
}

/**
 * v1.3 backfill: give seed words their starter illustrations on devices
 * that seeded before the icon pack existed. Only fills words that still
 * have no picture, so any photo the parent added is preserved.
 */
async function migrateSeedIcons(db: SQLite.SQLiteDatabase): Promise<void> {
  for (const v of SEED_VOCABULARY) {
    if (!v.icon) continue;
    await db.runAsync(
      "UPDATE vocabulary SET image_uri = ? WHERE target_text = ? AND (image_uri IS NULL OR image_uri = '')",
      [`icon:${v.icon}`, v.targetText],
    );
  }
}

async function seedIfEmpty(db: SQLite.SQLiteDatabase): Promise<void> {
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM languages WHERE code = ?',
    [DEFAULT_LANGUAGE.code],
  );

  if (existing) return;

  const lang = await db.runAsync(
    'INSERT INTO languages (code, name) VALUES (?, ?)',
    [DEFAULT_LANGUAGE.code, DEFAULT_LANGUAGE.name],
  );

  const categoryIds = new Map<string, number>();
  for (const c of SEED_CATEGORIES) {
    const res = await db.runAsync(
      'INSERT INTO categories (language_id, name, icon) VALUES (?, ?, ?)',
      [lang.lastInsertRowId, c.name, c.icon],
    );
    categoryIds.set(c.name, res.lastInsertRowId);
  }

  for (const v of SEED_VOCABULARY) {
    await db.runAsync(
      `INSERT INTO vocabulary (language_id, category_id, target_text, translation, difficulty, image_uri)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        lang.lastInsertRowId,
        categoryIds.get(v.category)!,
        v.targetText,
        v.translation,
        v.difficulty,
        v.icon ? `icon:${v.icon}` : null,
      ],
    );
  }
}
