import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Download,
  Loader2,
  Search,
  X,
} from "lucide-react";
import html2canvas from "html2canvas";
import "./Ranking.css";

const API = "https://worlddataapi-kf6d.onrender.com";

type Country = {
  name?: string;
  country_name?: string;
  code?: string;
  iso3?: string;
  oecd?: boolean;
  is_oecd?: boolean;
};

type Indicator = {
  indicator_id?: number;
  code: string;
  name?: string;
  unit?: string | null;
};

type RankingDataRow = {
  country: string;
  year: number;
  [key: string]: string | number;
};

type RankingRow = RankingDataRow & {
  total: number;
  rank: number;
};

const INDICATOR_COLORS = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#ea580c",
  "#64748b",
];

const OECD_FALLBACK = new Set([
  "Australia",
  "Austria",
  "Belgium",
  "Canada",
  "Chile",
  "Colombia",
  "Costa Rica",
  "Czechia",
  "Czech Republic",
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

function getCountryName(country: Country): string {
  return (
    country.name ??
    country.country_name ??
    country.code ??
    country.iso3 ??
    ""
  );
}

function getIndicatorValue(
  row: RankingDataRow | RankingRow | undefined,
  indicatorCode: string
): number {
  if (!row) {
    return 0;
  }

  const value = row[indicatorCode];

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const numericValue = Number(value ?? 0);

  return Number.isFinite(numericValue) ? numericValue : 0;
}

function Ranking() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);

  const [selectedIndicators, setSelectedIndicators] =
    useState<string[]>(["GDP"]);

  const [selectedYear, setSelectedYear] = useState(2024);

  const [direction, setDirection] =
    useState<"top" | "bottom">("top");

  const [limit, setLimit] = useState(10);

  const [oecdOnly, setOecdOnly] = useState(false);

  const [data, setData] = useState<RankingDataRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [error, setError] = useState("");

  const [indicatorOpen, setIndicatorOpen] = useState(false);
  const [indicatorSearch, setIndicatorSearch] = useState("");

  const [yearOpen, setYearOpen] = useState(false);

  const indicatorControlRef =
    useRef<HTMLDivElement | null>(null);

  const yearControlRef =
    useRef<HTMLDivElement | null>(null);

  const chartRef = useRef<HTMLDivElement | null>(null);

  // =========================================================
  // LOAD METADATA
  // =========================================================

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
          throw new Error("Could not load countries.");
        }

        if (!indicatorsResponse.ok) {
          throw new Error("Could not load indicators.");
        }

        const countriesJson =
          await countriesResponse.json();

        const indicatorsJson =
          await indicatorsResponse.json();

        const countryRows: Country[] =
          Array.isArray(countriesJson)
            ? countriesJson
            : countriesJson.results ??
              countriesJson.data ??
              [];

        const indicatorRows: Indicator[] =
          Array.isArray(indicatorsJson)
            ? indicatorsJson
            : indicatorsJson.results ??
              indicatorsJson.data ??
              [];

        setCountries(countryRows);
        setIndicators(indicatorRows);

        if (
          indicatorRows.length > 0 &&
          !indicatorRows.some(
            (item) => item.code === "GDP"
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

  // =========================================================
  // CLOSE DROPDOWNS WHEN CLICKING OUTSIDE
  // =========================================================

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;

      if (
        indicatorControlRef.current &&
        !indicatorControlRef.current.contains(target)
      ) {
        setIndicatorOpen(false);
      }

      if (
        yearControlRef.current &&
        !yearControlRef.current.contains(target)
      ) {
        setYearOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handleClickOutside
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
    };
  }, []);

  // =========================================================
  // OECD
  // =========================================================

  const oecdCountries = useMemo(() => {
    return new Set(
      countries
        .filter(
          (country) =>
            country.oecd === true ||
            country.is_oecd === true
        )
        .map(getCountryName)
        .filter(Boolean)
    );
  }, [countries]);

  function isOecdCountry(countryName: string) {
    if (oecdCountries.size > 0) {
      return oecdCountries.has(countryName);
    }

    return OECD_FALLBACK.has(countryName);
  }

  // =========================================================
  // LOAD RANKING DATA
  // =========================================================

  useEffect(() => {
    if (
      countries.length === 0 ||
      selectedIndicators.length === 0
    ) {
      return;
    }

    async function loadRankingData() {
      try {
        setRankingLoading(true);
        setError("");

        const countryNames = countries
          .map(getCountryName)
          .filter(Boolean);

        const requests = countryNames.map(
          async (country) => {
            try {
              const indicatorResults =
                await Promise.all(
                  selectedIndicators.map(
                    async (indicatorCode) => {
                      const response = await fetch(
                        `${API}/data/${encodeURIComponent(
                          country
                        )}/${encodeURIComponent(
                          indicatorCode
                        )}`
                      );

                      if (!response.ok) {
                        return null;
                      }

                      const json =
                        await response.json();

                      const rows = Array.isArray(json)
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
                        return null;
                      }

                      const value = Number(row.value);

                      if (!Number.isFinite(value)) {
                        return null;
                      }

                      return {
                        indicatorCode,
                        value,
                      };
                    }
                  )
                );

              const validResults =
                indicatorResults.filter(
                  (
                    item
                  ): item is {
                    indicatorCode: string;
                    value: number;
                  } => item !== null
                );

              if (validResults.length === 0) {
                return null;
              }

              const result: RankingDataRow = {
                country,
                year: selectedYear,
              };

              validResults.forEach(
                ({
                  indicatorCode,
                  value,
                }) => {
                  result[indicatorCode] = value;
                }
              );

              return result;
            } catch {
              return null;
            }
          }
        );

        const results = await Promise.all(requests);

        setData(
          results.filter(
            (
              row
            ): row is RankingDataRow =>
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
    countries,
    selectedIndicators,
    selectedYear,
  ]);

  // =========================================================
  // FILTER
  // =========================================================

  const filteredData = useMemo(() => {
    if (!oecdOnly) {
      return data;
    }

    return data.filter((row) =>
      isOecdCountry(row.country)
    );
  }, [
    data,
    oecdOnly,
    oecdCountries,
  ]);

  // =========================================================
  // TOTAL + RANK
  // =========================================================

  const sortedData = useMemo(() => {
    const rows: RankingRow[] =
      filteredData.map((row) => {
        const total =
          selectedIndicators.reduce(
            (sum, indicatorCode) =>
              sum +
              getIndicatorValue(
                row,
                indicatorCode
              ),
            0
          );

        return {
          ...row,
          total,
          rank: 0,
        };
      });

    rows.sort((a, b) =>
      direction === "top"
        ? b.total - a.total
        : a.total - b.total
    );

    return rows.map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
  }, [
    filteredData,
    selectedIndicators,
    direction,
  ]);

  const visibleData = useMemo(
    () =>
      sortedData.slice(
        0,
        limit
      ),
    [sortedData, limit]
  );

  // =========================================================
  // ITALY
  // =========================================================

  const italy = sortedData.find(
    (row) => row.country === "Italy"
  );

  const italyRank = italy?.rank ?? null;

  // =========================================================
  // INDICATOR SEARCH
  // =========================================================

  const filteredIndicators = useMemo(() => {
    const query =
      indicatorSearch.trim().toLowerCase();

    if (!query) {
      return indicators;
    }

    return indicators.filter(
      (indicator) =>
        indicator.code
          .toLowerCase()
          .includes(query) ||
        indicator.name
          ?.toLowerCase()
          .includes(query)
    );
  }, [
    indicators,
    indicatorSearch,
  ]);

  // =========================================================
  // INDICATOR TOGGLE
  // =========================================================

  function toggleIndicator(
    indicatorCode: string
  ) {
    setSelectedIndicators(
      (current) => {
        if (
          current.includes(
            indicatorCode
          )
        ) {
          if (current.length === 1) {
            return current;
          }

          return current.filter(
            (code) =>
              code !== indicatorCode
          );
        }

        return [
          ...current,
          indicatorCode,
        ];
      }
    );
  }

  function removeIndicator(
    indicatorCode: string
  ) {
    setSelectedIndicators(
      (current) => {
        if (current.length === 1) {
          return current;
        }

        return current.filter(
          (code) =>
            code !== indicatorCode
        );
      }
    );
  }

  // =========================================================
  // CHART DATA
  // =========================================================

  const chartData = useMemo(() => {
    return visibleData.map(
      (row) => {
        const chartRow: Record<
          string,
          string | number
        > = {
          country: row.country,
          total: row.total,
        };

        selectedIndicators.forEach(
          (indicatorCode) => {
            chartRow[indicatorCode] =
              getIndicatorValue(
                row,
                indicatorCode
              );
          }
        );

        return chartRow;
      }
    );
  }, [
    visibleData,
    selectedIndicators,
  ]);

  // =========================================================
  // SELECTED INDICATOR INFO
  // =========================================================

  const selectedIndicatorInfo =
    indicators.filter(
      (indicator) =>
        selectedIndicators.includes(
          indicator.code
        )
    );

  // =========================================================
  // FORMAT
  // =========================================================

  function formatValue(value: number) {
    const absolute = Math.abs(value);

    if (
      absolute >=
      1_000_000_000_000
    ) {
      return `${(
        value /
        1_000_000_000_000
      ).toFixed(2)}T`;
    }

    if (
      absolute >=
      1_000_000_000
    ) {
      return `${(
        value /
        1_000_000_000
      ).toFixed(2)}B`;
    }

    if (
      absolute >=
      1_000_000
    ) {
      return `${(
        value /
        1_000_000
      ).toFixed(2)}M`;
    }

    if (
      absolute >=
      1_000
    ) {
      return `${(
        value /
        1_000
      ).toFixed(2)}K`;
    }

    return new Intl.NumberFormat(
      "en-US",
      {
        maximumFractionDigits: 2,
      }
    ).format(value);
  }

  // =========================================================
  // DOWNLOAD
  // =========================================================

  async function downloadChart() {
    if (!chartRef.current) {
      return;
    }

    try {
      const canvas =
        await html2canvas(
          chartRef.current,
          {
            backgroundColor:
              "#ffffff",
            scale: 2,
          }
        );

      const indicatorTitle =
        selectedIndicators.join(
          " + "
        );

      const title =
        `${
          direction === "top"
            ? "Highest"
            : "Lowest"
        } ${indicatorTitle} — ${selectedYear}`;

      const link =
        document.createElement("a");

      link.download =
        `${title
          .replace(
            /[^a-z0-9]+/gi,
            "-"
          )
          .replace(
            /-+$/,
            ""
          )}.png`;

      link.href =
        canvas.toDataURL(
          "image/png"
        );

      link.click();
    } catch {
      setError(
        "Could not download the chart."
      );
    }
  }

  // =========================================================
  // LOADING
  // =========================================================

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

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <section className="ranking-page">
      <div className="ranking-heading">
        <div>
          <div className="eyebrow">
            WORLD DATA · COMPARISON
          </div>

          <h1>Ranking</h1>

          <p>
            Compare countries by one or more
            indicators and see where each country
            stands.
          </p>
        </div>

        {italy && (
          <div className="italy-rank-card">
            <span>ITALY</span>

            <strong>
              #{italyRank}
            </strong>

            <small>
              of {sortedData.length} countries
            </small>
          </div>
        )}
      </div>

      {error && (
        <div className="ranking-error">
          <strong>
            Unable to load data
          </strong>

          <span>{error}</span>
        </div>
      )}

      {/* =====================================================
          CONTROLS
          ===================================================== */}

      <div className="ranking-controls">
        {/* INDICATORS */}

        <div
          className="ranking-control ranking-indicator-control"
          ref={indicatorControlRef}
        >
          <div className="ranking-control-label">
            <span>INDICATORS</span>

            {selectedIndicators.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setSelectedIndicators([
                    selectedIndicators[0],
                  ])
                }
              >
                Clear extras
              </button>
            )}
          </div>

          <button
            type="button"
            className="ranking-selection-control"
            onClick={() =>
              setIndicatorOpen(
                (current) => !current
              )
            }
          >
            <div className="ranking-selection-content">
              <div className="ranking-selected-tags">
                {selectedIndicators.length ===
                0 ? (
                  <span className="ranking-placeholder">
                    Select indicators
                  </span>
                ) : (
                  <>
                    {selectedIndicators
                      .slice(0, 3)
                      .map(
                        (
                          indicatorCode
                        ) => (
                          <span
                            className="ranking-selection-tag"
                            key={
                              indicatorCode
                            }
                          >
                            <span
                              className="ranking-tag-dot"
                              style={{
                                background:
                                  INDICATOR_COLORS[
                                    Math.max(
                                      0,
                                      selectedIndicators.indexOf(
                                        indicatorCode
                                      )
                                    ) %
                                      INDICATOR_COLORS.length
                                  ],
                              }}
                            />

                            <span>
                              {
                                indicatorCode
                              }
                            </span>

                            <span
                              role="button"
                              tabIndex={0}
                              className="ranking-tag-remove"
                              onClick={(
                                event
                              ) => {
                                event.stopPropagation();
                                removeIndicator(
                                  indicatorCode
                                );
                              }}
                              onKeyDown={(
                                event
                              ) => {
                                if (
                                  event.key ===
                                  "Enter"
                                ) {
                                  event.stopPropagation();
                                  removeIndicator(
                                    indicatorCode
                                  );
                                }
                              }}
                            >
                              <X
                                size={11}
                              />
                            </span>
                          </span>
                        )
                      )}

                    {selectedIndicators.length >
                      3 && (
                      <span className="ranking-selection-more">
                        +
                        {selectedIndicators.length -
                          3}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>

            <ChevronDown
              size={15}
              className={
                indicatorOpen
                  ? "ranking-chevron open"
                  : "ranking-chevron"
              }
            />
          </button>

          {indicatorOpen && (
            <div className="ranking-selector-panel">
              <div className="ranking-selector-search">
                <Search size={14} />

                <input
                  value={
                    indicatorSearch
                  }
                  onChange={(
                    event
                  ) =>
                    setIndicatorSearch(
                      event.target.value
                    )
                  }
                  placeholder="Search indicators..."
                  autoFocus
                />

                {indicatorSearch && (
                  <button
                    type="button"
                    className="ranking-search-clear"
                    onClick={() =>
                      setIndicatorSearch(
                        ""
                      )
                    }
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="ranking-selector-list">
                {filteredIndicators.length ===
                0 ? (
                  <div className="ranking-selector-empty">
                    No indicators found.
                  </div>
                ) : (
                  filteredIndicators.map(
                    (
                      indicator
                    ) => {
                      const active =
                        selectedIndicators.includes(
                          indicator.code
                        );

                      const index =
                        selectedIndicators.indexOf(
                          indicator.code
                        );

                      return (
                        <button
                          type="button"
                          key={
                            indicator.code
                          }
                          className={
                            active
                              ? "ranking-selector-option selected"
                              : "ranking-selector-option"
                          }
                          onClick={() =>
                            toggleIndicator(
                              indicator.code
                            )
                          }
                        >
                          <div>
                            <strong>
                              {
                                indicator.code
                              }
                            </strong>

                            {indicator.name && (
                              <small>
                                {
                                  indicator.name
                                }
                              </small>
                            )}
                          </div>

                          {active ? (
                            <span
                              className="ranking-selector-check"
                              style={{
                                background:
                                  INDICATOR_COLORS[
                                    index %
                                      INDICATOR_COLORS.length
                                  ],
                              }}
                            >
                              <Check
                                size={12}
                              />
                            </span>
                          ) : (
                            <span className="ranking-selector-circle" />
                          )}
                        </button>
                      );
                    }
                  )
                )}
              </div>
            </div>
          )}
        </div>

        {/* YEAR */}

        <div
          className="ranking-control ranking-year-control"
          ref={yearControlRef}
        >
          <div className="ranking-control-label">
            <span>YEAR</span>
          </div>

          <button
            type="button"
            className="ranking-selection-control"
            onClick={() =>
              setYearOpen(
                (current) => !current
              )
            }
          >
            <div className="ranking-selection-content">
              <span>
                {selectedYear}
              </span>
            </div>

            <ChevronDown
              size={15}
              className={
                yearOpen
                  ? "ranking-chevron open"
                  : "ranking-chevron"
              }
            />
          </button>

          {yearOpen && (
            <div className="ranking-year-panel">
              <div className="ranking-year-panel-title">
                <span>SELECT YEAR</span>

                <small>
                  Choose an observation year
                </small>
              </div>

              <div className="ranking-year-grid">
                {Array.from(
                  {
                    length: 65,
                  },
                  (_, index) =>
                    2024 - index
                ).map(
                  (year) => (
                    <button
                      type="button"
                      key={year}
                      className={
                        year ===
                        selectedYear
                          ? "selected"
                          : ""
                      }
                      onClick={() => {
                        setSelectedYear(
                          year
                        );
                        setYearOpen(
                          false
                        );
                      }}
                    >
                      {year}
                    </button>
                  )
                )}
              </div>
            </div>
          )}
        </div>

        {/* ORDER */}

        <div className="ranking-control ranking-order-control">
          <div className="ranking-control-label">
            <span>ORDER</span>
          </div>

          <div className="ranking-toggle">
            <button
              type="button"
              className={
                direction ===
                "top"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setDirection(
                  "top"
                )
              }
            >
              <ArrowUp
                size={13}
              />
              Highest
            </button>

            <button
              type="button"
              className={
                direction ===
                "bottom"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setDirection(
                  "bottom"
                )
              }
            >
              <ArrowDown
                size={13}
              />
              Lowest
            </button>
          </div>
        </div>

        {/* SHOW */}

        <div className="ranking-control ranking-show-control">
          <div className="ranking-control-label">
            <span>SHOW</span>
          </div>

          <select
            value={limit}
            onChange={(
              event
            ) =>
              setLimit(
                Number(
                  event.target.value
                )
              )
            }
          >
            <option value={5}>
              Top 5
            </option>

            <option value={10}>
              Top 10
            </option>

            <option value={15}>
              Top 15
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

        {/* OECD */}

        <div className="ranking-control ranking-group-control">
          <div className="ranking-control-label">
            <span>GROUP</span>
          </div>

          <button
            type="button"
            className={
              oecdOnly
                ? "ranking-oecd active"
                : "ranking-oecd"
            }
            onClick={() =>
              setOecdOnly(
                (current) => !current
              )
            }
          >
            <span
              className={
                oecdOnly
                  ? "ranking-oecd-indicator active"
                  : "ranking-oecd-indicator"
              }
            />

            OECD
          </button>
        </div>
      </div>

      {/* =====================================================
          CARD
          ===================================================== */}

      <div className="ranking-card">
        <div className="ranking-card-header">
          <div>
            <div className="eyebrow">
              {direction ===
              "top"
                ? "HIGHEST"
                : "LOWEST"}
            </div>

            <h2>
              {selectedIndicators.join(
                " + "
              )}
            </h2>

            <p>
              {selectedIndicatorInfo
                .map(
                  (
                    indicator
                  ) =>
                    indicator.name ??
                    indicator.code
                )
                .join(
                  " + "
                )}{" "}
              · {selectedYear}
              {oecdOnly
                ? " · OECD"
                : ""}
            </p>
          </div>

          <div className="ranking-card-actions">
            <span className="ranking-count">
              {visibleData.length} countries
            </span>

            <button
              type="button"
              className="ranking-download"
              onClick={
                downloadChart
              }
              disabled={
                rankingLoading ||
                chartData.length ===
                  0
              }
            >
              <Download
                size={14}
              />

              Download
            </button>
          </div>
        </div>

        {/* ===================================================
            CHART
            =================================================== */}

        <div
          className="ranking-chart"
          ref={chartRef}
        >
          {rankingLoading ? (
            <div className="ranking-loading">
              <Loader2
                className="spin"
                size={18}
              />
              Updating ranking...
            </div>
          ) : chartData.length ===
            0 ? (
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
              height={Math.max(
                500,
                visibleData.length *
                  32
              )}
            >
              <BarChart
                data={chartData}
                margin={{
                  top: 20,
                  right: 35,
                  left: 15,
                  bottom: 100,
                }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="#e8ecf1"
                />

                <XAxis
                  dataKey="country"
                  interval={0}
                  angle={-55}
                  textAnchor="end"
                  height={110}
                  tickLine={false}
                  axisLine={false}
                  tick={{
                    fontSize: 10,
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
                  contentStyle={{
                    borderRadius: 10,
                    border:
                      "1px solid #e2e8f0",
                    boxShadow:
                      "0 10px 30px rgba(15,23,42,0.12)",
                    fontSize: 12,
                  }}
                  labelStyle={{
                    color: "#0f172a",
                    fontWeight: 700,
                    marginBottom: 5,
                  }}
                  formatter={(
                    value,
                    name
                  ) => {
                    const numericValue =
                      Number(value);

                    return [
                      formatValue(
                        numericValue
                      ),
                      String(name),
                    ];
                  }}
                  labelFormatter={(
                    label
                  ) =>
                    String(
                      label
                    )
                  }
                  content={
                    undefined
                  }
                />

                <Legend />

                {selectedIndicators.map(
                  (
                    indicatorCode,
                    index
                  ) => (
                    <Bar
                      key={
                        indicatorCode
                      }
                      dataKey={
                        indicatorCode
                      }
                      name={
                        indicatorCode
                      }
                      stackId="ranking"
                      fill={
                        INDICATOR_COLORS[
                          index %
                            INDICATOR_COLORS.length
                        ]
                      }
                      radius={
                        index ===
                        selectedIndicators.length -
                          1
                          ? [
                              4,
                              4,
                              0,
                              0,
                            ]
                          : [
                              0,
                              0,
                              0,
                              0,
                            ]
                      }
                    />
                  )
                )}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* =====================================================
            TABLE
            ===================================================== */}

        {!rankingLoading &&
          visibleData.length >
            0 && (
            <div className="ranking-table">
              <div
                className="ranking-table-head"
                style={{
                  gridTemplateColumns: `60px 1fr repeat(${selectedIndicators.length}, 140px) 150px`,
                }}
              >
                <span>#</span>
                <span>Country</span>

                {selectedIndicators.map(
                  (
                    indicator
                  ) => (
                    <span
                      key={
                        indicator
                      }
                    >
                      {
                        indicator
                      }
                    </span>
                  )
                )}

                <span>Total</span>
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
                    style={{
                      gridTemplateColumns: `60px 1fr repeat(${selectedIndicators.length}, 140px) 150px`,
                    }}
                    key={
                      row.country
                    }
                  >
                    <strong>
                      {row.rank}
                    </strong>

                    <span>
                      {row.country}
                    </span>

                    {selectedIndicators.map(
                      (
                        indicatorCode
                      ) => (
                        <span
                          key={
                            indicatorCode
                          }
                        >
                          {formatValue(
                            getIndicatorValue(
                              row,
                              indicatorCode
                            )
                          )}
                        </span>
                      )
                    )}

                    <span className="ranking-total">
                      {formatValue(
                        row.total
                      )}
                    </span>
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