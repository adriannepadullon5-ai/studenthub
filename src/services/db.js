import * as SQLite from 'expo-sqlite';

/** Single shared connection to the app database. */
export const db = SQLite.openDatabaseSync('studenthub.db');

/**
 * Philippine tertiary grading scale and reasonable unit bounds.
 * Exported so the UI validates and describes input consistently.
 */
export const GRADE_MIN = 1.0;
export const GRADE_MAX = 5.0;
export const UNITS_MIN = 1;
export const UNITS_MAX = 12;

/** The add form does not capture a category, so new subjects fall back to this. */
export const DEFAULT_CATEGORY = 'Lab · Lecture';

/** The 5 subjects shown on the Grades screen, used to seed a fresh database. */
const SEED_GRADES = [
  { name: 'ITMSD1: Mobile Design and Tools', category: 'Lab · Lecture', grade: 1.25, units: 3 },
  { name: 'ITP131: Networking 2', category: 'Lab · Lecture', grade: 1.75, units: 3 },
  { name: 'ITP130: Social and Professional I...', category: 'Lab · Lecture', grade: 1.75, units: 3 },
  { name: 'ITP132: Advance Database System', category: 'Lab · Lecture', grade: 1.5, units: 3 },
  { name: 'ITPFE1: Web System & Technologies', category: 'Lab · Lecture', grade: 1.5, units: 3 },
];

/**
 * Creates the grades table and seeds it exactly once.
 *
 * Seeding is tracked with `PRAGMA user_version` rather than a bare row count,
 * so deleting every subject does not silently respawn the mock rows on the next
 * launch. Safe and cheap to call on every mount.
 */
export function initDatabase() {
  const versionRow = db.getFirstSync('PRAGMA user_version');
  const version = versionRow ? versionRow.user_version : 0;
  if (version >= 1) {
    return;
  }

  db.execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      grade REAL NOT NULL,
      units INTEGER NOT NULL
    );
  `);

  // Only seed a table that is genuinely empty (fresh install / first upgrade).
  const countRow = db.getFirstSync('SELECT COUNT(*) AS count FROM grades');
  const count = countRow ? countRow.count : 0;

  if (count === 0) {
    for (const subject of SEED_GRADES) {
      db.runSync(
        'INSERT INTO grades (name, category, grade, units) VALUES (?, ?, ?, ?)',
        [subject.name, subject.category, subject.grade, subject.units]
      );
    }
  }

  // Mark the seed as done so the mock data is only ever inserted once.
  db.execSync('PRAGMA user_version = 1');
}
