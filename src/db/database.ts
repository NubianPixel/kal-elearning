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
      await seedIfEmpty(db);
      return db;
    })();
  }
  return dbPromise;
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
      'INSERT INTO categories (language_id, name, emoji) VALUES (?, ?, ?)',
      [lang.lastInsertRowId, c.name, c.emoji],
    );
    categoryIds.set(c.name, res.lastInsertRowId);
  }

  for (const v of SEED_VOCABULARY) {
    await db.runAsync(
      `INSERT INTO vocabulary (language_id, category_id, target_text, translation, difficulty)
       VALUES (?, ?, ?, ?, ?)`,
      [lang.lastInsertRowId, categoryIds.get(v.category)!, v.targetText, v.translation, v.difficulty],
    );
  }
}
