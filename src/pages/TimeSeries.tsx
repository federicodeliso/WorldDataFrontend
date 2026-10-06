import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChevronDown,
  Loader2,
  Search,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import "./TimeSeries.css";

const API = "http://127.0.0.1:8000";

type Country = {
  country_id?: number;
  id?: number;
  name?: string;
  country_name?: string;
  code?: string;
  iso3?: string;
};

type Indicator = {
  indicator_id?: number;
  id?: number;
  code: string;
  name?: string;
  unit?: string | null;
};

type Observation = {
  year: number;
  value: number;
};

type TimeSeriesPoint = {
  year: number;
  value: number;
  difference: number | null;
  growth: number | null;
  movingAverage: number | null;
  trend: number | null;
};

type TrendStats = {
  slope: number;
  intercept: number;
  rSquared: number;
};

function getCountryDisplayName(country: Country): string {
  return country.name ?? country.country_name ?? "";
}

function getCountryCode(country: Country): string {
  return country.iso3 ?? country.code ?? "";
}

function getIndicatorDisplayName(indicator: Indicator): string {
  return indicator.name ?? indicator.code;
}

function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "—";

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(value);
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";

  const abs = Math.abs(value);

  if (abs >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(2)}T`;
  }

  if (abs >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }

  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }

  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }

  return formatNumber(value);
}

function calculateLinearTrend(
  observations: Observation[]
): TrendStats | null {
  if (observations.length < 2) return null;

  const n = observations.length;
  const meanX =
    observations.reduce((sum, observation) => sum + observation.year, 0) / n;
  const meanY =
    observations.reduce((sum, observation) => sum + observation.value, 0) / n;

  let numerator = 0;
  let denominator = 0;
  let totalSumOfSquares = 0;

  for (const observation of observations) {
    const dx = observation.year - meanX;
    const dy = observation.value - meanY;

    numerator += dx * dy;
    denominator += dx * dx;
    totalSumOfSquares += dy * dy;
  }

  if (denominator === 0) return null;

  const slope = numerator / denominator;
  const intercept = meanY - slope * meanX;

  let residualSumOfSquares = 0;

  for (const observation of observations) {
    const predicted = intercept + slope * observation.year;
    residualSumOfSquares += Math.pow(observation.value - predicted, 2);
  }

  const rSquared =
    totalSumOfSquares === 0
      ? 0
      : 1 - residualSumOfSquares / totalSumOfSquares;

  return {
    slope,
    intercept,
    rSquared: Math.max(0, Math.min(1, rSquared)),
  };
}

function calculateCagr(
  firstValue: number,
  lastValue: number,
  years: number
): number | null {
  if (
    years <= 0 ||
    firstValue <= 0 ||
    lastValue <= 0 ||
    !Number.isFinite(firstValue) ||
    !Number.isFinite(lastValue)
  ) {
    return null;
  }

  return (Math.pow(lastValue / firstValue, 1 / years) - 1) * 100;
}

function calculateMovingAverage(
  observations: Observation[],
  index: number,
  window = 3
): number | null {
  const start = Math.max(0, index - window + 1);
  const values = observations
    .slice(start, index + 1)
    .map((observation) => observation.value)
    .filter(Number.isFinite);

  if (values.length === 0) return null;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function parseObservations(payload: unknown): Observation[] {
  const rows = Array.isArray(payload)
    ? payload
    : payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : [];

  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;

      const year = Number((row as { year?: unknown }).year);
      const value = Number((row as { value?: unknown }).value);

      if (!Number.isFinite(year) || !Number.isFinite(value)) {
        return null;
      }

      return {
        year,
        value,
      };
    })
    .filter((row): row is Observation => row !== null)
    .sort((a, b) => a.year - b.year);
}

function SearchableDropdown({
  label,
  value,
  placeholder,
  options,
  getKey,
  getLabel,
  getSecondaryLabel,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: unknown[];
  getKey: (option: any) => string;
  getLabel: (option: any) => string;
  getSecondaryLabel?: (option: any) => string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedOption = options.find(
    (option) => getKey(option) === value
  );

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return options.slice(0, 100);

    return options
      .filter((option) => {
        const labelText = getLabel(option).toLowerCase();
        const secondaryText = getSecondaryLabel
          ? getSecondaryLabel(option).toLowerCase()
          : "";

        return (
          labelText.includes(query) ||
          secondaryText.includes(query)
        );
      })
      .slice(0, 100);
  }, [options, search, getLabel, getSecondaryLabel]);

  useEffect(() => {
    if (!open) {
      setSearch("");
    }
  }, [open]);

  return (
    <div className="ts-filter">
      <label>{label}</label>

      <div className="ts-dropdown">
        <button
          type="button"
          className={`ts-dropdown-trigger ${
            open ? "ts-dropdown-trigger-open" : ""
          }`}
          onClick={() => !disabled && setOpen((current) => !current)}
          disabled={disabled}
        >
          <span className={selectedOption ? "" : "ts-placeholder"}>
            {selectedOption
              ? getLabel(selectedOption)
              : placeholder}
          </span>

          <ChevronDown size={17} />
        </button>

        {open && (
          <div className="ts-dropdown-menu">
            <div className="ts-search-box">
              <Search size={16} />
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Search ${label.toLowerCase()}...`}
              />

              {search && (
                <button
                  type="button"
                  className="ts-clear-search"
                  onClick={() => setSearch("")}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="ts-dropdown-options">
              {filteredOptions.length === 0 ? (
                <div className="ts-no-options">
                  No results found
                </div>
              ) : (
                filteredOptions.map((option) => {
                  const key = getKey(option);

                  return (
                    <button
                      type="button"
                      key={key}
                      className={`ts-dropdown-option ${
                        key === value
                          ? "ts-dropdown-option-selected"
                          : ""
                      }`}
                      onClick={() => {
                        onChange(key);
                        setOpen(false);
                      }}
                    >
                      <span>{getLabel(option)}</span>

                      {getSecondaryLabel && (
                        <small>{getSecondaryLabel(option)}</small>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TimeSeries() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);

  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedIndicator, setSelectedIndicator] = useState("");

  const [observations, setObservations] = useState<Observation[]>([]);

  const [startYear, setStartYear] = useState<number | null>(null);
  const [endYear, setEndYear] = useState<number | null>(null);

  const [loadingMetadata, setLoadingMetadata] = useState(true);
  const [loadingData, setLoadingData] = useState(false);

  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadMetadata() {
      setLoadingMetadata(true);
      setError("");

      try {
        const [countriesResponse, indicatorsResponse] =
          await Promise.all([
            fetch(`${API}/countries?limit=500`),
            fetch(`${API}/indicators?limit=2000`),
          ]);

        if (!countriesResponse.ok) {
          throw new Error(
            `Countries request failed (${countriesResponse.status})`
          );
        }

        if (!indicatorsResponse.ok) {
          throw new Error(
            `Indicators request failed (${indicatorsResponse.status})`
          );
        }

        const countriesPayload = await countriesResponse.json();
        const indicatorsPayload = await indicatorsResponse.json();

        const countriesData: Country[] = Array.isArray(
          countriesPayload
        )
          ? countriesPayload
          : countriesPayload?.countries ?? [];

        const indicatorsData: Indicator[] = Array.isArray(
          indicatorsPayload
        )
          ? indicatorsPayload
          : indicatorsPayload?.indicators ?? [];

        const validCountries = countriesData.filter(
          (country) => getCountryDisplayName(country)
        );

        const validIndicators = indicatorsData.filter(
          (indicator) => indicator.code
        );

        if (!cancelled) {
          setCountries(validCountries);
          setIndicators(validIndicators);

          if (validCountries.length > 0) {
            setSelectedCountry(
              getCountryDisplayName(validCountries[0])
            );
          }

          if (validIndicators.length > 0) {
            setSelectedIndicator(validIndicators[0].code);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load metadata."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingMetadata(false);
        }
      }
    }

    loadMetadata();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCountry || !selectedIndicator) return;

    let cancelled = false;

    async function loadData() {
      setLoadingData(true);
      setError("");
      setObservations([]);

      try {
        const url =
          `${API}/data/${encodeURIComponent(
            selectedCountry
          )}/${encodeURIComponent(selectedIndicator)}`;

        console.log("Loading time series data:", url);

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(
            `Could not load the selected data series (${response.status}).`
          );
        }

        const payload = await response.json();
        const parsed = parseObservations(payload);

        if (parsed.length === 0) {
          throw new Error(
            "The selected series contains no usable observations."
          );
        }

        if (!cancelled) {
          setObservations(parsed);

          setStartYear(parsed[0].year);
          setEndYear(parsed[parsed.length - 1].year);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load the selected data series."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingData(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [selectedCountry, selectedIndicator]);

  const selectedIndicatorObject = useMemo(
    () =>
      indicators.find(
        (indicator) => indicator.code === selectedIndicator
      ),
    [indicators, selectedIndicator]
  );

  const availableYears = useMemo(
    () => observations.map((observation) => observation.year),
    [observations]
  );

  const filteredObservations = useMemo(() => {
    if (startYear === null || endYear === null) {
      return observations;
    }

    const lower = Math.min(startYear, endYear);
    const upper = Math.max(startYear, endYear);

    return observations.filter(
      (observation) =>
        observation.year >= lower && observation.year <= upper
    );
  }, [observations, startYear, endYear]);

  const trendStats = useMemo(
    () => calculateLinearTrend(filteredObservations),
    [filteredObservations]
  );

  const chartData = useMemo<TimeSeriesPoint[]>(() => {
    if (filteredObservations.length === 0) return [];

    return filteredObservations.map((observation, index) => {
      const previous =
        index > 0
          ? filteredObservations[index - 1].value
          : null;

      const difference =
        previous === null
          ? null
          : observation.value - previous;

      const growth =
        previous === null || previous === 0
          ? null
          : ((observation.value - previous) / previous) * 100;

      const movingAverage = calculateMovingAverage(
        filteredObservations,
        index,
        3
      );

      const trend =
        trendStats === null
          ? null
          : trendStats.intercept +
            trendStats.slope * observation.year;

      return {
        year: observation.year,
        value: observation.value,
        difference,
        growth,
        movingAverage,
        trend,
      };
    });
  }, [filteredObservations, trendStats]);

  const summary = useMemo(() => {
    if (filteredObservations.length === 0) {
      return {
        n: 0,
        first: null,
        last: null,
        absoluteChange: null,
        percentageChange: null,
        cagr: null,
        min: null,
        max: null,
      };
    }

    const first = filteredObservations[0];
    const last =
      filteredObservations[filteredObservations.length - 1];

    const values = filteredObservations.map(
      (observation) => observation.value
    );

    const absoluteChange = last.value - first.value;

    const percentageChange =
      first.value === 0
        ? null
        : (absoluteChange / Math.abs(first.value)) * 100;

    const cagr = calculateCagr(
      first.value,
      last.value,
      last.year - first.year
    );

    return {
      n: filteredObservations.length,
      first,
      last,
      absoluteChange,
      percentageChange,
      cagr,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }, [filteredObservations]);

  const growthDirection =
    summary.absoluteChange === null
      ? "neutral"
      : summary.absoluteChange > 0
        ? "positive"
        : summary.absoluteChange < 0
          ? "negative"
          : "neutral";

  const indicatorName = selectedIndicatorObject
    ? getIndicatorDisplayName(selectedIndicatorObject)
    : selectedIndicator;

  const unit = selectedIndicatorObject?.unit ?? "";

  const canDisplayAnalysis = filteredObservations.length >= 2;

  return (
    <div className="time-series-page">
      <div className="ts-header">
        <div>
          <h1>Time Series</h1>
          <p>
            Analyze the evolution of an economic indicator over time.
          </p>
        </div>
      </div>

      <section className="ts-controls-card">
        <div className="ts-controls-grid">
          <SearchableDropdown
            label="Country"
            value={selectedCountry}
            placeholder="Select country"
            options={countries}
            getKey={(country: Country) =>
              getCountryDisplayName(country)
            }
            getLabel={(country: Country) =>
              getCountryDisplayName(country)
            }
            getSecondaryLabel={(country: Country) =>
              getCountryCode(country)
            }
            onChange={setSelectedCountry}
            disabled={loadingMetadata}
          />

          <SearchableDropdown
            label="Indicator"
            value={selectedIndicator}
            placeholder="Select indicator"
            options={indicators}
            getKey={(indicator: Indicator) => indicator.code}
            getLabel={(indicator: Indicator) =>
              getIndicatorDisplayName(indicator)
            }
            getSecondaryLabel={(indicator: Indicator) =>
              indicator.code
            }
            onChange={setSelectedIndicator}
            disabled={loadingMetadata}
          />

          <div className="ts-filter">
            <label>Start year</label>
            <select
              value={startYear ?? ""}
              onChange={(event) =>
                setStartYear(
                  event.target.value
                    ? Number(event.target.value)
                    : null
                )
              }
              disabled={
                loadingData || availableYears.length === 0
              }
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div className="ts-filter">
            <label>End year</label>
            <select
              value={endYear ?? ""}
              onChange={(event) =>
                setEndYear(
                  event.target.value
                    ? Number(event.target.value)
                    : null
                )
              }
              disabled={
                loadingData || availableYears.length === 0
              }
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>

        {startYear !== null &&
          endYear !== null &&
          startYear > endYear && (
            <div className="ts-range-warning">
              Start year is after end year. The selected range will
              be interpreted chronologically.
            </div>
          )}
      </section>

      {loadingMetadata || loadingData ? (
        <div className="ts-loading-state">
          <Loader2 className="ts-spinner" size={24} />
          <span>
            {loadingMetadata
              ? "Loading WorldData metadata..."
              : "Loading time series..."}
          </span>
        </div>
      ) : error ? (
        <div className="ts-error-state">
          <strong>Unable to load data</strong>
          <span>{error}</span>

          {selectedIndicator && selectedCountry && (
            <small>
              {indicatorName} · {selectedCountry}
            </small>
          )}
        </div>
      ) : filteredObservations.length === 0 ? (
        <div className="ts-empty-state">
          No observations are available for the selected period.
        </div>
      ) : (
        <>
          <section className="ts-series-heading">
            <div>
              <div className="ts-eyebrow">Selected series</div>

              <h2>{indicatorName}</h2>

              <p>
                {selectedCountry}
                {unit ? ` · ${unit}` : ""}
              </p>
            </div>

            <div className="ts-period">
              {filteredObservations[0].year}–
              {
                filteredObservations[
                  filteredObservations.length - 1
                ].year
              }
            </div>
          </section>

          <section className="ts-summary-grid">
            <div className="ts-stat-card">
              <span>Observations</span>
              <strong>{summary.n}</strong>
            </div>

            <div className="ts-stat-card">
              <span>Mean</span>
              <strong>
                {formatCompactNumber(
                  filteredObservations.reduce(
                    (sum, observation) => sum + observation.value,
                    0
                  ) / filteredObservations.length
                )}
              </strong>
            </div>

            <div className="ts-stat-card">
              <span>Change</span>
              <strong
                className={`ts-value-${growthDirection}`}
              >
                {summary.absoluteChange === null
                  ? "—"
                  : formatCompactNumber(summary.absoluteChange)}
              </strong>
            </div>

            <div className="ts-stat-card">
              <span>% change</span>
              <strong
                className={`ts-value-${growthDirection}`}
              >
                {summary.percentageChange === null
                  ? "—"
                  : `${formatNumber(summary.percentageChange)}%`}
              </strong>
            </div>

            <div className="ts-stat-card">
              <span>CAGR</span>
              <strong>
                {summary.cagr === null
                  ? "—"
                  : `${formatNumber(summary.cagr)}%`}
              </strong>
            </div>

            <div className="ts-stat-card">
              <span>Range</span>
              <strong>
                {summary.min !== null && summary.max !== null
                  ? `${formatCompactNumber(
                      summary.min
                    )} – ${formatCompactNumber(summary.max)}`
                  : "—"}
              </strong>
            </div>
          </section>

          <section className="ts-chart-card">
            <div className="ts-chart-header">
              <div>
                <h3>Historical series</h3>
                <p>
                  Observed values with a 3-period moving average and
                  linear time trend.
                </p>
              </div>

              <div className="ts-legend">
                <span>
                  <i className="ts-legend-dot ts-observed-dot" />
                  Observed
                </span>
                <span>
                  <i className="ts-legend-dot ts-average-dot" />
                  Moving average
                </span>
                <span>
                  <i className="ts-legend-dot ts-trend-dot" />
                  Linear trend
                </span>
              </div>
            </div>

            <div className="ts-main-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{
                    top: 12,
                    right: 20,
                    left: 8,
                    bottom: 10,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="year"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />

                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) =>
                      formatCompactNumber(Number(value))
                    }
                  />

                  <Tooltip
                    formatter={(value) => {
                      const numericValue = Number(value);

                      return Number.isFinite(numericValue)
                        ? [formatNumber(numericValue), "Value"]
                        : ["—", "Value"];
                    }}
                    labelFormatter={(label) => `Year: ${label}`}
                  />

                  <Line
                    type="monotone"
                    dataKey="value"
                    name="Observed"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />

                  <Line
                    type="monotone"
                    dataKey="movingAverage"
                    name="3-period moving average"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    connectNulls
                  />

                  {trendStats && (
                    <Line
                      type="linear"
                      dataKey="trend"
                      name="Linear trend"
                      strokeWidth={2}
                      strokeDasharray="8 5"
                      dot={false}
                      connectNulls
                    />
                  )}

                  {trendStats &&
                    trendStats.slope !== 0 && (
                      <ReferenceLine
                        y={0}
                        strokeDasharray="3 3"
                      />
                    )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="ts-analysis-grid">
            <div className="ts-analysis-card">
              <div className="ts-card-title">
                <div>
                  <h3>Trend analysis</h3>
                  <p>
                    Linear trend estimated over the selected period.
                  </p>
                </div>

                {growthDirection === "positive" ? (
                  <TrendingUp size={22} />
                ) : growthDirection === "negative" ? (
                  <TrendingDown size={22} />
                ) : null}
              </div>

              {trendStats && canDisplayAnalysis ? (
                <div className="ts-analysis-values">
                  <div>
                    <span>Trend coefficient β</span>
                    <strong>
                      {formatNumber(trendStats.slope)}
                    </strong>
                  </div>

                  <div>
                    <span>Intercept α</span>
                    <strong>
                      {formatNumber(trendStats.intercept)}
                    </strong>
                  </div>

                  <div>
                    <span>R²</span>
                    <strong>
                      {formatNumber(trendStats.rSquared, 4)}
                    </strong>
                  </div>

                  <div>
                    <span>Direction</span>
                    <strong>
                      {trendStats.slope > 0
                        ? "Increasing"
                        : trendStats.slope < 0
                          ? "Decreasing"
                          : "Flat"}
                    </strong>
                  </div>
                </div>
              ) : (
                <div className="ts-insufficient">
                  At least two observations are required to estimate
                  a time trend.
                </div>
              )}

              {trendStats && canDisplayAnalysis && (
                <div className="ts-equation">
                  <span>Estimated trend:</span>

                  <code>
                    Yₜ ={" "}
                    {formatNumber(trendStats.intercept)} +{" "}
                    {formatNumber(trendStats.slope)} × t
                  </code>
                </div>
              )}
            </div>

            <div className="ts-analysis-card">
              <div className="ts-card-title">
                <div>
                  <h3>Period summary</h3>
                  <p>
                    Key values from the selected time interval.
                  </p>
                </div>
              </div>

              <div className="ts-period-values">
                <div>
                  <span>First observation</span>
                  <strong>
                    {summary.first?.year ?? "—"}
                  </strong>
                  <small>
                    {summary.first
                      ? formatNumber(summary.first.value)
                      : ""}
                  </small>
                </div>

                <div>
                  <span>Latest observation</span>
                  <strong>
                    {summary.last?.year ?? "—"}
                  </strong>
                  <small>
                    {summary.last
                      ? formatNumber(summary.last.value)
                      : ""}
                  </small>
                </div>

                <div>
                  <span>Minimum</span>
                  <strong>
                    {summary.min === null
                      ? "—"
                      : formatNumber(summary.min)}
                  </strong>
                </div>

                <div>
                  <span>Maximum</span>
                  <strong>
                    {summary.max === null
                      ? "—"
                      : formatNumber(summary.max)}
                  </strong>
                </div>
              </div>
            </div>
          </section>

          <section className="ts-growth-card">
            <div className="ts-chart-header">
              <div>
                <h3>Year-over-year growth</h3>
                <p>
                  Percentage change relative to the previous
                  observation.
                </p>
              </div>
            </div>

            <div className="ts-growth-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{
                    top: 12,
                    right: 20,
                    left: 8,
                    bottom: 10,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="year"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />

                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) =>
                      `${Number(value).toFixed(0)}%`
                    }
                  />

                  <Tooltip
                    formatter={(value) => {
                      const numericValue = Number(value);

                      return Number.isFinite(numericValue)
                        ? [`${formatNumber(numericValue)}%`, "Growth"]
                        : ["—", "Growth"];
                    }}
                    labelFormatter={(label) => `Year: ${label}`}
                  />

                  <ReferenceLine y={0} strokeDasharray="3 3" />

                  <Line
                    type="monotone"
                    dataKey="growth"
                    name="Growth"
                    strokeWidth={2}
                    dot={{ r: 2.5 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="ts-table-card">
            <div className="ts-chart-header">
              <div>
                <h3>Historical observations</h3>
                <p>
                  Annual observations and derived time-series
                  measures.
                </p>
              </div>
            </div>

            <div className="ts-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Value</th>
                    <th>Difference</th>
                    <th>Growth</th>
                    <th>3-period MA</th>
                    <th>Trend</th>
                  </tr>
                </thead>

                <tbody>
                  {[...chartData]
                    .reverse()
                    .map((row) => (
                      <tr key={row.year}>
                        <td>{row.year}</td>

                        <td className="ts-number-cell">
                          {formatNumber(row.value)}
                        </td>

                        <td className="ts-number-cell">
                          {row.difference === null
                            ? "—"
                            : formatNumber(row.difference)}
                        </td>

                        <td
                          className={`ts-number-cell ${
                            row.growth !== null &&
                            row.growth > 0
                              ? "ts-positive"
                              : row.growth !== null &&
                                  row.growth < 0
                                ? "ts-negative"
                                : ""
                          }`}
                        >
                          {row.growth === null
                            ? "—"
                            : `${formatNumber(row.growth)}%`}
                        </td>

                        <td className="ts-number-cell">
                          {row.movingAverage === null
                            ? "—"
                            : formatNumber(
                                row.movingAverage
                              )}
                        </td>

                        <td className="ts-number-cell">
                          {row.trend === null
                            ? "—"
                            : formatNumber(row.trend)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="ts-methodology">
            <h3>Methodology</h3>

            <p>
              The time series is retrieved directly from the WorldData
              API for the selected country and indicator. Missing or
              non-numeric observations are excluded.
            </p>

            <p>
              The moving average uses a three-observation trailing
              window. Year-over-year growth is calculated as
              <code>
                {" "}
                (Yₜ / Yₜ₋₁ − 1) × 100
              </code>
              . The linear trend is estimated using ordinary least
              squares:
              <code>
                {" "}
                Yₜ = α + βt + εₜ
              </code>
              .
            </p>

            <p>
              CAGR is reported only when the initial and final values
              are positive and the period spans at least one year.
            </p>
          </section>
        </>
      )}
    </div>
  );
}