import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import "./Ranking.css";

const API =
  "https://worlddataapi-kf6d.onrender.com";

type Country = {
  name?: string;
  country_name?: string;
  code?: string;
  iso3?: string;
};

type Indicator = {
  indicator_id?: number;
  code: string;
  name?: string;
  unit?: string | null;
};

type RankingRow = {
  country: string;
  year: number;
  values: Record<string, number>;
};

type Direction = "top" | "bottom";

type RegionFilter = "all" | "oecd";

/* =========================================================
   OECD MEMBERS
   ========================================================= */

const OECD_COUNTRIES = new Set([
  "Australia",
  "Austria",
  "Belgium",
  "Canada",
  "Chile",
  "Colombia",
  "Costa Rica",
  "Czech Republic",
  "Czechia",
  "Denmark",
  "Estonia",
  "Finland",
  "France",
  "Germany",
  "Greece",
  "Hungary",
  "Iceland",
  "Ireland",
  "Israel",
  "Italy",
  "Japan",
  "Korea",
  "South Korea",
  "Latvia",
  "Lithuania",
  "Luxembourg",
  "Mexico",
  "Netherlands",
  "New Zealand",
  "Norway",
  "Poland",
  "Portugal",
  "Slovakia",
  "Slovenia",
  "Spain",
  "Sweden",
  "Switzerland",
  "Türkiye",
  "Turkey",
  "United Kingdom",
  "United States",
]);

/* =========================================================
   HELPERS
   ========================================================= */

function getCountryName(country: Country) {
  return (
    country.name ??
    country.country_name ??
    country.code ??
    country.iso3 ??
    ""
  );
}

function isOECDCountry(country: Country) {
  const name = getCountryName(country).trim();

  if (OECD_COUNTRIES.has(name)) {
    return true;
  }

  const normalized = name.toLowerCase();

  return (
    normalized === "czech republic" ||
    normalized === "czechia" ||
    normalized === "south korea" ||
    normalized === "korea" ||
    normalized === "turkey" ||
    normalized === "türkiye"
  );
}

function formatValue(value: number) {
  const absolute = Math.abs(value);

  if (absolute >= 1_000_000_000_000) {
    return `${(
      value / 1_000_000_000_000
    ).toFixed(2)}T`;
  }

  if (absolute >= 1_000_000_000) {
    return `${(
      value / 1_000_000_000
    ).toFixed(2)}B`;
  }

  if (absolute >= 1_000_000) {
    return `${(
      value / 1_000_000
    ).toFixed(2)}M`;
  }

  if (absolute >= 1_000) {
    return `${(
      value / 1_000
    ).toFixed(2)}K`;
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

/* =========================================================
   COMPONENT
   ========================================================= */

function Ranking() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);

  const [selectedIndicators, setSelectedIndicators] =
    useState<string[]>(["GDP"]);

  const [selectedYear, setSelectedYear] =
    useState(2024);

  const [direction, setDirection] =
    useState<Direction>("top");

  const [limit, setLimit] = useState(10);

  const [regionFilter, setRegionFilter] =
    useState<RegionFilter>("all");

  const [data, setData] = useState<RankingRow[]>([]);

  const [loading, setLoading] = useState(true);

  const [rankingLoading, setRankingLoading] =
    useState(false);

  const [error, setError] = useState("");

  /* =======================================================
     LOAD METADATA
     ======================================================= */

  useEffect(() => {
    async function loadMetadata() {
      try {
        setLoading(true);
        setError("");

        const [
          countriesResponse,
          indicatorsResponse,
        ] = await Promise.all([
          fetch(`${API}/countries?limit=500`),
          fetch(`${API}/indicators?limit=500`),
        ]);

        if (!countriesResponse.ok) {
          throw new Error(
            "Could not load countries."
          );
        }

        if (!indicatorsResponse.ok) {
          throw new Error(
            "Could not load indicators."
          );
        }

        const countriesJson =
          await countriesResponse.json();

        const indicatorsJson =
          await indicatorsResponse.json();

        const countryRows = Array.isArray(
          countriesJson
        )
          ? countriesJson
          : countriesJson.results ??
            countriesJson.data ??
            [];

        const indicatorRows =
          Array.isArray(indicatorsJson)
            ? indicatorsJson
            : indicatorsJson.results ??
              indicatorsJson.data ??
              [];

        setCountries(countryRows);
        setIndicators(indicatorRows);

        /*
         * Prefer GDP when available.
         */

        if (
          indicatorRows.length > 0 &&
          !indicatorRows.some(
            (item: Indicator) =>
              item.code === "GDP"
          )
        ) {
          setSelectedIndicators([
            indicatorRows[0].code,
          ]);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load ranking metadata."
        );
      } finally {
        setLoading(false);
      }
    }

    loadMetadata();
  }, []);

  /* =======================================================
     COUNTRIES AVAILABLE FOR CURRENT FILTER
     ======================================================= */

  const filteredCountries = useMemo(() => {
    if (regionFilter === "all") {
      return countries;
    }

    return countries.filter(isOECDCountry);
  }, [countries, regionFilter]);

  /* =======================================================
     LOAD RANKING DATA
     ======================================================= */

  useEffect(() => {
    if (
      filteredCountries.length === 0 ||
      selectedIndicators.length === 0
    ) {
      setData([]);
      return;
    }

    async function loadRankingData() {
      try {
        setRankingLoading(true);
        setError("");

        const countryNames =
          filteredCountries
            .map(getCountryName)
            .filter(Boolean);

        /*
         * Load every country × indicator combination
         * in parallel.
         */

        const countryResults =
          await Promise.all(
            countryNames.map(async (country) => {
              const values: Record<
                string,
                number
              > = {};

              await Promise.all(
                selectedIndicators.map(
                  async (indicatorCode) => {
                    try {
                      const response =
                        await fetch(
                          `${API}/data/${encodeURIComponent(
                            country
                          )}/${encodeURIComponent(
                            indicatorCode
                          )}`
                        );

                      if (!response.ok) {
                        return;
                      }

                      const json =
                        await response.json();

                      const rows =
                        Array.isArray(json)
                          ? json
                          : json.results ??
                            json.data ??
                            [];

                      const row = rows.find(
                        (item: any) =>
                          Number(item.year) ===
                          selectedYear
                      );

                      if (!row) {
                        return;
                      }

                      const value = Number(
                        row.value
                      );

                      if (
                        Number.isFinite(value)
                      ) {
                        values[indicatorCode] =
                          value;
                      }
                    } catch {
                      /*
                       * One missing country/indicator
                       * should not break the entire chart.
                       */
                    }
                  }
                )
              );

              /*
               * A country must have at least one
               * valid selected indicator.
               */

              if (
                Object.keys(values).length === 0
              ) {
                return null;
              }

              return {
                country,
                year: selectedYear,
                values,
              };
            })
          );

        setData(
          countryResults.filter(
            (
              row
            ): row is RankingRow =>
              row !== null
          )
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load ranking data."
        );

        setData([]);
      } finally {
        setRankingLoading(false);
      }
    }

    loadRankingData();
  }, [
    filteredCountries,
    selectedIndicators,
    selectedYear,
  ]);

  /* =======================================================
     RANKING VALUE
     ======================================================= */

  const primaryIndicator =
    selectedIndicators[0];

  const sortedData = useMemo(() => {
    const sorted = [...data].sort(
      (a, b) => {
        const aValue =
          a.values[primaryIndicator];

        const bValue =
          b.values[primaryIndicator];

        if (
          aValue === undefined &&
          bValue === undefined
        ) {
          return 0;
        }

        if (aValue === undefined) {
          return 1;
        }

        if (bValue === undefined) {
          return -1;
        }

        return direction === "top"
          ? bValue - aValue
          : aValue - bValue;
      }
    );

    return sorted.map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
  }, [
    data,
    direction,
    primaryIndicator,
  ]);

  /* =======================================================
     VISIBLE DATA
     ======================================================= */

  const visibleData = useMemo(
    () =>
      sortedData.slice(
        0,
        Math.min(limit, sortedData.length)
      ),
    [sortedData, limit]
  );

  /* =======================================================
     INDICATOR INFORMATION
     ======================================================= */

  const selectedIndicatorInfo =
    selectedIndicators.map(
      (code) =>
        indicators.find(
          (item) => item.code === code
        )
    );

  /* =======================================================
     ITALY
     ======================================================= */

  const italy = sortedData.find(
    (row) =>
      row.country.toLowerCase() ===
      "italy"
  );

  const italyRank = italy?.rank ?? null;

  /* =======================================================
     CHART DATA
     ======================================================= */

  const chartData = visibleData.map((row) => ({
    country: row.country,
    ...row.values,
  }));

  /* =======================================================
     AVAILABLE INDICATORS FOR ADD BUTTON
     ======================================================= */

  const availableIndicators = indicators.filter(
    (indicator) =>
      !selectedIndicators.includes(
        indicator.code
      )
  );

  /* =======================================================
     ADD INDICATOR
     ======================================================= */

  function addIndicator(code: string) {
    if (!code) {
      return;
    }

    if (
      selectedIndicators.includes(code)
    ) {
      return;
    }

    setSelectedIndicators([
      ...selectedIndicators,
      code,
    ]);
  }

  /* =======================================================
     REMOVE INDICATOR
     ======================================================= */

  function removeIndicator(code: string) {
    if (selectedIndicators.length <= 1) {
      return;
    }

    setSelectedIndicators(
      selectedIndicators.filter(
        (item) => item !== code
      )
    );
  }

  /* =======================================================
     LOADING
     ======================================================= */

  if (loading) {
    return (
      <section className="ranking-page">
        <div className="ranking-loading">
          <Loader2
            className="spin"
            size={18}
          />
          Loading WorldData...
        </div>
      </section>
    );
  }

  /* =======================================================
     RENDER
     ======================================================= */

  return (
    <section className="ranking-page">

      {/* ===================================================
          HEADER
          =================================================== */}

      <div className="ranking-heading">

        <div>
          <div className="eyebrow">
            WORLD DATA · COMPARISON
          </div>

          <h1>Ranking</h1>

          <p>
            Compare countries by indicator,
            year and economic group.
          </p>
        </div>

        {italy && (
          <div className="italy-rank-card">
            <span>ITALY</span>

            <strong>
              #{italyRank}
            </strong>

            <small>
              of {sortedData.length}{" "}
              countries
            </small>
          </div>
        )}

      </div>

      {/* ===================================================
          ERROR
          =================================================== */}

      {error && (
        <div className="ranking-error">
          <strong>
            Unable to load data
          </strong>

          <span>{error}</span>
        </div>
      )}

      {/* ===================================================
          CONTROLS
          =================================================== */}

      <div className="ranking-controls">

        {/* -------------------------------------------------
            INDICATORS
            ------------------------------------------------- */}

        <div className="ranking-control ranking-indicators">

          <label>INDICATORS</label>

          <div className="ranking-indicator-list">

            {selectedIndicators.map(
              (code, index) => {
                const info =
                  indicators.find(
                    (item) =>
                      item.code === code
                  );

                return (
                  <div
                    className="ranking-indicator-chip"
                    key={code}
                  >
                    <select
                      value={code}
                      onChange={(event) => {
                        const newCode =
                          event.target.value;

                        setSelectedIndicators(
                          selectedIndicators.map(
                            (
                              existing,
                              existingIndex
                            ) =>
                              existingIndex ===
                              index
                                ? newCode
                                : existing
                          )
                        );
                      }}
                    >
                      {indicators.map(
                        (indicator) => (
                          <option
                            key={
                              indicator.code
                            }
                            value={
                              indicator.code
                            }
                            disabled={
                              selectedIndicators.includes(
                                indicator.code
                              ) &&
                              indicator.code !==
                                code
                            }
                          >
                            {indicator.code}
                            {indicator.name
                              ? ` — ${indicator.name}`
                              : ""}
                          </option>
                        )
                      )}
                    </select>

                    {selectedIndicators.length >
                      1 && (
                      <button
                        type="button"
                        className="ranking-remove-indicator"
                        onClick={() =>
                          removeIndicator(
                            code
                          )
                        }
                        aria-label={`Remove ${code}`}
                      >
                        <X size={13} />
                      </button>
                    )}

                    {info?.unit && (
                      <span className="ranking-unit">
                        {info.unit}
                      </span>
                    )}
                  </div>
                );
              }
            )}

            {availableIndicators.length >
              0 && (
              <button
                type="button"
                className="ranking-add-indicator"
                onClick={() =>
                  addIndicator(
                    availableIndicators[0]
                      .code
                  )
                }
              >
                <Plus size={13} />
                Add indicator
              </button>
            )}

          </div>
        </div>

        {/* -------------------------------------------------
            YEAR
            ------------------------------------------------- */}

        <div className="ranking-control ranking-year">
          <label>YEAR</label>

          <select
            value={selectedYear}
            onChange={(event) =>
              setSelectedYear(
                Number(event.target.value)
              )
            }
          >
            {Array.from(
              { length: 65 },
              (_, index) =>
                2024 - index
            ).map((year) => (
              <option
                key={year}
                value={year}
              >
                {year}
              </option>
            ))}
          </select>
        </div>

        {/* -------------------------------------------------
            UNIVERSE
            ------------------------------------------------- */}

        <div className="ranking-control ranking-universe">
          <label>COUNTRIES</label>

          <div className="ranking-toggle">

            <button
              type="button"
              className={
                regionFilter === "all"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setRegionFilter("all")
              }
            >
              All
            </button>

            <button
              type="button"
              className={
                regionFilter === "oecd"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setRegionFilter("oecd")
              }
            >
              OECD
            </button>

          </div>
        </div>

        {/* -------------------------------------------------
            ORDER
            ------------------------------------------------- */}

        <div className="ranking-control ranking-order">
          <label>ORDER</label>

          <div className="ranking-toggle">

            <button
              type="button"
              className={
                direction === "top"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setDirection("top")
              }
            >
              <ArrowUp size={13} />
              Highest
            </button>

            <button
              type="button"
              className={
                direction === "bottom"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setDirection("bottom")
              }
            >
              <ArrowDown size={13} />
              Lowest
            </button>

          </div>
        </div>

        {/* -------------------------------------------------
            SHOW
            ------------------------------------------------- */}

        <div className="ranking-control ranking-limit">
          <label>SHOW</label>

          <select
            value={limit}
            onChange={(event) =>
              setLimit(
                Number(event.target.value)
              )
            }
          >
            <option value={5}>
              Top 5
            </option>

            <option value={10}>
              Top 10
            </option>

            <option value={20}>
              Top 20
            </option>

            <option value={30}>
              Top 30
            </option>

            <option value={50}>
              Top 50
            </option>
          </select>
        </div>

      </div>

      {/* ===================================================
          CHART CARD
          =================================================== */}

      <div className="ranking-card">

        <div className="ranking-card-header">

          <div>
            <div className="eyebrow">
              {direction === "top"
                ? "HIGHEST"
                : "LOWEST"}{" "}
              ·{" "}
              {regionFilter === "oecd"
                ? "OECD"
                : "ALL COUNTRIES"}
            </div>

            <h2>
              {selectedIndicators.join(
                " + "
              )}
            </h2>

            <p>
              {selectedIndicatorInfo
                .map(
                  (item) =>
                    item?.name ??
                    item?.code
                )
                .filter(Boolean)
                .join(" · ")}{" "}
              · {selectedYear}
            </p>
          </div>

          <span className="ranking-count">
            {visibleData.length} of{" "}
            {sortedData.length} countries
          </span>

        </div>

        {/* =================================================
            CHART
            ================================================= */}

        <div className="ranking-chart">

          {rankingLoading ? (
            <div className="ranking-loading">
              <Loader2
                className="spin"
                size={18}
              />
              Updating ranking...
            </div>
          ) : chartData.length === 0 ? (
            <div className="ranking-empty">
              <h3>
                No data available
              </h3>

              <p>
                There are no observations
                for the selected indicators
                and year.
              </p>
            </div>
          ) : (
            <ResponsiveContainer
              width="100%"
              height={
                limit >= 50
                  ? 650
                  : limit >= 30
                  ? 570
                  : 470
              }
            >
              <BarChart
                data={chartData}
                margin={{
                  top: 20,
                  right: 25,
                  left: 15,
                  bottom:
                    limit >= 30
                      ? 105
                      : 75,
                }}
              >

                <CartesianGrid
                  vertical={false}
                  stroke="#e8ecf1"
                />

                <XAxis
                  dataKey="country"
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={
                    limit >= 20
                      ? -55
                      : -35
                  }
                  textAnchor="end"
                  height={
                    limit >= 20
                      ? 105
                      : 80
                  }
                  tick={{
                    fontSize:
                      limit >= 30
                        ? 9
                        : 10,
                    fill: "#334155",
                  }}
                />

                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{
                    fontSize: 10,
                    fill: "#64748b",
                  }}
                  tickFormatter={
                    formatValue
                  }
                />

                <Tooltip
                  formatter={(
                    value,
                    name
                  ) => [
                    formatValue(
                      Number(value)
                    ),
                    String(name),
                  ]}
                  labelFormatter={(
                    label
                  ) =>
                    String(label)
                  }
                  contentStyle={{
                    borderRadius: 10,
                    border:
                      "1px solid #e2e8f0",
                    boxShadow:
                      "0 10px 30px rgba(15,23,42,0.12)",
                    fontSize: 12,
                  }}
                />

                {selectedIndicators.map(
                  (
                    indicatorCode,
                    indicatorIndex
                  ) => (
                    <Bar
                      key={indicatorCode}
                      dataKey={
                        indicatorCode
                      }
                      name={
                        indicatorCode
                      }
                      stackId="ranking"
                      radius={
                        indicatorIndex ===
                        selectedIndicators.length -
                          1
                          ? [5, 5, 0, 0]
                          : [0, 0, 0, 0]
                      }
                      barSize={
                        limit >= 50
                          ? 14
                          : limit >= 30
                          ? 17
                          : 22
                      }
                    >
                      {chartData.map(
                        (row) => (
                          <Cell
                            key={`${row.country}-${indicatorCode}`}
                            fill={
                              row.country ===
                              "Italy"
                                ? indicatorIndex ===
                                  0
                                  ? "#dc2626"
                                  : "#f87171"
                                : undefined
                            }
                          />
                        )
                      )}
                    </Bar>
                  )
                )}

              </BarChart>
            </ResponsiveContainer>
          )}

        </div>

        {/* =================================================
            LEGEND
            ================================================= */}

        {!rankingLoading &&
          selectedIndicators.length >
            1 &&
          chartData.length > 0 && (
            <div className="ranking-legend">

              {selectedIndicators.map(
                (code) => {
                  const info =
                    indicators.find(
                      (item) =>
                        item.code === code
                    );

                  return (
                    <div
                      className="ranking-legend-item"
                      key={code}
                    >
                      <span className="ranking-legend-dot" />

                      <strong>
                        {code}
                      </strong>

                      {info?.name && (
                        <span>
                          {info.name}
                        </span>
                      )}
                    </div>
                  );
                }
              )}

            </div>
          )}

        {/* =================================================
            TABLE
            ================================================= */}

        {!rankingLoading &&
          visibleData.length > 0 && (
            <div className="ranking-table">

              <div className="ranking-table-head">

                <span>#</span>

                <span>
                  Country
                </span>

                {selectedIndicators.map(
                  (code) => (
                    <span
                      key={code}
                    >
                      {code}
                    </span>
                  )
                )}

              </div>

              {visibleData.map(
                (row) => (
                  <div
                    className={
                      row.country ===
                      "Italy"
                        ? "ranking-row italy"
                        : "ranking-row"
                    }
                    key={row.country}
                  >

                    <strong>
                      {row.rank}
                    </strong>

                    <span>
                      {row.country}
                    </span>

                    {selectedIndicators.map(
                      (code) => (
                        <span
                          key={`${row.country}-${code}`}
                        >
                          {row.values[
                            code
                          ] !==
                          undefined
                            ? formatValue(
                                row.values[
                                  code
                                ]
                              )
                            : "—"}
                        </span>
                      )
                    )}

                  </div>
                )
              )}

            </div>
          )}

      </div>
    </section>
  );
}

export default Ranking;