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
  Download,
  Loader2,
} from "lucide-react";
import html2canvas from "html2canvas";
import "./Ranking.css";

const API =
  "https://worlddataapi-kf6d.onrender.com";

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

type RankingRow = {
  country: string;
  year: number;
  total: number;
  [key: string]: string | number;
};

type RankingDataRow = {
  country: string;
  year: number;
  [key: string]: string | number;
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

function getIndicatorValue(
  row: RankingRow | RankingDataRow | undefined,
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

  return Number.isFinite(numericValue)
    ? numericValue
    : 0;
}

function getCountryName(country: Country): string {
  return (
    country.name ??
    country.country_name ??
    country.code ??
    country.iso3 ??
    ""
  );
}

function Ranking() {
  const [countries, setCountries] = useState<Country[]>(
    []
  );

  const [indicators, setIndicators] = useState<
    Indicator[]
  >([]);

  const [selectedIndicators, setSelectedIndicators] =
    useState<string[]>(["GDP"]);

  const [selectedYear, setSelectedYear] =
    useState(2024);

  const [direction, setDirection] =
    useState<"top" | "bottom">("top");

  const [limit, setLimit] = useState(10);

  const [oecdOnly, setOecdOnly] = useState(false);

  const [data, setData] = useState<RankingDataRow[]>(
    []
  );

  const [loading, setLoading] =
    useState(true);

  const [rankingLoading, setRankingLoading] =
    useState(false);

  const [error, setError] = useState("");

  const chartRef = useRef<HTMLDivElement | null>(
    null
  );

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
          fetch(
            `${API}/countries?limit=500`
          ),
          fetch(
            `${API}/indicators?limit=500`
          ),
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
            (item) =>
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

  // =========================================================
  // OECD DETECTION
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

  /*
   * Some APIs do not expose OECD membership directly.
   *
   * This fallback keeps the OECD button functional
   * using the standard OECD country membership list.
   */

  const OECD_FALLBACK = useMemo(
    () =>
      new Set([
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
      ]),
    []
  );

  const isOecdCountry = (
    countryName: string
  ) => {
    if (oecdCountries.size > 0) {
      return oecdCountries.has(
        countryName
      );
    }

    return OECD_FALLBACK.has(
      countryName
    );
  };

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
                      const response =
                        await fetch(
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

                      const rows =
                        Array.isArray(json)
                          ? json
                          : json.results ??
                            json.data ??
                            [];

                      const row =
                        rows.find(
                          (item: any) =>
                            Number(
                              item.year
                            ) ===
                            selectedYear
                        );

                      if (!row) {
                        return null;
                      }

                      const value =
                        Number(
                          row.value
                        );

                      if (
                        !Number.isFinite(
                          value
                        )
                      ) {
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
                  } =>
                    item !== null
                );

              if (
                validResults.length === 0
              ) {
                return null;
              }

              const result: RankingDataRow =
                {
                  country,
                  year: selectedYear,
                };

              validResults.forEach(
                ({
                  indicatorCode,
                  value,
                }) => {
                  result[
                    indicatorCode
                  ] = value;
                }
              );

              return result;
            } catch {
              return null;
            }
          }
        );

        const results =
          await Promise.all(requests);

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
  // RANKING DATA
  // =========================================================

  const filteredData = useMemo(() => {
    if (!oecdOnly) {
      return data;
    }

    return data.filter(
      (row) =>
        isOecdCountry(row.country)
    );
  }, [
    data,
    oecdOnly,
    oecdCountries,
  ]);

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
        };
      });

    const sorted = rows.sort(
      (a, b) =>
        direction === "top"
          ? b.total - a.total
          : a.total - b.total
    );

    return sorted.map(
      (row, index) => ({
        ...row,
        rank: index + 1,
      })
    );
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
    (row) =>
      row.country === "Italy"
  );

  const italyRank =
    italy?.rank ?? null;

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
            chartRow[
              indicatorCode
            ] =
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
  // INDICATOR HELPERS
  // =========================================================

  const selectedIndicatorInfo =
    indicators.filter(
      (indicator) =>
        selectedIndicators.includes(
          indicator.code
        )
    );

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
              code !==
              indicatorCode
          );
        }

        return [
          ...current,
          indicatorCode,
        ];
      }
    );
  }

  // =========================================================
  // VALUE FORMAT
  // =========================================================

  function formatValue(
    value: number
  ) {
    const absolute =
      Math.abs(value);

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
  // DOWNLOAD CHART
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

      const link =
        document.createElement(
          "a"
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
        } ${indicatorTitle} — ${
          selectedYear
        }`;

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
      {/* =====================================================
          HEADER
          ===================================================== */}

      <div className="ranking-heading">
        <div>
          <div className="eyebrow">
            WORLD DATA · COMPARISON
          </div>

          <h1>Ranking</h1>

          <p>
            Compare countries by
            indicator and see where
            each country stands.
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

      {/* =====================================================
          ERROR
          ===================================================== */}

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

        <div className="ranking-control ranking-indicator">
          <label>
            INDICATORS
          </label>

          <div className="ranking-indicator-list">
            {indicators.map(
              (indicator) => {
                const active =
                  selectedIndicators.includes(
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
                        ? "ranking-indicator-button active"
                        : "ranking-indicator-button"
                    }
                    onClick={() =>
                      toggleIndicator(
                        indicator.code
                      )
                    }
                  >
                    <span
                      className="ranking-indicator-dot"
                      style={{
                        background:
                          active
                            ? INDICATOR_COLORS[
                                Math.max(
                                  0,
                                  selectedIndicators.indexOf(
                                    indicator.code
                                  )
                                ) %
                                  INDICATOR_COLORS.length
                              ]
                            : undefined,
                      }}
                    />

                    <span>
                      {
                        indicator.code
                      }

                      {indicator.name
                        ? ` — ${indicator.name}`
                        : ""}
                    </span>
                  </button>
                );
              }
            )}
          </div>
        </div>

        {/* YEAR */}

        <div className="ranking-control">
          <label>
            YEAR
          </label>

          <select
            value={
              selectedYear
            }
            onChange={(
              event
            ) =>
              setSelectedYear(
                Number(
                  event.target.value
                )
              )
            }
          >
            {Array.from(
              {
                length: 65,
              },
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

        {/* ORDER */}

        <div className="ranking-control">
          <label>
            ORDER
          </label>

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

        <div className="ranking-control ranking-limit">
          <label>
            SHOW
          </label>

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

        <div className="ranking-control">
          <label>
            GROUP
          </label>

          <button
            type="button"
            className={
              oecdOnly
                ? "ranking-oecd active"
                : "ranking-oecd"
            }
            onClick={() =>
              setOecdOnly(
                (current) =>
                  !current
              )
            }
          >
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
              {visibleData.length}{" "}
              countries
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
              title="Download chart"
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
                There are no
                observations for
                this indicator
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
                  right: 30,
                  left: 20,
                  bottom: 80,
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
                  height={95}
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
                  formatter={(
                    value,
                    name
                  ) => {
                    const numericValue =
                      Number(
                        value
                      );

                    if (
                      name ===
                      "Total"
                    ) {
                      return [
                        formatValue(
                          numericValue
                        ),
                        "Total",
                      ];
                    }

                    return [
                      formatValue(
                        numericValue
                      ),
                      String(
                        name
                      ),
                    ];
                  }}
                  labelFormatter={(
                    label
                  ) =>
                    String(
                      label
                    )
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
            TOTAL / TABLE
            ===================================================== */}

        {!rankingLoading &&
          visibleData.length >
            0 && (
            <div className="ranking-table">
              <div className="ranking-table-head">
                <span>
                  #
                </span>

                <span>
                  Country
                </span>

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

                <span>
                  Total
                </span>
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
                    key={
                      row.country
                    }
                  >
                    <strong>
                      {
                        row.rank
                      }
                    </strong>

                    <span>
                      {
                        row.country
                      }
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