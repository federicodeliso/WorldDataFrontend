import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import {
  Area,
  AreaChart,
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
  Check,
  ChevronDown,
  Download,
  Loader2,
  Search,
  X,
} from "lucide-react";
import "./Composition.css";

const API = "http://127.0.0.1:8000";

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
  description?: string | null;
  unit?: string | null;
  category?: string | null;
};

type Observation = {
  country: string;
  indicator: string;
  year: number;
  value: number;
};

type ChartRow = {
  year: number;
  [key: string]: number;
};

type SelectorProps = {
  title: string;
  placeholder: string;
  selected: string[];
  options: string[];
  open: boolean;
  search: string;
  onOpen: () => void;
  onSearch: (value: string) => void;
  onChange: (value: string[]) => void;
  formatOption?: (value: string) => string;
};

type CompositionTooltipProps = {
  active?: boolean;
  payload?: Array<{
    payload?: ChartRow;
  }>;
  label?: string | number;
  country: string;
  selectedIndicators: string[];
  hiddenIndicators: Record<string, boolean>;
  getIndicatorName: (code: string) => string;
  formatValue: (value: number) => string;
};

const COMPOSITION_COLORS = [
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
  "#7c3aed",
  "#0f766e",
  "#be123c",
  "#0369a1",
  "#a16207",
];

function CompositionTooltip({
  active,
  payload,
  label,
  country,
  selectedIndicators,
  hiddenIndicators,
  getIndicatorName,
  formatValue,
}: CompositionTooltipProps) {
  if (
    !active ||
    !payload ||
    payload.length === 0 ||
    !payload[0]?.payload
  ) {
    return null;
  }

  const row = payload[0].payload;

  const visibleIndicators = selectedIndicators.filter(
    (indicator) => !hiddenIndicators[indicator]
  );

  const total = visibleIndicators.reduce((sum, indicator) => {
    const value = Number(row[indicator] ?? 0);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  return (
    <div className="composition-tooltip">
      <strong>
        {country} · {label}
      </strong>

      <div className="composition-tooltip-total">
        <span>Total</span>
        <strong>{formatValue(total)}</strong>
      </div>

      {visibleIndicators.map((indicator) => {
        const value = Number(row[indicator] ?? 0);

        return (
          <div
            key={indicator}
            className="composition-tooltip-row"
          >
            <span>{getIndicatorName(indicator)}</span>
            <strong>{formatValue(value)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function Composition() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);

  const [selectedCountries, setSelectedCountries] =
    useState<string[]>(["Italy"]);

  const [selectedIndicators, setSelectedIndicators] =
    useState<string[]>([]);

  const [observations, setObservations] =
    useState<Observation[]>([]);

  const [countriesOpen, setCountriesOpen] = useState(false);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);

  const [countrySearch, setCountrySearch] = useState("");
  const [indicatorSearch, setIndicatorSearch] = useState("");

  const [startYear, setStartYear] = useState(1990);
  const [endYear, setEndYear] = useState(2024);

  const [loadingMetadata, setLoadingMetadata] = useState(true);
  const [loadingData, setLoadingData] = useState(false);

  const [error, setError] = useState("");

  const [hiddenIndicators, setHiddenIndicators] =
    useState<Record<string, boolean>>({});

  const [downloadingCountry, setDownloadingCountry] =
    useState<string | null>(null);

  const controlsRef = useRef<HTMLDivElement>(null);

  const chartRefs =
    useRef<Record<string, HTMLDivElement | null>>({});

  /*
   * LOAD METADATA
   */
  useEffect(() => {
    let cancelled = false;

    async function loadMetadata() {
      try {
        setLoadingMetadata(true);
        setError("");

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

        if (cancelled) {
          return;
        }

        const countryRows: Country[] =
          Array.isArray(countriesJson)
            ? countriesJson
            : countriesJson?.results ??
              countriesJson?.data ??
              [];

        const indicatorRows: Indicator[] =
          Array.isArray(indicatorsJson)
            ? indicatorsJson
            : indicatorsJson?.results ??
              indicatorsJson?.data ??
              [];

        setCountries(countryRows);
        setIndicators(indicatorRows);

        if (indicatorRows.length > 0) {
          setSelectedIndicators((current) => {
            if (current.length > 0) {
              return current;
            }

            return [indicatorRows[0].code];
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load composition metadata."
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

  /*
   * CLOSE SELECTORS WHEN CLICKING OUTSIDE
   */
  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        controlsRef.current &&
        !controlsRef.current.contains(
          event.target as Node
        )
      ) {
        setCountriesOpen(false);
        setIndicatorsOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
    };
  }, []);

  /*
   * LOAD OBSERVATIONS
   */
  useEffect(() => {
    if (
      selectedCountries.length === 0 ||
      selectedIndicators.length === 0
    ) {
      setObservations([]);
      return;
    }

    let cancelled = false;

    async function loadCompositionData() {
      try {
        setLoadingData(true);
        setError("");

        const requests = selectedCountries.flatMap(
          (country) =>
            selectedIndicators.map((indicator) => ({
              country,
              indicator,
            }))
        );

        const responses = await Promise.all(
          requests.map((request) =>
            fetch(
              `${API}/data/${encodeURIComponent(
                request.country
              )}/${encodeURIComponent(
                request.indicator
              )}`
            )
          )
        );

        const resultSets = await Promise.all(
          responses.map(async (response) => {
            if (!response.ok) {
              return [];
            }

            const json = await response.json();

            return Array.isArray(json)
              ? json
              : json?.results ??
                json?.data ??
                [];
          })
        );

        if (cancelled) {
          return;
        }

        const rows: Observation[] = [];

        for (
          let index = 0;
          index < requests.length;
          index += 1
        ) {
          const request = requests[index];
          const result = resultSets[index];

          if (!Array.isArray(result)) {
            continue;
          }

          result.forEach((row: any) => {
            const year = Number(row?.year);
            const value = Number(row?.value);

            if (
              Number.isFinite(year) &&
              Number.isFinite(value)
            ) {
              rows.push({
                country: request.country,
                indicator: request.indicator,
                year,
                value,
              });
            }
          });
        }

        setObservations(rows);

        if (rows.length > 0) {
          const years = rows.map(
            (row) => row.year
          );

          const minimum = Math.min(...years);
          const maximum = Math.max(...years);

          setStartYear((current) =>
            current < minimum || current > maximum
              ? minimum
              : current
          );

          setEndYear((current) =>
            current < minimum || current > maximum
              ? maximum
              : current
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load composition data."
          );

          setObservations([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingData(false);
        }
      }
    }

    loadCompositionData();

    return () => {
      cancelled = true;
    };
  }, [
    selectedCountries,
    selectedIndicators,
  ]);

  /*
   * AVAILABLE YEARS
   */
  const availableYears = useMemo(() => {
    return Array.from(
      new Set(
        observations.map(
          (observation) => observation.year
        )
      )
    ).sort((a, b) => a - b);
  }, [observations]);

  const minYear =
    availableYears.length > 0
      ? availableYears[0]
      : 1990;

  const maxYear =
    availableYears.length > 0
      ? availableYears[
          availableYears.length - 1
        ]
      : 2024;

  useEffect(() => {
    if (availableYears.length === 0) {
      return;
    }

    setStartYear((current) =>
      Math.max(
        minYear,
        Math.min(current, maxYear)
      )
    );

    setEndYear((current) =>
      Math.max(
        minYear,
        Math.min(current, maxYear)
      )
    );
  }, [
    minYear,
    maxYear,
    availableYears.length,
  ]);

  /*
   * FILTER DATA BY YEAR
   */
  const filteredObservations = useMemo(() => {
    return observations.filter(
      (observation) =>
        observation.year >= startYear &&
        observation.year <= endYear
    );
  }, [
    observations,
    startYear,
    endYear,
  ]);

  /*
   * INDICATORS
   */
  const indicatorCodes = useMemo(() => {
    return indicators
      .map((indicator) => indicator.code)
      .filter(Boolean)
      .sort((a, b) =>
        a.localeCompare(b)
      );
  }, [indicators]);

  const filteredIndicators = useMemo(() => {
    const query =
      indicatorSearch
        .trim()
        .toLowerCase();

    return indicatorCodes
      .filter((code) => {
        if (!query) {
          return true;
        }

        const indicator =
          indicators.find(
            (item) =>
              item.code === code
          );

        return (
          code
            .toLowerCase()
            .includes(query) ||
          (
            indicator?.name ?? ""
          )
            .toLowerCase()
            .includes(query) ||
          (
            indicator?.category ?? ""
          )
            .toLowerCase()
            .includes(query)
        );
      })
      .sort((a, b) => {
        const aSelected =
          selectedIndicators.includes(a);

        const bSelected =
          selectedIndicators.includes(b);

        if (
          aSelected &&
          !bSelected
        ) {
          return -1;
        }

        if (
          !aSelected &&
          bSelected
        ) {
          return 1;
        }

        return a.localeCompare(b);
      });
  }, [
    indicatorCodes,
    indicators,
    indicatorSearch,
    selectedIndicators,
  ]);

  /*
   * COUNTRIES
   */
  const countryNames = useMemo(() => {
    return Array.from(
      new Set(
        countries
          .map(
            (country) =>
              country.name ??
              country.country_name ??
              country.code ??
              country.iso3 ??
              ""
          )
          .filter(Boolean)
      )
    ).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [countries]);

  const filteredCountries = useMemo(() => {
    const query =
      countrySearch
        .trim()
        .toLowerCase();

    return countryNames
      .filter(
        (country) =>
          !query ||
          country
            .toLowerCase()
            .includes(query)
      )
      .sort((a, b) => {
        const aSelected =
          selectedCountries.includes(a);

        const bSelected =
          selectedCountries.includes(b);

        if (
          aSelected &&
          !bSelected
        ) {
          return -1;
        }

        if (
          !aSelected &&
          bSelected
        ) {
          return 1;
        }

        return a.localeCompare(b);
      });
  }, [
    countryNames,
    countrySearch,
    selectedCountries,
  ]);

  /*
   * CHART DATA
   */
  const chartDataByCountry =
    useMemo(() => {
      const result: Record<
        string,
        ChartRow[]
      > = {};

      selectedCountries.forEach(
        (country) => {
          const rows =
            filteredObservations.filter(
              (observation) =>
                observation.country ===
                country
            );

          const years =
            Array.from(
              new Set(
                rows.map(
                  (row) => row.year
                )
              )
            ).sort(
              (a, b) => a - b
            );

          result[country] =
            years.map((year) => {
              const chartRow: ChartRow = {
                year,
              };

              selectedIndicators.forEach(
                (indicator) => {
                  const match =
                    rows.find(
                      (row) =>
                        row.year === year &&
                        row.indicator ===
                          indicator
                    );

                  chartRow[indicator] =
                    match?.value ?? 0;
                }
              );

              return chartRow;
            });
        }
      );

      return result;
    }, [
      filteredObservations,
      selectedCountries,
      selectedIndicators,
    ]);

  /*
   * IMPORTANT:
   *
   * Calculate the shared Y-axis from the TOTAL
   * of the stacked composition, not from the
   * largest individual indicator.
   *
   * This guarantees that every country chart
   * uses the exact same Y-axis.
   */
  const sharedYAxisMax = useMemo(() => {
    let maximumTotal = 0;

    Object.values(chartDataByCountry).forEach(
      (rows) => {
        rows.forEach((row) => {
          const total = selectedIndicators.reduce(
            (sum, indicator) => {
              if (
                hiddenIndicators[indicator]
              ) {
                return sum;
              }

              const value = Number(
                row[indicator] ?? 0
              );

              return (
                sum +
                (Number.isFinite(value)
                  ? Math.max(value, 0)
                  : 0)
              );
            },
            0
          );

          maximumTotal = Math.max(
            maximumTotal,
            total
          );
        });
      }
    );

    /*
     * Add 8% headroom so the top of the
     * composition does not touch the chart edge.
     */
    return maximumTotal > 0
      ? maximumTotal * 1.08
      : 1;
  }, [
    chartDataByCountry,
    selectedIndicators,
    hiddenIndicators,
  ]);

  const isSingleYear =
    startYear === endYear;

  /*
   * INDICATOR NAME
   */
  function getIndicatorName(
    code: string
  ) {
    return (
      indicators.find(
        (indicator) =>
          indicator.code === code
      )?.name ?? code
    );
  }

  /*
   * VALUE FORMATTER
   */
  function formatValue(value: number) {
    if (!Number.isFinite(value)) {
      return "—";
    }

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

  /*
   * COLOR
   */
  function getColor(
    indicator: string
  ) {
    const index =
      selectedIndicators.indexOf(
        indicator
      );

    return (
      COMPOSITION_COLORS[
        index %
          COMPOSITION_COLORS.length
      ] ?? "#2563eb"
    );
  }

  /*
   * LEGEND TOGGLE
   */
  function handleLegendClick(
    payload: any
  ) {
    const key = String(
      payload?.dataKey ??
        payload?.value ??
        ""
    );

    if (!key) {
      return;
    }

    setHiddenIndicators(
      (current) => ({
        ...current,
        [key]: !current[key],
      })
    );
  }

  /*
   * DOWNLOAD
   */
  async function downloadComposition(
    country: string
  ) {
    const node =
      chartRefs.current[country];

    if (!node) {
      return;
    }

    try {
      setDownloadingCountry(country);

      const image =
        await toPng(node, {
          cacheBust: true,
          pixelRatio: 2,
          backgroundColor:
            "#ffffff",
        });

      const link =
        document.createElement("a");

      link.download =
        `worlddata-composition-${country}-${startYear}-${endYear}.png`;

      link.href = image;
      link.click();
    } catch (err) {
      console.error(
        "Could not download composition chart:",
        err
      );
    } finally {
      setDownloadingCountry(null);
    }
  }

  /*
   * LOADING
   */
  if (loadingMetadata) {
    return (
      <section className="composition-page">
        <div className="composition-loading">
          <Loader2
            className="spin"
            size={18}
          />
          Loading WorldData...
        </div>
      </section>
    );
  }

  /*
   * MAIN
   */
  return (
    <section className="composition-page">
      <div className="composition-heading">
        <div>
          <div className="eyebrow">
            WORLD DATA · STRUCTURE
          </div>

          <h1>Composition</h1>

          <p>
            Explore how selected indicators
            combine and change across
            countries over time.
          </p>
        </div>
      </div>

      {error && (
        <div className="composition-error">
          <strong>
            Unable to load data
          </strong>

          <span>{error}</span>
        </div>
      )}

      <div
        className="composition-controls"
        ref={controlsRef}
      >
        <MultiSelector
          title="COUNTRIES"
          placeholder="Select countries"
          selected={
            selectedCountries
          }
          options={
            filteredCountries
          }
          search={countrySearch}
          open={countriesOpen}
          onSearch={
            setCountrySearch
          }
          onOpen={() => {
            setCountriesOpen(
              (open) => !open
            );
            setIndicatorsOpen(false);
          }}
          onChange={
            setSelectedCountries
          }
        />

        <MultiSelector
          title="INDICATORS"
          placeholder="Select indicators"
          selected={
            selectedIndicators
          }
          options={
            filteredIndicators
          }
          search={
            indicatorSearch
          }
          open={
            indicatorsOpen
          }
          onSearch={
            setIndicatorSearch
          }
          onOpen={() => {
            setIndicatorsOpen(
              (open) => !open
            );
            setCountriesOpen(false);
          }}
          onChange={
            setSelectedIndicators
          }
          formatOption={
            getIndicatorName
          }
        />

        <div className="composition-year-control">
          <label>FROM</label>

          <select
            value={startYear}
            onChange={(event) => {
              const value =
                Number(
                  event.target.value
                );

              setStartYear(value);

              if (
                value > endYear
              ) {
                setEndYear(value);
              }
            }}
          >
            {Array.from(
              {
                length:
                  maxYear -
                  minYear +
                  1,
              },
              (_, index) =>
                minYear + index
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

        <div className="composition-year-control">
          <label>TO</label>

          <select
            value={endYear}
            onChange={(event) => {
              const value =
                Number(
                  event.target.value
                );

              setEndYear(value);

              if (
                value < startYear
              ) {
                setStartYear(value);
              }
            }}
          >
            {Array.from(
              {
                length:
                  maxYear -
                  minYear +
                  1,
              },
              (_, index) =>
                minYear + index
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
      </div>

      {selectedCountries.length === 0 ||
      selectedIndicators.length === 0 ? (
        <div className="composition-empty">
          <div className="eyebrow">
            COMPOSITION
          </div>

          <h2>
            Select countries and indicators
          </h2>

          <p>
            Choose at least one country
            and one indicator to build
            the composition chart.
          </p>
        </div>
      ) : (
        <div className="composition-grid">
          {selectedCountries.map(
            (country) => {
              const chartData =
                chartDataByCountry[
                  country
                ] ?? [];

              return (
                <div
                  className={
                    selectedCountries.length ===
                    1
                      ? "composition-card single"
                      : "composition-card"
                  }
                  key={country}
                >
                  <div className="composition-card-header">
                    <div>
                      <div className="eyebrow">
                        {isSingleYear
                          ? "STACKED BAR"
                          : "COMPOSITION"}
                      </div>

                      <h2>
                        {country}
                      </h2>

                      <p>
                        {isSingleYear
                          ? `${startYear} · ${selectedIndicators.length} indicators`
                          : `${startYear} — ${endYear} · ${selectedIndicators.length} indicators`}
                      </p>
                    </div>

                    <div className="composition-card-actions">
                      <button
                        type="button"
                        className="composition-download-button"
                        onClick={() =>
                          downloadComposition(
                            country
                          )
                        }
                        disabled={
                          downloadingCountry ===
                          country
                        }
                      >
                        <Download
                          size={13}
                        />

                        {downloadingCountry ===
                        country
                          ? "Exporting..."
                          : "Download PNG"}
                      </button>

                      <span className="composition-period">
                        {isSingleYear
                          ? startYear
                          : `${startYear} — ${endYear}`}
                      </span>
                    </div>
                  </div>

                  <div
                    className="composition-chart"
                    ref={(node) => {
                      chartRefs.current[
                        country
                      ] = node;
                    }}
                  >
                    {loadingData ? (
                      <div className="composition-loading">
                        <Loader2
                          className="spin"
                          size={18}
                        />
                        Loading composition...
                      </div>
                    ) : chartData.length ===
                      0 ? (
                      <div className="composition-empty-small">
                        No observations available.
                      </div>
                    ) : isSingleYear ? (
                      <ResponsiveContainer
                        width="100%"
                        height={430}
                      >
                        <BarChart
                          data={
                            chartData
                          }
                          margin={{
                            top: 20,
                            right: 25,
                            left: 10,
                            bottom: 15,
                          }}
                        >
                          <CartesianGrid
                            vertical={false}
                            stroke="#e8ecf1"
                            strokeDasharray="3 3"
                          />

                          <XAxis
                            dataKey="year"
                            tick={{
                              fontSize: 11,
                              fill: "#64748b",
                            }}
                            tickLine={
                              false
                            }
                            axisLine={{
                              stroke:
                                "#e5e7eb",
                            }}
                          />

                          <YAxis
                            domain={[
                              0,
                              sharedYAxisMax,
                            ]}
                            tick={{
                              fontSize: 10,
                              fill: "#64748b",
                            }}
                            tickLine={
                              false
                            }
                            axisLine={
                              false
                            }
                            tickFormatter={(
                              value
                            ) =>
                              formatValue(
                                Number(
                                  value
                                )
                              )
                            }
                          />

                          <Tooltip
                            content={(
                              props: any
                            ) => (
                              <CompositionTooltip
                                active={
                                  props.active
                                }
                                payload={
                                  props.payload
                                }
                                label={
                                  props.label
                                }
                                country={
                                  country
                                }
                                selectedIndicators={
                                  selectedIndicators
                                }
                                hiddenIndicators={
                                  hiddenIndicators
                                }
                                getIndicatorName={
                                  getIndicatorName
                                }
                                formatValue={
                                  formatValue
                                }
                              />
                            )}
                          />

                          <Legend
                            wrapperStyle={{
                              paddingTop: 12,
                              fontSize: 10,
                              cursor:
                                "pointer",
                            }}
                            formatter={(
                              value
                            ) =>
                              getIndicatorName(
                                String(
                                  value
                                )
                              )
                            }
                            onClick={
                              handleLegendClick
                            }
                          />

                          {selectedIndicators.map(
                            (
                              indicator
                            ) => (
                              <Bar
                                key={
                                  indicator
                                }
                                dataKey={
                                  indicator
                                }
                                name={
                                  indicator
                                }
                                stackId="composition"
                                fill={getColor(
                                  indicator
                                )}
                                hide={
                                  hiddenIndicators[
                                    indicator
                                  ] ===
                                  true
                                }
                                isAnimationActive={
                                  false
                                }
                              />
                            )
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <ResponsiveContainer
                        width="100%"
                        height={430}
                      >
                        <AreaChart
                          data={
                            chartData
                          }
                          margin={{
                            top: 20,
                            right: 25,
                            left: 10,
                            bottom: 15,
                          }}
                        >
                          <CartesianGrid
                            vertical={false}
                            stroke="#e8ecf1"
                            strokeDasharray="3 3"
                          />

                          <XAxis
                            dataKey="year"
                            tick={{
                              fontSize: 10,
                              fill: "#64748b",
                            }}
                            tickLine={
                              false
                            }
                            axisLine={{
                              stroke:
                                "#e5e7eb",
                            }}
                          />

                          <YAxis
                            domain={[
                              0,
                              sharedYAxisMax,
                            ]}
                            tick={{
                              fontSize: 10,
                              fill: "#64748b",
                            }}
                            tickLine={
                              false
                            }
                            axisLine={
                              false
                            }
                            tickFormatter={(
                              value
                            ) =>
                              formatValue(
                                Number(
                                  value
                                )
                              )
                            }
                          />

                          <Tooltip
                            content={(
                              props: any
                            ) => (
                              <CompositionTooltip
                                active={
                                  props.active
                                }
                                payload={
                                  props.payload
                                }
                                label={
                                  props.label
                                }
                                country={
                                  country
                                }
                                selectedIndicators={
                                  selectedIndicators
                                }
                                hiddenIndicators={
                                  hiddenIndicators
                                }
                                getIndicatorName={
                                  getIndicatorName
                                }
                                formatValue={
                                  formatValue
                                }
                              />
                            )}
                          />

                          <Legend
                            wrapperStyle={{
                              paddingTop: 12,
                              fontSize: 10,
                              cursor:
                                "pointer",
                            }}
                            formatter={(
                              value
                            ) =>
                              getIndicatorName(
                                String(
                                  value
                                )
                              )
                            }
                            onClick={
                              handleLegendClick
                            }
                          />

                          {selectedIndicators.map(
                            (
                              indicator
                            ) => (
                              <Area
                                key={
                                  indicator
                                }
                                type="monotone"
                                dataKey={
                                  indicator
                                }
                                name={
                                  indicator
                                }
                                stackId="composition"
                                stroke={getColor(
                                  indicator
                                )}
                                fill={getColor(
                                  indicator
                                )}
                                fillOpacity={
                                  0.72
                                }
                                strokeWidth={
                                  1.2
                                }
                                connectNulls
                                isAnimationActive={
                                  false
                                }
                                hide={
                                  hiddenIndicators[
                                    indicator
                                  ] ===
                                  true
                                }
                              />
                            )
                          )}
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              );
            }
          )}
        </div>
      )}
    </section>
  );
}

function MultiSelector({
  title,
  placeholder,
  selected,
  options,
  open,
  search,
  onOpen,
  onSearch,
  onChange,
  formatOption,
}: SelectorProps) {
  function toggleOption(
    option: string
  ) {
    if (
      selected.includes(option)
    ) {
      onChange(
        selected.filter(
          (item) =>
            item !== option
        )
      );
    } else {
      onChange([
        ...selected,
        option,
      ]);
    }
  }

  return (
    <div className="composition-selector">
      <div className="composition-label">
        <span>{title}</span>

        {selected.length > 0 && (
          <button
            type="button"
            onClick={() =>
              onChange([])
            }
          >
            Clear
          </button>
        )}
      </div>

      <button
        type="button"
        className="composition-selector-button"
        onClick={onOpen}
      >
        <div className="composition-selected-tags">
          {selected.length ===
          0 ? (
            <span className="composition-placeholder">
              {placeholder}
            </span>
          ) : (
            <>
              {selected
                .slice(0, 2)
                .map((item) => (
                  <span
                    className="composition-tag"
                    key={item}
                  >
                    {item}
                  </span>
                ))}

              {selected.length >
                2 && (
                <span className="composition-more">
                  +
                  {selected.length -
                    2}
                </span>
              )}
            </>
          )}
        </div>

        <ChevronDown
          size={15}
          className={
            open
              ? "composition-chevron open"
              : "composition-chevron"
          }
        />
      </button>

      {open && (
        <div className="composition-selector-panel">
          <div className="composition-search">
            <Search size={15} />

            <input
              autoFocus
              value={search}
              onChange={(event) =>
                onSearch(
                  event.target.value
                )
              }
              placeholder={`Search ${title.toLowerCase()}...`}
            />

            {search && (
              <button
                type="button"
                onClick={() =>
                  onSearch("")
                }
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="composition-list">
            {options.length ===
            0 ? (
              <div className="composition-no-results">
                No results found.
              </div>
            ) : (
              options.map(
                (option) => {
                  const isSelected =
                    selected.includes(
                      option
                    );

                  const displayName =
                    formatOption
                      ? formatOption(
                          option
                        )
                      : option;

                  return (
                    <button
                      type="button"
                      key={option}
                      className={
                        isSelected
                          ? "composition-option selected"
                          : "composition-option"
                      }
                      onClick={() =>
                        toggleOption(
                          option
                        )
                      }
                    >
                      <div>
                        <strong>
                          {
                            displayName
                          }
                        </strong>

                        {displayName !==
                          option && (
                          <small>
                            {
                              option
                            }
                          </small>
                        )}
                      </div>

                      {isSelected && (
                        <Check
                          size={15}
                        />
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
  );
}

export default Composition;