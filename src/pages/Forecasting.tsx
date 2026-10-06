import { useEffect, useMemo, useState } from "react";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChevronDown,
  Loader2,
  Search,
  X,
} from "lucide-react";

import "./Forecasting.css";

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

type ForecastMethod =
  | "naive"
  | "movingAverage"
  | "linearTrend"
  | "exponentialSmoothing";

type ForecastPoint = {
  year: number;
  actual: number | null;
  fitted: number | null;
  forecast: number | null;
  lower: number | null;
  upper: number | null;
};

type ForecastResult = {
  historical: ForecastPoint[];
  forecast: ForecastPoint[];
  mae: number | null;
  rmse: number | null;
  mape: number | null;
};

function getCountryName(country: Country): string {
  return country.name ?? country.country_name ?? "";
}

function getCountryCode(country: Country): string {
  return country.iso3 ?? country.code ?? "";
}

function getIndicatorName(indicator: Indicator): string {
  return indicator.name ?? indicator.code;
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return `${value.toFixed(2)}%`;
}

function parseObservations(payload: unknown): Observation[] {
  const rows = Array.isArray(payload)
    ? payload
    : payload &&
        typeof payload === "object" &&
        "data" in payload &&
        Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : [];

  return rows
    .map((row) => {
      if (!row || typeof row !== "object") {
        return null;
      }

      const item = row as {
        year?: unknown;
        value?: unknown;
      };

      const year = Number(item.year);
      const value = Number(item.value);

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

function calculateMAE(actual: number[], fitted: number[]): number | null {
  if (actual.length === 0 || actual.length !== fitted.length) {
    return null;
  }

  return (
    actual.reduce(
      (sum, value, index) => sum + Math.abs(value - fitted[index]),
      0
    ) / actual.length
  );
}

function calculateRMSE(actual: number[], fitted: number[]): number | null {
  if (actual.length === 0 || actual.length !== fitted.length) {
    return null;
  }

  return Math.sqrt(
    actual.reduce(
      (sum, value, index) => sum + (value - fitted[index]) ** 2,
      0
    ) / actual.length
  );
}

function calculateMAPE(actual: number[], fitted: number[]): number | null {
  const validPairs = actual
    .map((value, index) => ({
      actual: value,
      fitted: fitted[index],
    }))
    .filter(
      (pair) =>
        Number.isFinite(pair.actual) &&
        Number.isFinite(pair.fitted) &&
        pair.actual !== 0
    );

  if (validPairs.length === 0) {
    return null;
  }

  return (
    (validPairs.reduce(
      (sum, pair) =>
        sum + Math.abs((pair.actual - pair.fitted) / pair.actual),
      0
    ) /
      validPairs.length) *
    100
  );
}

function naiveForecast(values: number[]): {
  fitted: (number | null)[];
  nextValue: number;
} {
  const fitted: (number | null)[] = values.map((value, index) =>
    index === 0 ? null : values[index - 1]
  );

  return {
    fitted,
    nextValue: values[values.length - 1],
  };
}

function movingAverageForecast(
  values: number[],
  window: number
): {
  fitted: (number | null)[];
  nextValue: number;
} {
  const fitted: (number | null)[] = values.map((_, index) => {
    if (index < window) {
      return null;
    }

    const slice = values.slice(index - window, index);

    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  });

  const recent = values.slice(-window);

  const nextValue =
    recent.reduce((sum, value) => sum + value, 0) / recent.length;

  return {
    fitted,
    nextValue,
  };
}

function linearTrendForecast(values: number[]): {
  fitted: number[];
  nextValue: number;
  slope: number;
} {
  const n = values.length;

  const xMean = (n - 1) / 2;
  const yMean =
    values.reduce((sum, value) => sum + value, 0) / n;

  let numerator = 0;
  let denominator = 0;

  values.forEach((value, index) => {
    numerator += (index - xMean) * (value - yMean);
    denominator += (index - xMean) ** 2;
  });

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;

  const fitted = values.map((_, index) => intercept + slope * index);

  return {
    fitted,
    nextValue: intercept + slope * n,
    slope,
  };
}

function exponentialSmoothingForecast(
  values: number[],
  alpha: number
): {
  fitted: (number | null)[];
  nextValue: number;
} {
  const fitted: (number | null)[] = new Array(values.length).fill(null);

  let level = values[0];

  fitted[0] = null;

  for (let i = 1; i < values.length; i += 1) {
    fitted[i] = level;

    level = alpha * values[i] + (1 - alpha) * level;
  }

  return {
    fitted,
    nextValue: level,
  };
}

function getMethodName(method: ForecastMethod): string {
  switch (method) {
    case "naive":
      return "Naive";
    case "movingAverage":
      return "Moving Average";
    case "linearTrend":
      return "Linear Trend";
    case "exponentialSmoothing":
      return "Exponential Smoothing";
  }
}

function buildForecast(
  observations: Observation[],
  method: ForecastMethod,
  horizon: number,
  movingAverageWindow: number,
  alpha: number
): ForecastResult {
  const values = observations.map((observation) => observation.value);

  let fitted: (number | null)[];
  let firstForecast: number;

  if (method === "naive") {
    const result = naiveForecast(values);
    fitted = result.fitted;
    firstForecast = result.nextValue;
  } else if (method === "movingAverage") {
    const window = Math.min(
      Math.max(2, movingAverageWindow),
      Math.max(2, values.length)
    );

    const result = movingAverageForecast(values, window);

    fitted = result.fitted;
    firstForecast = result.nextValue;
  } else if (method === "linearTrend") {
    const result = linearTrendForecast(values);

    fitted = result.fitted;
    firstForecast = result.nextValue;
  } else {
    const result = exponentialSmoothingForecast(values, alpha);

    fitted = result.fitted;
    firstForecast = result.nextValue;
  }

  const actualValues: number[] = [];
  const fittedValues: number[] = [];

  observations.forEach((observation, index) => {
    const fittedValue = fitted[index];

    if (fittedValue !== null && Number.isFinite(fittedValue)) {
      actualValues.push(observation.value);
      fittedValues.push(fittedValue);
    }
  });

  const mae = calculateMAE(actualValues, fittedValues);
  const rmse = calculateRMSE(actualValues, fittedValues);
  const mape = calculateMAPE(actualValues, fittedValues);

  const residuals = actualValues.map(
    (value, index) => value - fittedValues[index]
  );

  const residualMean =
    residuals.length > 0
      ? residuals.reduce((sum, value) => sum + value, 0) /
        residuals.length
      : 0;

  const residualVariance =
    residuals.length > 1
      ? residuals.reduce(
          (sum, value) => sum + (value - residualMean) ** 2,
          0
        ) /
        (residuals.length - 1)
      : 0;

  const residualStd = Math.sqrt(residualVariance);

  const lastYear = observations[observations.length - 1].year;

  const historical: ForecastPoint[] = observations.map(
    (observation, index) => ({
      year: observation.year,
      actual: observation.value,
      fitted: fitted[index],
      forecast: null,
      lower: null,
      upper: null,
    })
  );

  const forecast: ForecastPoint[] = [];

  let currentForecast = firstForecast;

  for (let step = 1; step <= horizon; step += 1) {
    const year = lastYear + step;

    let forecastValue = currentForecast;

    if (method === "linearTrend") {
      const trend = linearTrendForecast(values);

      forecastValue =
        trend.nextValue + trend.slope * (step - 1);
    }

    const interval =
      residualStd > 0
        ? 1.96 * residualStd * Math.sqrt(step)
        : 0;

    forecast.push({
      year,
      actual: null,
      fitted: null,
      forecast: forecastValue,
      lower: forecastValue - interval,
      upper: forecastValue + interval,
    });

    if (method === "naive") {
      currentForecast = forecastValue;
    } else if (method === "movingAverage") {
      currentForecast = forecastValue;
    } else if (method === "exponentialSmoothing") {
      currentForecast = forecastValue;
    }
  }

  return {
    historical,
    forecast,
    mae,
    rmse,
    mape,
  };
}

export default function Forecasting() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);

  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedIndicator, setSelectedIndicator] = useState("");

  const [countrySearch, setCountrySearch] = useState("");
  const [indicatorSearch, setIndicatorSearch] = useState("");

  const [countryOpen, setCountryOpen] = useState(false);
  const [indicatorOpen, setIndicatorOpen] = useState(false);

  const [observations, setObservations] = useState<Observation[]>([]);

  const [method, setMethod] =
    useState<ForecastMethod>("linearTrend");

  const [horizon, setHorizon] = useState(5);
  const [movingAverageWindow, setMovingAverageWindow] =
    useState(3);
  const [alpha, setAlpha] = useState(0.3);

  const [startYear, setStartYear] = useState<number | null>(null);
  const [endYear, setEndYear] = useState<number | null>(null);

  const [loadingMetadata, setLoadingMetadata] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadMetadata() {
      try {
        setLoadingMetadata(true);
        setError("");

        const [countriesResponse, indicatorsResponse] =
          await Promise.all([
            fetch(`${API}/countries?limit=500`),
            fetch(`${API}/indicators?limit=2000`),
          ]);

        if (!countriesResponse.ok) {
          throw new Error("Unable to load countries.");
        }

        if (!indicatorsResponse.ok) {
          throw new Error("Unable to load indicators.");
        }

        const countriesPayload =
          await countriesResponse.json();

        const indicatorsPayload =
          await indicatorsResponse.json();

        if (cancelled) {
          return;
        }

        const countryRows = Array.isArray(countriesPayload)
          ? countriesPayload
          : countriesPayload?.countries ?? [];

        const indicatorRows = Array.isArray(indicatorsPayload)
          ? indicatorsPayload
          : indicatorsPayload?.indicators ?? [];

        const normalizedCountries =
          countryRows.filter(
            (country: Country) => getCountryName(country)
          );

        const normalizedIndicators =
          indicatorRows.filter(
            (indicator: Indicator) => indicator.code
          );

        setCountries(normalizedCountries);
        setIndicators(normalizedIndicators);

        if (normalizedCountries.length > 0) {
          setSelectedCountry(
            getCountryName(normalizedCountries[0])
          );
        }

        if (normalizedIndicators.length > 0) {
          setSelectedIndicator(
            normalizedIndicators[0].code
          );
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
    if (!selectedCountry || !selectedIndicator) {
      return;
    }

    let cancelled = false;

    async function loadData() {
      try {
        setLoadingData(true);
        setError("");
        setObservations([]);

        const url =
          `${API}/data/` +
          `${encodeURIComponent(selectedCountry)}/` +
          `${encodeURIComponent(selectedIndicator)}`;

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(
            `Unable to load data (${response.status}).`
          );
        }

        const payload = await response.json();
        const parsed = parseObservations(payload);

        if (cancelled) {
          return;
        }

        if (parsed.length < 5) {
          throw new Error(
            "At least 5 historical observations are required for forecasting."
          );
        }

        setObservations(parsed);

        setStartYear(parsed[0].year);
        setEndYear(parsed[parsed.length - 1].year);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load observations."
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

  const filteredCountries = useMemo(() => {
    const query = countrySearch.trim().toLowerCase();

    if (!query) {
      return countries.slice(0, 100);
    }

    return countries
      .filter((country) => {
        const name = getCountryName(country).toLowerCase();
        const code = getCountryCode(country).toLowerCase();

        return name.includes(query) || code.includes(query);
      })
      .slice(0, 100);
  }, [countries, countrySearch]);

  const filteredIndicators = useMemo(() => {
    const query = indicatorSearch.trim().toLowerCase();

    if (!query) {
      return indicators.slice(0, 100);
    }

    return indicators
      .filter((indicator) => {
        const name = getIndicatorName(indicator).toLowerCase();
        const code = indicator.code.toLowerCase();

        return name.includes(query) || code.includes(query);
      })
      .slice(0, 100);
  }, [indicators, indicatorSearch]);

  const filteredObservations = useMemo(() => {
    if (
      startYear === null ||
      endYear === null
    ) {
      return observations;
    }

    return observations.filter(
      (observation) =>
        observation.year >= startYear &&
        observation.year <= endYear
    );
  }, [observations, startYear, endYear]);

  const result = useMemo(() => {
    if (filteredObservations.length < 5) {
      return null;
    }

    return buildForecast(
      filteredObservations,
      method,
      horizon,
      movingAverageWindow,
      alpha
    );
  }, [
    filteredObservations,
    method,
    horizon,
    movingAverageWindow,
    alpha,
  ]);

  const chartData = useMemo(() => {
    if (!result) {
      return [];
    }

    const historical = result.historical.map((point) => ({
      ...point,
      forecastBand:
        point.lower !== null && point.upper !== null
          ? [point.lower, point.upper]
          : null,
    }));

    const forecast = result.forecast.map((point) => ({
      ...point,
      forecastBand:
        point.lower !== null && point.upper !== null
          ? [point.lower, point.upper]
          : null,
    }));

    return [...historical, ...forecast];
  }, [result]);

  const selectedCountryObject = countries.find(
    (country) =>
      getCountryName(country) === selectedCountry
  );

  const lastHistoricalYear =
    filteredObservations.length > 0
      ? filteredObservations[
          filteredObservations.length - 1
        ].year
      : null;

  return (
    <div className="forecasting-page">
      <div className="forecasting-header">
        <div>
          <h1>Forecasting</h1>
          <p>
            Forecast economic indicators using historical
            time-series data.
          </p>
        </div>
      </div>

      <div className="forecasting-controls">
        <div className="forecasting-control-group">
          <label>Country</label>

          <div className="forecasting-selector">
            <button
              type="button"
              className="forecasting-selector-button"
              onClick={() =>
                setCountryOpen((previous) => !previous)
              }
            >
              <span>
                {selectedCountry || "Select country"}
              </span>

              <ChevronDown size={17} />
            </button>

            {countryOpen && (
              <div className="forecasting-dropdown">
                <div className="forecasting-search">
                  <Search size={16} />

                  <input
                    value={countrySearch}
                    onChange={(event) =>
                      setCountrySearch(event.target.value)
                    }
                    placeholder="Search countries..."
                    autoFocus
                  />

                  {countrySearch && (
                    <button
                      type="button"
                      onClick={() => setCountrySearch("")}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>

                <div className="forecasting-dropdown-list">
                  {filteredCountries.map((country, index) => {
                    const name = getCountryName(country);

                    return (
                      <button
                        type="button"
                        key={`${name}-${getCountryCode(
                          country
                        )}-${index}`}
                        className={
                          name === selectedCountry
                            ? "selected"
                            : ""
                        }
                        onClick={() => {
                          setSelectedCountry(name);
                          setCountryOpen(false);
                          setCountrySearch("");
                        }}
                      >
                        <span>{name}</span>
                        <small>
                          {getCountryCode(country)}
                        </small>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="forecasting-control-group">
          <label>Indicator</label>

          <div className="forecasting-selector">
            <button
              type="button"
              className="forecasting-selector-button"
              onClick={() =>
                setIndicatorOpen((previous) => !previous)
              }
            >
              <span>
                {selectedIndicatorObject
                  ? getIndicatorName(
                      selectedIndicatorObject
                    )
                  : "Select indicator"}
              </span>

              <ChevronDown size={17} />
            </button>

            {indicatorOpen && (
              <div className="forecasting-dropdown">
                <div className="forecasting-search">
                  <Search size={16} />

                  <input
                    value={indicatorSearch}
                    onChange={(event) =>
                      setIndicatorSearch(event.target.value)
                    }
                    placeholder="Search indicators..."
                    autoFocus
                  />

                  {indicatorSearch && (
                    <button
                      type="button"
                      onClick={() => setIndicatorSearch("")}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>

                <div className="forecasting-dropdown-list">
                  {filteredIndicators.map(
                    (indicator, index) => (
                      <button
                        type="button"
                        key={`${indicator.code}-${index}`}
                        className={
                          indicator.code ===
                          selectedIndicator
                            ? "selected"
                            : ""
                        }
                        onClick={() => {
                          setSelectedIndicator(
                            indicator.code
                          );
                          setIndicatorOpen(false);
                          setIndicatorSearch("");
                        }}
                      >
                        <span>
                          {getIndicatorName(indicator)}
                        </span>

                        <small>
                          {indicator.code}
                        </small>
                      </button>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="forecasting-control-group">
          <label>Method</label>

          <select
            value={method}
            onChange={(event) =>
              setMethod(
                event.target.value as ForecastMethod
              )
            }
          >
            <option value="linearTrend">
              Linear Trend
            </option>
            <option value="naive">Naive</option>
            <option value="movingAverage">
              Moving Average
            </option>
            <option value="exponentialSmoothing">
              Exponential Smoothing
            </option>
          </select>
        </div>

        <div className="forecasting-control-group">
          <label>Forecast horizon</label>

          <select
            value={horizon}
            onChange={(event) =>
              setHorizon(Number(event.target.value))
            }
          >
            {Array.from(
              { length: 10 },
              (_, index) => index + 1
            ).map((year) => (
              <option key={year} value={year}>
                {year} {year === 1 ? "year" : "years"}
              </option>
            ))}
          </select>
        </div>

        {method === "movingAverage" && (
          <div className="forecasting-control-group">
            <label>Moving average window</label>

            <select
              value={movingAverageWindow}
              onChange={(event) =>
                setMovingAverageWindow(
                  Number(event.target.value)
                )
              }
            >
              <option value={2}>2 periods</option>
              <option value={3}>3 periods</option>
              <option value={4}>4 periods</option>
              <option value={5}>5 periods</option>
              <option value={7}>7 periods</option>
            </select>
          </div>
        )}

        {method === "exponentialSmoothing" && (
          <div className="forecasting-control-group">
            <label>
              Smoothing α: {alpha.toFixed(2)}
            </label>

            <input
              className="forecasting-range"
              type="range"
              min="0.05"
              max="0.95"
              step="0.05"
              value={alpha}
              onChange={(event) =>
                setAlpha(Number(event.target.value))
              }
            />
          </div>
        )}
      </div>

      <div className="forecasting-period-controls">
        <div>
          <label>Start year</label>

          <select
            value={startYear ?? ""}
            onChange={(event) =>
              setStartYear(Number(event.target.value))
            }
          >
            {observations.map((observation) => (
              <option
                key={observation.year}
                value={observation.year}
              >
                {observation.year}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>End year</label>

          <select
            value={endYear ?? ""}
            onChange={(event) =>
              setEndYear(Number(event.target.value))
            }
          >
            {observations.map((observation) => (
              <option
                key={observation.year}
                value={observation.year}
              >
                {observation.year}
              </option>
            ))}
          </select>
        </div>

        <div className="forecasting-period-info">
          {filteredObservations.length} observations
          {lastHistoricalYear !== null &&
            ` • Last historical year: ${lastHistoricalYear}`}
        </div>
      </div>

      {loadingMetadata || loadingData ? (
        <div className="forecasting-loading">
          <Loader2 size={22} className="forecasting-spinner" />
          <span>
            {loadingMetadata
              ? "Loading metadata..."
              : "Loading observations..."}
          </span>
        </div>
      ) : error ? (
        <div className="forecasting-error">
          {error}
        </div>
      ) : result ? (
        <>
          <div className="forecasting-summary">
            <div className="forecasting-stat-card">
              <span>Method</span>
              <strong>{getMethodName(method)}</strong>
            </div>

            <div className="forecasting-stat-card">
              <span>MAE</span>
              <strong>{formatNumber(result.mae)}</strong>
            </div>

            <div className="forecasting-stat-card">
              <span>RMSE</span>
              <strong>{formatNumber(result.rmse)}</strong>
            </div>

            <div className="forecasting-stat-card">
              <span>MAPE</span>
              <strong>{formatPercent(result.mape)}</strong>
            </div>
          </div>

          <section className="forecasting-card">
            <div className="forecasting-card-header">
              <div>
                <h2>
                  {selectedIndicatorObject
                    ? getIndicatorName(
                        selectedIndicatorObject
                      )
                    : selectedIndicator}
                </h2>

                <p>
                  {selectedCountryObject
                    ? getCountryName(
                        selectedCountryObject
                      )
                    : selectedCountry}
                  {" • "}
                  {getMethodName(method)}
                </p>
              </div>
            </div>

            <div className="forecasting-chart">
              <ResponsiveContainer width="100%" height={440}>
                <LineChart
                  data={chartData}
                  margin={{
                    top: 20,
                    right: 25,
                    left: 10,
                    bottom: 10,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />

                  <XAxis
                    dataKey="year"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(value) =>
                      String(value)
                    }
                  />

                  <YAxis
                    tickFormatter={(value) =>
                      formatNumber(Number(value))
                    }
                  />

                  <Tooltip
                    formatter={(value, name) => {
                      const numericValue = Number(value);

                      if (
                        name === "Forecast" ||
                        name === "Fitted"
                      ) {
                        return [
                          Number.isFinite(numericValue)
                            ? formatNumber(numericValue)
                            : "—",
                          name,
                        ];
                      }

                      return [
                        Number.isFinite(numericValue)
                          ? formatNumber(numericValue)
                          : "—",
                        name,
                      ];
                    }}
                    labelFormatter={(label) =>
                      `Year: ${label}`
                    }
                  />

                  <Legend />

                  <ReferenceArea
                    x1={lastHistoricalYear ?? undefined}
                    x2={
                      lastHistoricalYear !== null
                        ? lastHistoricalYear + horizon
                        : undefined
                    }
                    fillOpacity={0.04}
                  />

                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="Observed"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />

                  <Line
                    type="monotone"
                    dataKey="fitted"
                    name="Fitted"
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    dot={false}
                    connectNulls
                  />

                  <Line
                    type="monotone"
                    dataKey="forecast"
                    name="Forecast"
                    strokeWidth={2.5}
                    dot
                    connectNulls
                  />

                  <Line
                    type="monotone"
                    dataKey="lower"
                    name="95% Lower"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    dot={false}
                    connectNulls
                  />

                  <Line
                    type="monotone"
                    dataKey="upper"
                    name="95% Upper"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="forecasting-card">
            <div className="forecasting-card-header">
              <div>
                <h2>Forecast values</h2>
                <p>
                  Projected values for the selected forecast
                  horizon.
                </p>
              </div>
            </div>

            <div className="forecasting-table-wrapper">
              <table className="forecasting-table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Forecast</th>
                    <th>Lower 95%</th>
                    <th>Upper 95%</th>
                  </tr>
                </thead>

                <tbody>
                  {result.forecast.map((point) => (
                    <tr key={point.year}>
                      <td>{point.year}</td>
                      <td>
                        {formatNumber(point.forecast)}
                      </td>
                      <td>
                        {formatNumber(point.lower)}
                      </td>
                      <td>
                        {formatNumber(point.upper)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="forecasting-card forecasting-methodology">
            <h2>Methodology</h2>

            {method === "naive" && (
              <p>
                The Naive method uses the most recent observed
                value as the forecast for the next period. It
                provides a simple benchmark against which more
                sophisticated forecasting methods can be
                evaluated.
              </p>
            )}

            {method === "movingAverage" && (
              <p>
                The Moving Average forecast uses the mean of the
                most recent{" "}
                <strong>{movingAverageWindow}</strong>{" "}
                observations. This smooths short-term
                fluctuations but can respond slowly to structural
                changes.
              </p>
            )}

            {method === "linearTrend" && (
              <p>
                The Linear Trend method estimates an ordinary
                least-squares trend through the historical
                observations and extrapolates that trend into the
                future. It is useful when the series exhibits a
                relatively stable long-term direction.
              </p>
            )}

            {method === "exponentialSmoothing" && (
              <p>
                Exponential Smoothing assigns greater weight to
                recent observations. The smoothing parameter α
                controls how quickly the forecast responds to new
                information.
              </p>
            )}

            <p>
              Forecast intervals are estimated from the historical
              residual dispersion. They should be interpreted as
              indicative uncertainty ranges rather than formal
              model-based prediction intervals.
            </p>

            <p>
              Forecast accuracy statistics are calculated from
              historical fitted values. MAE measures average
              absolute error, RMSE gives greater weight to larger
              errors, and MAPE expresses average error as a
              percentage where the observed value is non-zero.
            </p>
          </section>
        </>
      ) : (
        <div className="forecasting-empty">
          Select a country and indicator to begin forecasting.
        </div>
      )}
    </div>
  );
}