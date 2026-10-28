
import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite';

const realFetch = window.fetch.bind(window);
const sqlite = new SQLiteConnection(CapacitorSQLite);

let db: SQLiteDBConnection | null = null;
let dbOpening: Promise<SQLiteDBConnection> | null = null;

export function isNativeMobile(): boolean {
  return Capacitor.getPlatform() !== 'web';
}

async function getDatabase(): Promise<SQLiteDBConnection> {
  if (db) return db;
  if (dbOpening) return dbOpening;

  dbOpening = (async () => {
    const connection = await sqlite.createConnection(
      'worlddata',
      false,
      'no-encryption',
      1,
      false
    );

    try {
      await connection.open();

      const tables = await connection.query(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
      );

      console.log(
        'ACTIVE DATABASE TABLES:',
        JSON.stringify(tables.values ?? [])
      );
    

      db = connection;
      return connection;
    } catch (error) {
      try {
        await sqlite.closeConnection('worlddata', false);
      } catch {
        // Preserve the original error.
      }

      throw error;
    }
  })();

  try {
    return await dbOpening;
  } finally {
    dbOpening = null;
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getLimit(url: URL, defaultLimit: number): number {
  const requested = Number(
    url.searchParams.get('limit') ?? defaultLimit
  );

  if (!Number.isFinite(requested)) return defaultLimit;

  return Math.max(1, Math.min(Math.floor(requested), 5000));
}

export async function smartFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  // The browser version continues using the online API.
  if (!isNativeMobile()) {
    return realFetch(url, options);
  }

  const parsedUrl = new URL(url, window.location.origin);
  const pathname = parsedUrl.pathname.replace(/\/+$/, '');
  const parts = pathname.split('/').filter(Boolean);

  const isStats = pathname.endsWith('/stats');
  const isIndicators = pathname.endsWith('/indicators');
  const isCategories = pathname.endsWith('/categories');
  const isCountries = pathname.endsWith('/countries');

  // Salary calculation endpoints
  const pitIndex = parts.lastIndexOf('pit');
  const pcrIndex = parts.lastIndexOf('pcr');

  const isPit = pitIndex >= 0 && parts.length === pitIndex + 2;
  const isPcr = pcrIndex >= 0 && parts.length === pcrIndex + 2;
  // Expected route: /data/{country}/{indicator}
  const dataIndex = parts.lastIndexOf('data');
  const isData =
    dataIndex >= 0 &&
    parts.length === dataIndex + 3;

  const isSupported =
    isStats ||
    isIndicators ||
    isCategories ||
    isCountries ||
    isData ||
    isPit ||
    isPcr;

  if (!isSupported) {
    return realFetch(url, options);
  }

  if (options?.method && options.method.toUpperCase() !== 'GET') {
    return jsonResponse({ error: 'Method not supported' }, 405);
  }

  try {
    const database = await getDatabase();


    // Personal income tax brackets
    if (isPit) {
      const country = decodeURIComponent(parts[pitIndex + 1]);
      const year = Number(parsedUrl.searchParams.get('year') ?? 2024);
      const currency = parsedUrl.searchParams.get('currency');

      if (!Number.isInteger(year)) {
        return jsonResponse({ error: 'Invalid year' }, 400);
      }

      const result = await database.query(
        `SELECT bracket, lower_bound, upper_bound, tax_rate,
                currency, original_currency
         FROM pit_brackets
         WHERE country_name = ? AND year = ?
         ORDER BY bracket`,
        [country, year]
      );

      return jsonResponse({
        country,
        year,
        currency,
        brackets: result.values ?? [],
      });
    }

    // Social contributions
    if (isPcr) {
      const country = decodeURIComponent(parts[pcrIndex + 1]);
      const year = Number(parsedUrl.searchParams.get('year') ?? 2024);

      if (!Number.isInteger(year)) {
        return jsonResponse({ error: 'Invalid year' }, 400);
      }

      const result = await database.query(
        `SELECT contributor, contribution_type, rate
         FROM social_contributions
         WHERE country_name = ? AND year = ?
         ORDER BY contributor, contribution_type`,
        [country, year]
      );

      return jsonResponse({
        country,
        year,
        contributions: result.values ?? [],
      });
    }


    // 1. Dashboard statistics
    if (isStats) {
      const [
        entitiesRes,
        indicatorsRes,
        observationsRes,
        yearsRes,
      ] = await Promise.all([
        database.query(
          'SELECT COUNT(DISTINCT country_name) AS cnt FROM dataset_values'
        ),
        database.query(
          'SELECT COUNT(*) AS cnt FROM datasets'
        ),
        database.query(
          'SELECT COUNT(*) AS cnt FROM dataset_values'
        ),
        database.query(
          'SELECT MIN(year) AS min_y, MAX(year) AS max_y FROM dataset_values'
        ),
      ]);

      return jsonResponse({
        entities: Number(entitiesRes.values?.[0]?.cnt ?? 0),
        indicators: Number(indicatorsRes.values?.[0]?.cnt ?? 0),
        observations: Number(observationsRes.values?.[0]?.cnt ?? 0),
        min_year: Number(yearsRes.values?.[0]?.min_y ?? 0),
        max_year: Number(yearsRes.values?.[0]?.max_y ?? 0),
      });
    }

    // 2. Indicators: dataset_name is the local indicator code.
    if (isIndicators) {
      const limit = getLimit(parsedUrl, 500);

      const result = await database.query(
        `SELECT dataset_name, dataset_type, description, unit, source
         FROM datasets
         ORDER BY dataset_name
         LIMIT ${limit}`
      );

      const indicators = (result.values ?? []).map(
        (row: Record<string, unknown>, index: number) => ({
          indicator_id: index + 1,
          code: String(row.dataset_name ?? ''),
          name: String(row.dataset_name ?? ''),
          description: row.description ?? null,
          unit: row.unit ?? null,
          frequency: null,
          category: row.dataset_type ?? null,
          source: row.source ?? null,
        })
      );

      return jsonResponse(indicators);
    }

    // 3. Categories
    if (isCategories) {
      const result = await database.query(
        `SELECT dataset_type AS category, COUNT(*) AS indicator_count
         FROM datasets
         WHERE dataset_type IS NOT NULL
           AND TRIM(dataset_type) <> ''
         GROUP BY dataset_type
         ORDER BY dataset_type`
      );

      return jsonResponse(
        (result.values ?? []).map(
          (row: Record<string, unknown>) => ({
            category: String(row.category ?? ''),
            indicator_count: Number(row.indicator_count ?? 0),
          })
        )
      );
    }

    // 4. Countries
    if (isCountries) {
      const limit = getLimit(parsedUrl, 500);

      const result = await database.query(
        `SELECT DISTINCT country_name AS name
         FROM dataset_values
         WHERE country_name IS NOT NULL
           AND TRIM(country_name) <> ''
         ORDER BY country_name
         LIMIT ${limit}`
      );

      return jsonResponse(
        (result.values ?? []).map(
          (row: Record<string, unknown>, index: number) => ({
            country_id: index + 1,
            name: String(row.name ?? ''),
            country_name: String(row.name ?? ''),
          })
        )
      );
    }

    // 5. Time-series observations
    if (isData) {
      const country = decodeURIComponent(parts[dataIndex + 1]);
      const indicator = decodeURIComponent(parts[dataIndex + 2]);

      const result = await database.query(
        `SELECT year, value
         FROM dataset_values
         WHERE country_name = ?
           AND dataset_name = ?
         ORDER BY year`,
        [country, indicator]
      );

      return jsonResponse(
        (result.values ?? []).map(
          (row: Record<string, unknown>) => ({
            country,
            indicator,
            year: Number(row.year),
            value:
              row.value === null || row.value === undefined
                ? null
                : Number(row.value),
          })
        )
      );
    }

    return jsonResponse({ error: 'Unsupported endpoint' }, 404);
  } catch (error: unknown) {
    console.error('NATIVE DB ERROR DETAILS:', error);

    const message =
      error instanceof Error ? error.message : String(error);

    return jsonResponse({ error: message }, 500);
  }
}

export function loadLocalDatabaseFile(): void {
  // The database is already installed in Android's default
  // databases directory.
}

export function hasLocalDb(): boolean {
  return db !== null;
}
