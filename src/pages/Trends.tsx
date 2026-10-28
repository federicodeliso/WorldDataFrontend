import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Loader2,
  Search,
  X,
} from "lucide-react";
import {
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toPng } from "html-to-image";
import "./Trends.css";

const API = "http://127.0.0.1:8000";

type Country = {
  country_id?: number;
  country_code?: string;
  code?: string;
  name?: string;
  country_name?: string;
};

type Indicator = {
  indicator_id: number;
  code: string;
  name: string;
  description?: string | null;
  unit?: string | null;
  frequency?: string | null;
  category?: string | null;
};

type Observation = {
  country: string;
  indicator: string;
  year: number;
  value: number | null;
};

type SelectorProps = {
  title: string;
  placeholder: string;
  selected: string[];
  options: string[];
  onChange: (value: string[]) => void;
  formatOption?: (value: string) => string;
};

function Trends() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);

  const [selectedCountries, setSelectedCountries] = useState<string[]>([
    "Italy",
  ]);

  const [selectedIndicators, setSelectedIndicators] = useState<string[]>([
    "GDP",
  ]);

  const [observations, setObservations] = useState<Observation[]>([]);

  const [countriesOpen, setCountriesOpen] = useState(false);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [yearOpen, setYearOpen] = useState(false);

  const [baseYear, setBaseYear] = useState<number | null>(null);
  const [baseYearOpen, setBaseYearOpen] = useState(false);

  const [countrySearch, setCountrySearch] = useState("");
  const [indicatorSearch, setIndicatorSearch] = useState("");

  const [loadingMetadata, setLoadingMetadata] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState("");

  const [startYear, setStartYear] = useState(1990);
  const [endYear, setEndYear] = useState(2024);

  const controlsRef = useRef<HTMLDivElement>(null);

  const chartRef = useRef<HTMLDivElement>(null);
  const indexedChartRef = useRef<HTMLDivElement>(null);

  const [hiddenSeries, setHiddenSeries] = useState<
    Record<string, boolean>
  >({});

  const [hiddenIndexedSeries, setHiddenIndexedSeries] = useState<
    Record<string, boolean>
  >({});

  const [downloading, setDownloading] = useState(false);
  const [downloadingIndexed, setDownloadingIndexed] = useState(false);

  /*
   * ---------------------------------------------------------
   * LOAD COUNTRIES + INDICATORS
   * ---------------------------------------------------------
   */

  useEffect(() => {
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
          throw new Error("Could not load countries.");
        }

        if (!indicatorsResponse.ok) {
          throw new Error("Could not load indicators.");
        }

        const countriesData = await countriesResponse.json();
        const indicatorsData = await indicatorsResponse.json();

        const countryRows: Country[] = Array.isArray(countriesData)
          ? countriesData
          : countriesData.results ?? countriesData.data ?? [];

        const indicatorRows: Indicator[] = Array.isArray(indicatorsData)
          ? indicatorsData
          : indicatorsData.results ?? indicatorsData.data ?? [];

        setCountries(countryRows);
        setIndicators(indicatorRows);

        if (indicatorRows.length > 0) {
          const hasGDP = indicatorRows.some(
            (indicator) => indicator.code === "GDP"
          );

          if (!hasGDP && !selectedIndicators.length) {
            setSelectedIndicators([indicatorRows[0].code]);
          }
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load WorldData."
        );
      } finally {
        setLoadingMetadata(false);
      }
    }

    loadMetadata();
  }, []);

  /*
   * ---------------------------------------------------------
   * CLOSE DROPDOWNS WHEN CLICKING OUTSIDE
   * ---------------------------------------------------------
   */

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        controlsRef.current &&
        !controlsRef.current.contains(event.target as Node)
      ) {
        setCountriesOpen(false);
        setIndicatorsOpen(false);
        setYearOpen(false);
        setBaseYearOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
    };
  }, []);

  /*
   * ---------------------------------------------------------
   * LOAD SELECTED DATA
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (
      selectedCountries.length === 0 ||
      selectedIndicators.length === 0
    ) {
      setObservations([]);
      return;
    }

    async function loadTrendData() {
      try {
        setLoadingData(true);
        setError("");

        const requests: Promise<Response>[] = [];

        for (const country of selectedCountries) {
          for (const indicator of selectedIndicators) {
            requests.push(
              fetch(
                `${API}/data/${encodeURIComponent(
                  country
                )}/${encodeURIComponent(indicator)}`
              )
            );
          }
        }

        const responses = await Promise.all(requests);

        const failed = responses.find(
          (response) => !response.ok
        );

        if (failed) {
          throw new Error(
            "One or more selected series could not be loaded."
          );
        }

        const resultSets = await Promise.all(
          responses.map((response) => response.json())
        );

        const allRows: Observation[] = [];

        let requestIndex = 0;

        for (const country of selectedCountries) {
          for (const indicator of selectedIndicators) {
            const result = resultSets[requestIndex];

            const rows = Array.isArray(result)
              ? result
              : result.results ?? result.data ?? [];

            rows.forEach((row: any) => {
              const year = Number(row.year);

              const value =
                row.value === null ||
                row.value === undefined
                  ? null
                  : Number(row.value);

              if (
                Number.isFinite(year) &&
                (value === null || Number.isFinite(value))
              ) {
                allRows.push({
                  country,
                  indicator,
                  year,
                  value,
                });
              }
            });

            requestIndex += 1;
          }
        }

        setObservations(allRows);

        /*
         * Automatically establish a sensible range from
         * the loaded data.
         */
        if (allRows.length > 0) {
          const years = allRows
            .map((row) => row.year)
            .filter(Number.isFinite);

          const minimum = Math.min(...years);
          const maximum = Math.max(...years);

          setStartYear((current) =>
            current < minimum || current > maximum
              ? minimum
              : current
          );

          setEndYear((current) =>
            current > maximum || current < minimum
              ? maximum
              : current
          );
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load trend data."
        );

        setObservations([]);
      } finally {
        setLoadingData(false);
      }
    }

    loadTrendData();
  }, [selectedCountries, selectedIndicators]);

  /*
   * ---------------------------------------------------------
   * AVAILABLE YEARS
   * ---------------------------------------------------------
   */

  const availableYears = useMemo(() => {
    if (observations.length === 0) {
      return [];
    }

    return Array.from(
      new Set(observations.map((row) => row.year))
    ).sort((a, b) => a - b);
  }, [observations]);

  const minYear =
    availableYears.length > 0
      ? availableYears[0]
      : 1990;

  const maxYear =
    availableYears.length > 0
      ? availableYears[availableYears.length - 1]
      : 2024;

  /*
   * ---------------------------------------------------------
   * AVAILABLE BASE YEARS
   * ---------------------------------------------------------
   */

  const availableBaseYears = useMemo(() => {
    return availableYears.filter(
      (year) => year >= startYear && year <= endYear
    );
  }, [availableYears, startYear, endYear]);

  /*
   * Make sure the base year remains valid when the
   * year range changes.
   */

  useEffect(() => {
    if (availableBaseYears.length === 0) {
      setBaseYear(null);
      return;
    }

    setBaseYear((current) => {
      if (
        current !== null &&
        availableBaseYears.includes(current)
      ) {
        return current;
      }

      if (availableBaseYears.includes(2020)) {
        return 2020;
      }

      return availableBaseYears[
        availableBaseYears.length - 1
      ];
    });
  }, [availableBaseYears]);

  /*
   * ---------------------------------------------------------
   * FILTERED OBSERVATIONS
   * ---------------------------------------------------------
   */

  const filteredObservations = useMemo(() => {
    return observations.filter(
      (row) =>
        row.year >= startYear &&
        row.year <= endYear
    );
  }, [observations, startYear, endYear]);

  /*
   * ---------------------------------------------------------
   * BUILD RECHARTS DATA
   * ---------------------------------------------------------
   */

  const chartData = useMemo(() => {
    const years = Array.from(
      new Set(
        filteredObservations
          .map((row) => row.year)
          .filter(Number.isFinite)
      )
    ).sort((a, b) => a - b);

    return years.map((year) => {
      const row: Record<string, number | string | null> = {
        year,
      };

      filteredObservations
        .filter(
          (observation) => observation.year === year
        )
        .forEach((observation) => {
          const key = `${observation.country} · ${observation.indicator}`;

          row[key] =
            observation.value === null ||
            observation.value === undefined
              ? null
              : Number(observation.value);
        });

      return row;
    });
  }, [filteredObservations]);

  /*
   * ---------------------------------------------------------
   * SERIES
   * ---------------------------------------------------------
   */

  const series = useMemo(() => {
    const keys = new Set<string>();

    filteredObservations.forEach((observation) => {
      keys.add(
        `${observation.country} · ${observation.indicator}`
      );
    });

    return Array.from(keys);
  }, [filteredObservations]);

  /*
   * ---------------------------------------------------------
   * INDEXED DATA
   * ---------------------------------------------------------
   *
   * Every country × indicator series has its own base value.
   *
   * Index = value / base value × 100
   *
   * Example:
   * Base year value = 200
   * Current value = 250
   * Index = 125
   */

  const indexedChartData = useMemo(() => {
    const years = Array.from(
      new Set(
        filteredObservations
          .map((row) => row.year)
          .filter(Number.isFinite)
      )
    ).sort((a, b) => a - b);

    /*
     * Build base values for every individual series.
     */
    const baseValues = new Map<string, number>();

    filteredObservations
      .filter(
        (observation) =>
          observation.year === baseYear &&
          observation.value !== null &&
          Number.isFinite(observation.value)
      )
      .forEach((observation) => {
        const key = `${observation.country} · ${observation.indicator}`;

        const value = Number(observation.value);

        /*
         * A zero base value cannot be used for an index.
         */
        if (Number.isFinite(value) && value !== 0) {
          baseValues.set(key, value);
        }
      });

    return years.map((year) => {
      const row: Record<string, number | string | null> = {
        year,
      };

      filteredObservations
        .filter(
          (observation) => observation.year === year
        )
        .forEach((observation) => {
          const key = `${observation.country} · ${observation.indicator}`;

          const baseValue = baseValues.get(key);

          if (
            baseValue === undefined ||
            observation.value === null ||
            !Number.isFinite(observation.value)
          ) {
            row[key] = null;
            return;
          }

          row[key] =
            (Number(observation.value) / baseValue) * 100;
        });

      return row;
    });
  }, [filteredObservations, baseYear]);

  /*
   * ---------------------------------------------------------
   * INDEXED Y-AXIS DOMAIN
   * ---------------------------------------------------------
   *
   * Focus the Y-axis on the actual variation in the
   * indexed data instead of using a generic 0–200 scale.
   *
   * 100 is always included because it is the base-year
   * reference point.
   */

  const indexedYDomain = useMemo(() => {
    const values: number[] = [];

    indexedChartData.forEach((row) => {
      series.forEach((seriesKey) => {
        const value = row[seriesKey];

        if (
          typeof value === "number" &&
          Number.isFinite(value)
        ) {
          values.push(value);
        }
      });
    });

    /*
     * No valid indexed values.
     */
    if (values.length === 0) {
      return [0, 200] as [number, number];
    }

    const actualMin = Math.min(...values);
    const actualMax = Math.max(...values);

    /*
     * Always include 100.
     */
    const minValue = Math.min(actualMin, 100);
    const maxValue = Math.max(actualMax, 100);

    const range = maxValue - minValue;

    /*
     * Add 10% padding around the actual variation.
     *
     * Minimum padding of 2 index points prevents the
     * chart from becoming too compressed when the data
     * barely move.
     */
    const padding = Math.max(range * 0.10, 2);

    return [
      Math.floor(minValue - padding),
      Math.ceil(maxValue + padding),
    ] as [number, number];
  }, [indexedChartData, series]);

  /*
   * ---------------------------------------------------------
   * FILTERED SELECTOR OPTIONS
   * ---------------------------------------------------------
   */

  const countryNames = useMemo(() => {
    return countries
      .map(
        (country) =>
          country.name ??
          country.country_name ??
          country.code ??
          country.country_code ??
          ""
      )
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [countries]);

  const filteredCountries = useMemo(() => {
    const query = countrySearch.trim().toLowerCase();

    if (!query) {
      return countryNames;
    }

    return countryNames.filter((country) =>
      country.toLowerCase().includes(query)
    );
  }, [countryNames, countrySearch]);

  const indicatorCodes = useMemo(() => {
    return indicators
      .map((indicator) => indicator.code)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [indicators]);

  const filteredIndicators = useMemo(() => {
    const query = indicatorSearch.trim().toLowerCase();

    if (!query) {
      return indicatorCodes;
    }

    return indicatorCodes.filter((code) => {
      const indicator = indicators.find(
        (item) => item.code === code
      );

      return (
        code.toLowerCase().includes(query) ||
        (indicator?.name ?? "")
          .toLowerCase()
          .includes(query) ||
        (indicator?.category ?? "")
          .toLowerCase()
          .includes(query)
      );
    });
  }, [
    indicatorCodes,
    indicatorSearch,
    indicators,
  ]);

  /*
   * ---------------------------------------------------------
   * FORMAT
   * ---------------------------------------------------------
   */

  function formatValue(value: number | null) {
    if (value === null || !Number.isFinite(value)) {
      return "—";
    }

    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
    }).format(value);
  }

  function formatIndexedValue(value: number | null) {
    if (value === null || !Number.isFinite(value)) {
      return "—";
    }

    return `${new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
    }).format(value)}`;
  }

  /*
   * ---------------------------------------------------------
   * DOWNLOAD MAIN CHART
   * ---------------------------------------------------------
   */

  async function downloadChart() {
    if (!chartRef.current) return;

    try {
      setDownloading(true);

      const image = await toPng(chartRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });

      const link = document.createElement("a");

      link.download = "worlddata-trends.png";
      link.href = image;

      link.click();
    } catch (err) {
      console.error("Could not download chart:", err);
    } finally {
      setDownloading(false);
    }
  }

  /*
   * ---------------------------------------------------------
   * DOWNLOAD INDEXED CHART
   * ---------------------------------------------------------
   */

  async function downloadIndexedChart() {
    if (!indexedChartRef.current) return;

    try {
      setDownloadingIndexed(true);

      const image = await toPng(indexedChartRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });

      const link = document.createElement("a");

      link.download = `worlddata-indexed-${baseYear}.png`;
      link.href = image;

      link.click();
    } catch (err) {
      console.error(
        "Could not download indexed chart:",
        err
      );
    } finally {
      setDownloadingIndexed(false);
    }
  }

  /*
   * ---------------------------------------------------------
   * INDICATOR NAME
   * ---------------------------------------------------------
   */

  function getIndicatorName(code: string) {
    return (
      indicators.find(
        (indicator) => indicator.code === code
      )?.name ?? code
    );
  }

  /*
   * ---------------------------------------------------------
   * EMPTY / LOADING
   * ---------------------------------------------------------
   */

  if (loadingMetadata) {
    return (
      <section className="trends-page">
        <div className="trend-loading-page">
          <Loader2 className="spin" size={20} />
          <span>Loading WorldData...</span>
        </div>
      </section>
    );
  }

  /*
   * ---------------------------------------------------------
   * RENDER
   * ---------------------------------------------------------
   */

  return (
    <section className="trends-page">
      <div className="trends-heading">
        <div>
          <div className="eyebrow">
            WORLD DATA
          </div>

          <h1>Trends</h1>

          <p>
            Explore how economic and social indicators
            change across countries and over time.
          </p>
        </div>
      </div>

      {error && (
        <div className="trend-error">
          <strong>Unable to load data</strong>
          <span>{error}</span>
        </div>
      )}

      <div
        className="trend-controls"
        ref={controlsRef}
      >
        <MultiSelector
          title="COUNTRIES"
          placeholder="Select countries"
          selected={selectedCountries}
          options={filteredCountries}
          search={countrySearch}
          setSearch={setCountrySearch}
          open={countriesOpen}
          setOpen={(open) => {
            setCountriesOpen(open);
            setIndicatorsOpen(false);
            setYearOpen(false);
            setBaseYearOpen(false);
          }}
          onChange={setSelectedCountries}
        />

        <MultiSelector
          title="INDICATORS"
          placeholder="Select indicators"
          selected={selectedIndicators}
          options={filteredIndicators}
          search={indicatorSearch}
          setSearch={setIndicatorSearch}
          open={indicatorsOpen}
          setOpen={(open) => {
            setIndicatorsOpen(open);
            setCountriesOpen(false);
            setYearOpen(false);
            setBaseYearOpen(false);
          }}
          onChange={setSelectedIndicators}
          formatOption={getIndicatorName}
        />

        <div className="control-block year-filter">
          <div className="control-label">
            <span>YEAR RANGE</span>
          </div>

          <button
            type="button"
            className="selection-control year-selection-control"
            onClick={() => {
              setYearOpen((open) => !open);
              setCountriesOpen(false);
              setIndicatorsOpen(false);
              setBaseYearOpen(false);
            }}
          >
            <span>
              {startYear} — {endYear}
            </span>

            <ChevronDown
              size={15}
              className={
                yearOpen
                  ? "selector-chevron open"
                  : "selector-chevron"
              }
            />
          </button>

          {yearOpen && (
            <div className="year-dropdown">
              <div className="year-dropdown-title">
                <span>YEAR RANGE</span>

                <small>
                  Select the period to display
                </small>
              </div>

              <div className="year-fields">
                <div className="year-input">
                  <label>FROM</label>

                  <input
                    type="number"
                    value={startYear}
                    min={minYear}
                    max={endYear}
                    onChange={(event) =>
                      setStartYear(
                        Number(event.target.value)
                      )
                    }
                  />
                </div>

                <span className="year-between">
                  —
                </span>

                <div className="year-input">
                  <label>TO</label>

                  <input
                    type="number"
                    value={endYear}
                    min={startYear}
                    max={maxYear}
                    onChange={(event) =>
                      setEndYear(
                        Number(event.target.value)
                      )
                    }
                  />
                </div>
              </div>

              <button
                type="button"
                className="year-apply"
                onClick={() => setYearOpen(false)}
              >
                Apply range
              </button>
            </div>
          )}
        </div>
      </div>

      {selectedCountries.length === 0 ||
      selectedIndicators.length === 0 ? (
        <div className="empty-state">
          <div className="eyebrow">
            TIME SERIES
          </div>

          <h2>
            Select countries and indicators
          </h2>

          <p>
            Choose at least one country and one
            indicator to build a time series.
          </p>
        </div>
      ) : (
        <div className="trend-card">
          {/* =================================================
              MAIN CHART
              ================================================= */}

          <div className="trend-card-header">
            <div>
              <div className="eyebrow">
                TIME SERIES
              </div>

              <h2>
                {selectedIndicators.length === 1
                  ? getIndicatorName(
                      selectedIndicators[0]
                    )
                  : `${selectedIndicators.length} indicators`}
              </h2>

              <p>
                {selectedCountries.length}{" "}
                {selectedCountries.length === 1
                  ? "country"
                  : "countries"}{" "}
                · {selectedIndicators.length}{" "}
                {selectedIndicators.length === 1
                  ? "indicator"
                  : "indicators"}
              </p>
            </div>

            <div className="trend-chart-actions">
              <button
                type="button"
                className="chart-download-button"
                onClick={downloadChart}
                disabled={downloading}
              >
                {downloading
                  ? "Exporting..."
                  : "Download PNG"}
              </button>

              <span className="trend-period">
                {startYear} — {endYear}
              </span>
            </div>
          </div>

          <div
            className="chart-container"
            ref={chartRef}
          >
            {loadingData ? (
              <div className="trend-loading">
                <Loader2
                  className="spin"
                  size={18}
                />

                <span>
                  Loading time series...
                </span>
              </div>
            ) : chartData.length === 0 ? (
              <div className="trend-loading">
                <span>
                  No observations available for
                  this selection.
                </span>
              </div>
            ) : (
              <ResponsiveContainer
                width="100%"
                height={420}
              >
                <LineChart
                  data={chartData}
                  margin={{
                    top: 15,
                    right: 30,
                    left: 10,
                    bottom: 10,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e5e7eb"
                  />

                  <XAxis
                    dataKey="year"
                    tick={{
                      fontSize: 11,
                      fill: "#64748b",
                    }}
                    tickLine={false}
                    axisLine={{
                      stroke: "#e5e7eb",
                    }}
                  />

                  <YAxis
                    tick={{
                      fontSize: 11,
                      fill: "#64748b",
                    }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) =>
                      formatCompactValue(
                        Number(value)
                      )
                    }
                  />

                  <Tooltip
                    formatter={(value) =>
                      formatValue(
                        typeof value === "number"
                          ? value
                          : Number(value)
                      )
                    }
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid #e2e8f0",
                      boxShadow:
                        "0 10px 30px rgba(15,23,42,0.12)",
                      fontSize: 12,
                    }}
                  />

                  <Legend
                    wrapperStyle={{
                      paddingTop: 10,
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                    onClick={(payload: any) => {
                      const key = String(
                        payload?.dataKey ??
                          payload?.value ??
                          ""
                      );

                      if (!key) return;

                      setHiddenSeries((current) => ({
                        ...current,
                        [key]: !current[key],
                      }));
                    }}
                  />

                  <Brush
                    dataKey="year"
                    height={24}
                    stroke="#94a3b8"
                    travellerWidth={8}
                  />

                  {series.map((seriesKey, index) => (
                    <Line
                      key={seriesKey}
                      type="monotone"
                      dataKey={seriesKey}
                      name={seriesKey}
                      stroke={getChartColor(index)}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 5 }}
                      connectNulls
                      isAnimationActive={false}
                      hide={hiddenSeries[seriesKey]}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* =================================================
              INDEXED CHART
              ================================================= */}

          <div className="indexed-chart-section">
            <div className="trend-card-header indexed-chart-header">
              <div>
                <div className="eyebrow">
                  INDEXED CHANGE
                </div>

                <h2>
                  Relative change from base year
                </h2>

                <p>
                  Base year = 100 · Compare changes
                  across countries and indicators
                </p>
              </div>

              <div className="trend-chart-actions">
                <div className="base-year-control">
                  <div className="control-label">
                    <span>BASE YEAR</span>
                  </div>

                  <button
                    type="button"
                    className="selection-control base-year-selection-control"
                    onClick={() => {
                      setBaseYearOpen(
                        (open) => !open
                      );
                      setCountriesOpen(false);
                      setIndicatorsOpen(false);
                      setYearOpen(false);
                    }}
                  >
                    <span>{baseYear}</span>

                    <ChevronDown
                      size={15}
                      className={
                        baseYearOpen
                          ? "selector-chevron open"
                          : "selector-chevron"
                      }
                    />
                  </button>

                  {baseYearOpen && (
                    <div className="base-year-dropdown">
                      <div className="year-dropdown-title">
                        <span>BASE YEAR</span>

                        <small>
                          All series equal 100
                          in this year
                        </small>
                      </div>

                      <div className="base-year-list">
                        {availableBaseYears.map(
                          (year) => (
                            <button
                              key={year}
                              type="button"
                              className={
                                year === baseYear
                                  ? "base-year-option selected"
                                  : "base-year-option"
                              }
                              onMouseDown={(event) => {
                                event.preventDefault();
                                setBaseYear(year);
                                setBaseYearOpen(false);
                              }}
                            >
                              <span>{year}</span>

                              {year === baseYear && (
                                <Check size={15} />
                              )}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="chart-download-button"
                  onClick={downloadIndexedChart}
                  disabled={
                    downloadingIndexed
                  }
                >
                  {downloadingIndexed
                    ? "Exporting..."
                    : "Download PNG"}
                </button>

                <span className="trend-period">
                  {startYear} — {endYear}
                </span>
              </div>
            </div>

            <div
              className="chart-container indexed-chart-container"
              ref={indexedChartRef}
            >
              {loadingData ? (
                <div className="trend-loading">
                  <Loader2
                    className="spin"
                    size={18}
                  />

                  <span>
                    Loading indexed series...
                  </span>
                </div>
              ) : indexedChartData.length === 0 ? (
                <div className="trend-loading">
                  <span>
                    No observations available for
                    this selection.
                  </span>
                </div>
              ) : (
                <ResponsiveContainer
                  width="100%"
                  height={420}
                >
                  <LineChart
                    data={indexedChartData}
                    margin={{
                      top: 15,
                      right: 30,
                      left: 10,
                      bottom: 10,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#e5e7eb"
                    />

                    <XAxis
                      dataKey="year"
                      tick={{
                        fontSize: 11,
                        fill: "#64748b",
                      }}
                      tickLine={false}
                      axisLine={{
                        stroke: "#e5e7eb",
                      }}
                    />

                    <YAxis
                      domain={indexedYDomain}
                      tick={{
                        fontSize: 11,
                        fill: "#64748b",
                      }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) =>
                        `${Number(value).toFixed(0)}`
                      }
                    />

                    <ReferenceLine
                      y={100}
                      stroke="#94a3b8"
                      strokeDasharray="5 5"
                      label={{
                        value: "Base = 100",
                        position: "insideTopRight",
                        fontSize: 10,
                        fill: "#64748b",
                      }}
                    />

                    <Tooltip
                      formatter={(value) =>
                        formatIndexedValue(
                          typeof value === "number"
                            ? value
                            : Number(value)
                        )
                      }
                      labelFormatter={(label) =>
                        `Year: ${label}`
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

                    <Legend
                      wrapperStyle={{
                        paddingTop: 10,
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                      onClick={(payload: any) => {
                        const key = String(
                          payload?.dataKey ??
                            payload?.value ??
                            ""
                        );

                        if (!key) return;

                        setHiddenIndexedSeries(
                          (current) => ({
                            ...current,
                            [key]: !current[key],
                          })
                        );
                      }}
                    />

                    <Brush
                      dataKey="year"
                      height={24}
                      stroke="#94a3b8"
                      travellerWidth={8}
                    />

                    {series.map(
                      (seriesKey, index) => (
                        <Line
                          key={seriesKey}
                          type="monotone"
                          dataKey={seriesKey}
                          name={seriesKey}
                          stroke={getChartColor(
                            index
                          )}
                          strokeWidth={2.5}
                          dot={false}
                          activeDot={{ r: 5 }}
                          connectNulls
                          isAnimationActive={false}
                          hide={
                            hiddenIndexedSeries[
                              seriesKey
                            ]
                          }
                        />
                      )
                    )}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/*
 * =========================================================
 * MULTI SELECTOR
 * =========================================================
 */

function MultiSelector({
  title,
  placeholder,
  selected,
  options,
  search,
  setSearch,
  open,
  setOpen,
  onChange,
  formatOption,
}: SelectorProps & {
  search: string;
  setSearch: (value: string) => void;
  open: boolean;
  setOpen: (value: boolean) => void;
}) {
  function toggleOption(option: string) {
    if (selected.includes(option)) {
      onChange(
        selected.filter(
          (item) => item !== option
        )
      );
    } else {
      onChange([...selected, option]);
    }
  }

  function removeOption(option: string) {
    onChange(
      selected.filter(
        (item) => item !== option
      )
    );
  }

  const orderedOptions = [...options].sort(
    (a, b) => {
      const aSelected = selected.includes(a);
      const bSelected = selected.includes(b);

      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;

      return a.localeCompare(b);
    }
  );

  return (
    <div className="control-block">
      <div className="control-label">
        <span>{title}</span>

        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
          >
            Clear
          </button>
        )}
      </div>

      <button
        type="button"
        className="selection-control"
        onClick={() => setOpen(!open)}
      >
        <div className="selection-control-content">
          {selected.length === 0 ? (
            <span className="selection-placeholder">
              {placeholder}
            </span>
          ) : (
            <div className="selected-tags">
              {selected
                .slice(0, 2)
                .map((item) => (
                  <span
                    key={item}
                    className="selection-tag"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeOption(item);
                    }}
                  >
                    {item}
                    <X size={12} />
                  </span>
                ))}

              {selected.length > 2 && (
                <span className="selection-more">
                  +{selected.length - 2}
                </span>
              )}
            </div>
          )}
        </div>

        <ChevronDown
          size={15}
          className={
            open
              ? "selector-chevron open"
              : "selector-chevron"
          }
        />
      </button>

      {open && (
        <div className="selector-panel">
          <div className="selector-search">
            <Search size={15} />

            <input
              autoFocus
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder={`Search ${title.toLowerCase()}...`}
            />

            {search && (
              <button
                type="button"
                className="search-clear"
                onClick={() => setSearch("")}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="selector-list">
            {options.length === 0 ? (
              <div className="selector-empty">
                No results found.
              </div>
            ) : (
              orderedOptions.map((option) => {
                const isSelected =
                  selected.includes(option);

                return (
                  <button
                    key={option}
                    type="button"
                    className={
                      isSelected
                        ? "selector-option selected"
                        : "selector-option"
                    }
                    onClick={() =>
                      toggleOption(option)
                    }
                  >
                    <div>
                      <strong>
                        {option}
                      </strong>

                      {formatOption &&
                        formatOption(option) !==
                          option && (
                          <small>
                            {formatOption(option)}
                          </small>
                        )}
                    </div>

                    {isSelected && (
                      <Check size={15} />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/*
 * =========================================================
 * HELPERS
 * =========================================================
 */

function formatCompactValue(value: number) {
  if (!Number.isFinite(value)) {
    return "";
  }

  const absolute = Math.abs(value);

  if (absolute >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(
      1
    )}B`;
  }

  if (absolute >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(
      1
    )}M`;
  }

  if (absolute >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }

  return value.toLocaleString("en-US");
}

function getChartColor(index: number) {
  const colors = [
    "#2563eb",
    "#dc2626",
    "#059669",
    "#9333ea",
    "#d97706",
    "#0891b2",
    "#db2777",
    "#4f46e5",
    "#65a30d",
    "#ea580c",
  ];

  return colors[index % colors.length];
}

export default Trends;
