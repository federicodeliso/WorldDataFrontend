import initSqlJs from 'sql.js';

let localDb: any = null;
const API = "http://127.0.0.1:8000";

// Call this from your mobile file picker
export async function loadLocalDatabaseFile(file: File) {
  const SQL = await initSqlJs({
    locateFile: (filename) => `/${filename}`
  });
  const buffer = await file.arrayBuffer();
  localDb = new SQL.Database(new Uint8Array(buffer));
  localStorage.setItem("has_local_db", "true");
}

export function hasLocalDb(): boolean {
  return localDb !== null;
}

// Custom fetch replacement that works for both Laptop (Python) and Mobile (sql.js)
export async function smartFetch(url: string, options?: RequestInit): Promise<Response> {
  // If we are running offline on mobile and have loaded the local db
  if (localDb && (url.includes('/stats') || url.includes('/indicators') || url.includes('/categories'))) {
    try {
      let data: any = null;

      if (url.includes('/stats')) {
        const entities = localDb.exec("SELECT COUNT(DISTINCT country_code) FROM observations")[0]?.values[0][0] || 0;
        const indicators = localDb.exec("SELECT COUNT(*) FROM indicators")[0]?.values[0][0] || 0;
        const observations = localDb.exec("SELECT COUNT(*) FROM observations")[0]?.values[0][0] || 0;
        const years = localDb.exec("SELECT MIN(year), MAX(year) FROM observations")[0]?.values[0] || [2000, 2026];
        data = { entities: Number(entities), indicators: Number(indicators), observations: Number(observations), min_year: Number(years[0]), max_year: Number(years[1]) };
      } 
      else if (url.includes('/indicators')) {
        const res = localDb.exec("SELECT indicator_id, code, name, description, unit, frequency, category FROM indicators LIMIT 500");
        data = res.length ? res[0].values.map((r: any) => ({ indicator_id: r[0], code: r[1], name: r[2], description: r[3], unit: r[4], frequency: r[5], category: r[6] })) : [];
      } 
      else if (url.includes('/categories')) {
        const res = localDb.exec("SELECT category, COUNT(*) as indicator_count FROM indicators GROUP BY category");
        data = res.length ? res[0].values.map((r: any) => ({ category: r[0] || "Uncategorized", indicator_count: Number(r[1]) })) : [];
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      console.error("Local SQL execution error:", e);
    }
  }

  // Otherwise, default to your regular Python backend fetch
  return fetch(url, options);
}