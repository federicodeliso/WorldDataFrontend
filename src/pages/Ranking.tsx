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
} from "lucide-react";
import "./Ranking.css";

const API = "https://worlddataapi-kf6d.onrender.com";

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

function Ranking() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);

  const [selectedIndicator, setSelectedIndicator] =
    useState("GDP");

  const [selectedYear, setSelectedYear] =
    useState(2024);

  const [direction, setDirection] =
    useState<"top" | "bottom">("top");

  const [limit, setLimit] = useState(10);

  const [data, setData] = useState<
    { country: string; year: number; value: number }[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [rankingLoading, setRankingLoading] =
    useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadMetadata() {
      try {
        setLoading(true);

        const [countriesResponse, indicatorsResponse] =
          await Promise.all([
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

        const countryRows = Array.isArray(countriesJson)
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

        if (
          indicatorRows.length > 0 &&
          !indicatorRows.some(
            (item: Indicator) =>
              item.code === "GDP"
          )
        ) {
          setSelectedIndicator(
            indicatorRows[0].code
          );
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

  useEffect(() => {
    if (
      countries.length === 0 ||
      !selectedIndicator
    ) {
      return;
    }

    async function loadRankingData() {
      try {
        setRankingLoading(true);
        setError("");

        const countryNames = countries
          .map(
            (country) =>
              country.name ??
              country.country_name ??
              country.code ??
              country.iso3 ??
              ""
          )
          .filter(Boolean);

        const requests = countryNames.map(
          async (country) => {
            try {
              const response = await fetch(
                `${API}/data/${encodeURIComponent(
                  country
                )}/${encodeURIComponent(
                  selectedIndicator
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
                country,
                year: selectedYear,
                value,
              };
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
            ): row is {
              country: string;
              year: number;
              value: number;
            } => row !== null
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
    selectedIndicator,
    selectedYear,
  ]);

  const sortedData = useMemo(() => {
    const sorted = [...data].sort((a, b) =>
      direction === "top"
        ? b.value - a.value
        : a.value - b.value
    );

    return sorted.map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
  }, [data, direction]);

  const visibleData = useMemo(
    () => sortedData.slice(0, limit),
    [sortedData, limit]
  );

  const selectedIndicatorInfo =
    indicators.find(
      (item) =>
        item.code === selectedIndicator
    );

  const italy = sortedData.find(
    (row) => row.country === "Italy"
  );

  const italyRank = italy?.rank ?? null;

  const chartData = visibleData.map((row) => ({
    country: row.country,
    value: row.value,
  }));

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

    return new Intl.NumberFormat(
      "en-US",
      {
        maximumFractionDigits: 2,
      }
    ).format(value);
  }

  if (loading) {
    return (
      <section className="ranking-page">
        <div className="ranking-loading">
          <Loader2 className="spin" size={18} />
          Loading WorldData...
        </div>
      </section>
    );
  }

  return (
    <section className="ranking-page">
      <div className="ranking-heading">
        <div>
          <div className="eyebrow">
            WORLD DATA · COMPARISON
          </div>

          <h1>Ranking</h1>

          <p>
            Compare countries by indicator and
            see where each country stands.
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
          <strong>Unable to load data</strong>
          <span>{error}</span>
        </div>
      )}

      <div className="ranking-controls">
        <div className="ranking-control ranking-indicator">
          <label>INDICATOR</label>

          <select
            value={selectedIndicator}
            onChange={(event) =>
              setSelectedIndicator(
                event.target.value
              )
            }
          >
            {indicators.map((indicator) => (
              <option
                key={indicator.code}
                value={indicator.code}
              >
                {indicator.code}
                {indicator.name
                  ? ` — ${indicator.name}`
                  : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="ranking-control">
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

        <div className="ranking-control">
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
            <option value={5}>Top 5</option>
            <option value={10}>Top 10</option>
            <option value={15}>Top 15</option>
            <option value={20}>Top 20</option>
            <option value={30}>Top 30</option>
          </select>
        </div>
      </div>

      <div className="ranking-card">
        <div className="ranking-card-header">
          <div>
            <div className="eyebrow">
              {direction === "top"
                ? "HIGHEST"
                : "LOWEST"}
            </div>

            <h2>
              {selectedIndicator}
            </h2>

            <p>
              {selectedIndicatorInfo?.name ??
                "Country ranking"}{" "}
              · {selectedYear}
            </p>
          </div>

          <span className="ranking-count">
            {visibleData.length} countries
          </span>
        </div>

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
              <h3>No data available</h3>
              <p>
                There are no observations for
                this indicator and year.
              </p>
            </div>
          ) : (
            <ResponsiveContainer
              width="100%"
              height={Math.max(
                420,
                visibleData.length * 38
              )}
            >
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{
                  top: 10,
                  right: 40,
                  left: 110,
                  bottom: 10,
                }}
              >
                <CartesianGrid
                  horizontal={false}
                  stroke="#e8ecf1"
                />

                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={{
                    fontSize: 10,
                    fill: "#64748b",
                  }}
                  tickFormatter={formatValue}
                />

                <YAxis
                  type="category"
                  dataKey="country"
                  tickLine={false}
                  axisLine={false}
                  tick={{
                    fontSize: 11,
                    fill: "#334155",
                  }}
                  width={105}
                />

                <Tooltip
                  formatter={(value) =>
                    formatValue(Number(value))
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

                <Bar
                  dataKey="value"
                  name={
                    selectedIndicator
                  }
                  radius={[
                    0,
                    5,
                    5,
                    0,
                  ]}
                  barSize={19}
                >
                  {chartData.map(
                    (row) => (
                      <Cell
                        key={row.country}
                        fill={
                          row.country ===
                          "Italy"
                            ? "#dc2626"
                            : "#2563eb"
                        }
                      />
                    )
                  )}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {!rankingLoading &&
          visibleData.length > 0 && (
            <div className="ranking-table">
              <div className="ranking-table-head">
                <span>#</span>
                <span>Country</span>
                <span>Value</span>
              </div>

              {visibleData.map((row) => (
                <div
                  className={
                    row.country === "Italy"
                      ? "ranking-row italy"
                      : "ranking-row"
                  }
                  key={row.country}
                >
                  <strong>{row.rank}</strong>

                  <span>
                    {row.country}
                  </span>

                  <span>
                    {formatValue(
                      row.value
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
      </div>
    </section>
  );
}

export default Ranking;