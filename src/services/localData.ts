import initSqlJs from 'sql.js';

let db: any = null;

// Call this when your app boots up to prompt the user for the local database file
export async function initLocalDatabase(file: File): Promise<void> {
  const SQL = await initSqlJs({
    locateFile: (filename) => `/${filename}`
  });
  
  const buffer = await file.arrayBuffer();
  db = new SQL.Database(new Uint8Array(buffer));
  console.log("Local 1.6GB Database loaded into browser memory!");
}

export function isDbInitialized(): boolean {
  return db !== null;
}

// Replicate your Python backend endpoints as local SQL queries
export function getLocalStats() {
  if (!db) return { entities: 0, indicators: 0, observations: 0, min_year: 2000, max_year: 2026 };
  
  // Adjust table names if your SQLite schema differs slightly
  const entities = db.exec("SELECT COUNT(DISTINCT country_code) FROM observations")[0]?.values[0][0] || 0;
  const indicators = db.exec("SELECT COUNT(*) FROM indicators")[0]?.values[0][0] || 0;
  const observations = db.exec("SELECT COUNT(*) FROM observations")[0]?.values[0][0] || 0;
  const years = db.exec("SELECT MIN(year), MAX(year) FROM observations")[0]?.values[0] || [2000, 2026];

  return {
    entities: Number(entities),
    indicators: Number(indicators),
    observations: Number(observations),
    min_year: Number(years[0]),
    max_year: Number(years[1])
  };
}

export function getLocalIndicators(limit = 500) {
  if (!db) return [];
  const res = db.exec(`SELECT indicator_id, code, name, description, unit, frequency, category FROM indicators LIMIT ${limit}`);
  if (!res.length) return [];
  
  return res[0].values.map((row: any) => ({
    indicator_id: row[0],
    code: row[1],
    name: row[2],
    description: row[3],
    unit: row[4],
    frequency: row[5],
    category: row[6],
  }));
}

export function getLocalCategories() {
  if (!db) return [];
  const res = db.exec(`SELECT category, COUNT(*) as indicator_count FROM indicators GROUP BY category`);
  if (!res.length) return [];

  return res[0].values.map((row: any) => ({
    category: row[0] || "Uncategorized",
    indicator_count: Number(row[1])
  }));
}