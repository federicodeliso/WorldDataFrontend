import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Bar,
  BarChart,
  CartesianGrid,
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

import "./DescriptiveStatistics.css";

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
  indicator_id: number;
  code: string;
  name: string;
  unit: string | null;
  description?: string | null;
  frequency?: string | null;
  category?: string | null;
};

type Observation = {
  country: string;
  indicator: string;
  year: number;
  value: number | null;
};

type Statistics = {
  n: number;
  mean: number;
  median: number;
  standardDeviation: number;
  variance: number;
  minimum: number;
  maximum: number;
  q1: number;
  q3: number;
  iqr: number;
  coefficientOfVariation: number;
};

type HistogramBin = {
  label: string;
  start: number;
  end: number;
  count: number;
};

function DescriptiveStatistics() {
  const [countries, setCountries] =
    useState<Country[]>([]);

  const [indicators, setIndicators] =
    useState<Indicator[]>([]);

  /*
   * IMPORTANT:
   *
   * selectedCountry stores the actual country name
   * expected by /data/{country}/{indicator}.
   *
   * selectedIndicator stores the indicator CODE,
   * not indicator_id.
   */
  const [selectedCountry, setSelectedCountry] =
    useState<string>("");

  const [selectedIndicator, setSelectedIndicator] =
    useState<string>("");

  const [observations, setObservations] =
    useState<Observation[]>([]);

  const [loadingMetadata, setLoadingMetadata] =
    useState(true);

  const [loadingData, setLoadingData] =
    useState(false);

  const [error, setError] =
    useState("");

  const [countrySearch, setCountrySearch] =
    useState("");

  const [indicatorSearch, setIndicatorSearch] =
    useState("");

  const [countryOpen, setCountryOpen] =
    useState(false);

  const [indicatorOpen, setIndicatorOpen] =
    useState(false);

  /* =======================================================
     LOAD COUNTRIES + INDICATORS
  ======================================================= */

  useEffect(() => {
    async function loadMetadata() {
      try {
        setLoadingMetadata(true);
        setError("");

        const [
          countriesResponse,
          indicatorsResponse,
        ] = await Promise.all([
          fetch(`${API}/countries?limit=500`),
          fetch(`${API}/indicators?limit=2000`),
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

        const countriesPayload =
          await countriesResponse.json();

        const indicatorsPayload =
          await indicatorsResponse.json();

        /*
         * Support both:
         *
         * [...]
         *
         * and:
         *
         * { countries: [...] }
         *
         * { indicators: [...] }
         *
         * This is the same robust pattern used
         * by the working Correlation page.
         */

        const countriesData: Country[] =
          Array.isArray(countriesPayload)
            ? countriesPayload
            : Array.isArray(
                countriesPayload?.countries
              )
            ? countriesPayload.countries
            : [];

        const indicatorsData: Indicator[] =
          Array.isArray(indicatorsPayload)
            ? indicatorsPayload
            : Array.isArray(
                indicatorsPayload?.indicators
              )
            ? indicatorsPayload.indicators
            : [];

        setCountries(countriesData);
        setIndicators(indicatorsData);

        /*
         * Store COUNTRY NAME, not ISO3/code/id.
         *
         * Example:
         * selectedCountry = "Italy"
         */
        if (countriesData.length > 0) {
          const firstCountry =
            countriesData[0];

          setSelectedCountry(
            getCountryDisplayName(firstCountry)
          );
        }

        /*
         * Store INDICATOR CODE, not indicator_id.
         *
         * Example:
         * selectedIndicator = "GDP_COM_CURRENT_EUR"
         */
        if (indicatorsData.length > 0) {
          setSelectedIndicator(
            indicatorsData[0].code
          );
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load metadata."
        );
      } finally {
        setLoadingMetadata(false);
      }
    }

    loadMetadata();
  }, []);

  /* =======================================================
     LOAD SERIES
  ======================================================= */

  useEffect(() => {
    if (
      !selectedCountry ||
      !selectedIndicator
    ) {
      return;
    }

    async function loadData() {
      try {
        setLoadingData(true);
        setError("");
        setObservations([]);

        /*
         * IMPORTANT:
         *
         * This produces:
         *
         * /data/Italy/GDP_COM_CURRENT_EUR
         *
         * which matches the working Correlation page.
         */

        const url =
          `${API}/data/${encodeURIComponent(
            selectedCountry
          )}/${encodeURIComponent(
            selectedIndicator
          )}`;

        console.log(
          "Loading descriptive statistics data:",
          url
        );

        const response =
          await fetch(url);

        if (!response.ok) {
          throw new Error(
            `${selectedCountry}/${selectedIndicator}: ${response.status}`
          );
        }

        const payload =
          await response.json();

        /*
         * Support both:
         *
         * [...]
         *
         * and:
         *
         * { data: [...] }
         */

        const data: unknown[] =
          Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.data)
            ? payload.data
            : [];

        const parsedObservations =
          data
            .map((item) => {
              const row =
                item as {
                  country?: unknown;
                  indicator?: unknown;
                  year?: unknown;
                  value?: unknown;
                };

              return {
                country:
                  String(
                    row.country ??
                      selectedCountry
                  ),
                indicator:
                  String(
                    row.indicator ??
                      selectedIndicator
                  ),
                year: Number(
                  row.year
                ),
                value:
                  row.value === null ||
                  row.value === undefined
                    ? null
                    : Number(
                        row.value
                      ),
              };
            })
            .filter(
              (item) =>
                Number.isFinite(
                  item.year
                ) &&
                item.value !== null &&
                Number.isFinite(
                  item.value
                )
            )
            .sort(
              (a, b) =>
                a.year - b.year
            );

        if (
          parsedObservations.length === 0
        ) {
          throw new Error(
            "The selected data series contains no usable observations."
          );
        }

        setObservations(
          parsedObservations
        );
      } catch (err) {
        console.error(
          "Descriptive statistics data error:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Could not load the selected data series."
        );

        setObservations([]);
      } finally {
        setLoadingData(false);
      }
    }

    loadData();
  }, [
    selectedCountry,
    selectedIndicator,
  ]);

  /* =======================================================
     SELECTED METADATA
  ======================================================= */

  const selectedCountryObject =
    useMemo(() => {
      return countries.find(
        (country) =>
          getCountryDisplayName(
            country
          ) === selectedCountry
      );
    }, [
      countries,
      selectedCountry,
    ]);

  const selectedIndicatorObject =
    useMemo(() => {
      return indicators.find(
        (indicator) =>
          indicator.code ===
          selectedIndicator
      );
    }, [
      indicators,
      selectedIndicator,
    ]);

  /* =======================================================
     STATISTICS
  ======================================================= */

  const values = useMemo(() => {
    return observations
      .map((item) =>
        Number(item.value)
      )
      .filter((value) =>
        Number.isFinite(value)
      );
  }, [observations]);

  const statistics =
    useMemo<Statistics | null>(() => {
      if (values.length === 0) {
        return null;
      }

      const sorted = [...values].sort(
        (a, b) => a - b
      );

      const n = sorted.length;

      const mean =
        sorted.reduce(
          (sum, value) =>
            sum + value,
          0
        ) / n;

      const median =
        percentile(sorted, 0.5);

      const q1 =
        percentile(sorted, 0.25);

      const q3 =
        percentile(sorted, 0.75);

      const variance =
        n > 1
          ? sorted.reduce(
              (sum, value) =>
                sum +
                Math.pow(
                  value - mean,
                  2
                ),
              0
            ) /
            (n - 1)
          : 0;

      const standardDeviation =
        Math.sqrt(variance);

      const coefficientOfVariation =
        mean !== 0
          ? (standardDeviation /
              Math.abs(mean)) *
            100
          : 0;

      return {
        n,
        mean,
        median,
        standardDeviation,
        variance,
        minimum: sorted[0],
        maximum: sorted[n - 1],
        q1,
        q3,
        iqr: q3 - q1,
        coefficientOfVariation,
      };
    }, [values]);

  /* =======================================================
     HISTOGRAM
  ======================================================= */

  const histogram =
    useMemo<HistogramBin[]>(() => {
      if (values.length === 0) {
        return [];
      }

      const minimum =
        Math.min(...values);

      const maximum =
        Math.max(...values);

      if (minimum === maximum) {
        return [
          {
            label:
              formatValue(minimum),
            start: minimum,
            end: maximum,
            count: values.length,
          },
        ];
      }

      /*
       * Sturges' rule:
       *
       * k = ceil(log2(n) + 1)
       */

      const binCount =
        Math.max(
          5,
          Math.min(
            12,
            Math.ceil(
              Math.log2(
                values.length
              ) + 1
            )
          )
        );

      const width =
        (maximum - minimum) /
        binCount;

      const bins: HistogramBin[] =
        Array.from(
          {
            length: binCount,
          },
          (_, index) => {
            const start =
              minimum +
              index * width;

            const end =
              index ===
              binCount - 1
                ? maximum
                : start + width;

            return {
              label: `${formatCompactValue(
                start
              )}–${formatCompactValue(
                end
              )}`,
              start,
              end,
              count: 0,
            };
          }
        );

      for (const value of values) {
        let index = Math.floor(
          (value - minimum) /
            width
        );

        if (
          index < 0 ||
          !Number.isFinite(index)
        ) {
          index = 0;
        }

        if (index >= binCount) {
          index =
            binCount - 1;
        }

        bins[index].count += 1;
      }

      return bins;
    }, [values]);

  /* =======================================================
     FILTERS
  ======================================================= */

  const filteredCountries =
    useMemo(() => {
      const query =
        countrySearch
          .trim()
          .toLowerCase();

      if (!query) {
        return countries;
      }

      return countries.filter(
        (country) => {
          const name =
            getCountryDisplayName(
              country
            );

          const code =
            getCountryCode(country);

          return (
            name
              .toLowerCase()
              .includes(query) ||
            code
              .toLowerCase()
              .includes(query)
          );
        }
      );
    }, [
      countries,
      countrySearch,
    ]);

  const filteredIndicators =
    useMemo(() => {
      const query =
        indicatorSearch
          .trim()
          .toLowerCase();

      if (!query) {
        return indicators;
      }

      return indicators.filter(
        (indicator) =>
          indicator.name
            .toLowerCase()
            .includes(query) ||
          indicator.code
            .toLowerCase()
            .includes(query) ||
          (
            indicator.category ??
            ""
          )
            .toLowerCase()
            .includes(query)
      );
    }, [
      indicators,
      indicatorSearch,
    ]);

  /* =======================================================
     LOADING
  ======================================================= */

  if (loadingMetadata) {
    return (
      <div className="page">
        <div className="loading">
          <Loader2
            size={18}
            className="ds-spin"
          />
          Loading descriptive
          statistics...
        </div>
      </div>
    );
  }

  /* =======================================================
     PAGE
  ======================================================= */

  return (
    <div className="ds-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Descriptive Statistics
          </h1>

          <p className="page-description">
            Summarize the distribution,
            central tendency and
            dispersion of an economic
            indicator for a selected
            country.
          </p>
        </div>
      </div>

      {/* =================================================
          CONTROLS
      ================================================= */}

      <section className="ds-controls">
        <div className="ds-control">
          <label className="ds-label">
            Country
          </label>

          <div className="ds-select">
            <button
              type="button"
              className="ds-select-trigger"
              onClick={() => {
                setCountryOpen(
                  (open) => !open
                );
                setIndicatorOpen(false);
              }}
            >
              <span>
                {selectedCountryObject
                  ? getCountryDisplayName(
                      selectedCountryObject
                    )
                  : selectedCountry ||
                    "Select country"}
              </span>

              <ChevronDown
                size={15}
              />
            </button>

            {countryOpen && (
              <div className="ds-select-menu">
                <div className="ds-select-search">
                  <Search
                    size={14}
                  />

                  <input
                    value={
                      countrySearch
                    }
                    onChange={(event) =>
                      setCountrySearch(
                        event.target.value
                      )
                    }
                    placeholder="Search countries..."
                    autoFocus
                  />
                </div>

                <div className="ds-select-options">
                  {filteredCountries.map(
                    (country) => {
                      /*
                       * The key used for
                       * selection is now
                       * the actual country
                       * name.
                       */
                      const key =
                        getCountryDisplayName(
                          country
                        );

                      const isSelected =
                        key ===
                        selectedCountry;

                      return (
                        <button
                          type="button"
                          key={`${key}-${getCountryCode(
                            country
                          )}`}
                          className={`ds-select-option ${
                            isSelected
                              ? "selected"
                              : ""
                          }`}
                          onClick={() => {
                            setSelectedCountry(
                              key
                            );

                            setCountryOpen(
                              false
                            );

                            setCountrySearch(
                              ""
                            );
                          }}
                        >
                          <span>
                            {
                              getCountryDisplayName(
                                country
                              )
                            }
                          </span>

                          {getCountryCode(
                            country
                          ) && (
                            <small>
                              {
                                getCountryCode(
                                  country
                                )
                              }
                            </small>
                          )}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="ds-control">
          <label className="ds-label">
            Indicator
          </label>

          <div className="ds-select">
            <button
              type="button"
              className="ds-select-trigger"
              onClick={() => {
                setIndicatorOpen(
                  (open) => !open
                );
                setCountryOpen(false);
              }}
            >
              <span className="ds-indicator-selected">
                {selectedIndicatorObject
                  ? selectedIndicatorObject.name
                  : selectedIndicator ||
                    "Select indicator"}
              </span>

              <ChevronDown
                size={15}
              />
            </button>

            {indicatorOpen && (
              <div className="ds-select-menu ds-indicator-menu">
                <div className="ds-select-search">
                  <Search
                    size={14}
                  />

                  <input
                    value={
                      indicatorSearch
                    }
                    onChange={(event) =>
                      setIndicatorSearch(
                        event.target.value
                      )
                    }
                    placeholder="Search indicators..."
                    autoFocus
                  />
                </div>

                <div className="ds-select-options">
                  {filteredIndicators.map(
                    (indicator) => {
                      /*
                       * IMPORTANT:
                       *
                       * Use indicator CODE
                       * rather than indicator_id.
                       */
                      const key =
                        indicator.code;

                      const isSelected =
                        key ===
                        selectedIndicator;

                      return (
                        <button
                          type="button"
                          key={key}
                          className={`ds-select-option ${
                            isSelected
                              ? "selected"
                              : ""
                          }`}
                          onClick={() => {
                            setSelectedIndicator(
                              key
                            );

                            setIndicatorOpen(
                              false
                            );

                            setIndicatorSearch(
                              ""
                            );
                          }}
                        >
                          <div>
                            <strong>
                              {
                                indicator.name
                              }
                            </strong>

                            <small>
                              {
                                indicator.code
                              }

                              {indicator.unit
                                ? ` · ${indicator.unit}`
                                : ""}
                            </small>
                          </div>
                        </button>
                      );
                    }
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* =================================================
          ERROR
      ================================================= */}

      {error && (
        <div className="ds-error">
          <div>
            <strong>
              Unable to load data
            </strong>

            <p>{error}</p>
          </div>

          <button
            type="button"
            onClick={() =>
              setError("")
            }
            aria-label="Dismiss"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* =================================================
          SELECTED SERIES
      ================================================= */}

      {selectedIndicatorObject && (
        <section className="ds-series-header">
          <div>
            <div className="ds-series-code">
              {
                selectedIndicatorObject.code
              }
            </div>

            <h2>
              {
                selectedIndicatorObject.name
              }
            </h2>

            <p>
              {selectedCountryObject
                ? getCountryDisplayName(
                    selectedCountryObject
                  )
                : selectedCountry}

              {selectedIndicatorObject.unit
                ? ` · ${selectedIndicatorObject.unit}`
                : ""}
            </p>
          </div>

          <div className="ds-series-meta">
            {selectedIndicatorObject
              .frequency && (
              <span>
                {
                  selectedIndicatorObject.frequency
                }
              </span>
            )}

            {observations.length > 0 && (
              <span>
                {observations[0].year}–
                {
                  observations[
                    observations.length -
                      1
                  ].year
                }
              </span>
            )}
          </div>
        </section>
      )}

      {/* =================================================
          LOADING DATA
      ================================================= */}

      {loadingData ? (
        <div className="ds-loading">
          <Loader2
            size={18}
            className="ds-spin"
          />

          <span>
            Calculating statistics...
          </span>
        </div>
      ) : statistics ? (
        <>
          {/* ===============================================
              METRICS
          =============================================== */}

          <section className="ds-metrics">
            <Metric
              label="Observations"
              value={formatInteger(
                statistics.n
              )}
            />

            <Metric
              label="Mean"
              value={formatValue(
                statistics.mean
              )}
            />

            <Metric
              label="Median"
              value={formatValue(
                statistics.median
              )}
            />

            <Metric
              label="Std. Deviation"
              value={formatValue(
                statistics.standardDeviation
              )}
            />

            <Metric
              label="Minimum"
              value={formatValue(
                statistics.minimum
              )}
            />

            <Metric
              label="Maximum"
              value={formatValue(
                statistics.maximum
              )}
            />

            <Metric
              label="Q1"
              value={formatValue(
                statistics.q1
              )}
            />

            <Metric
              label="Q3"
              value={formatValue(
                statistics.q3
              )}
            />

            <Metric
              label="IQR"
              value={formatValue(
                statistics.iqr
              )}
            />

            <Metric
              label="Variance"
              value={formatValue(
                statistics.variance
              )}
            />

            <Metric
              label="Coefficient of Variation"
              value={`${formatValue(
                statistics.coefficientOfVariation
              )}%`}
            />

            <Metric
              label="Range"
              value={formatValue(
                statistics.maximum -
                  statistics.minimum
              )}
            />
          </section>

          {/* ===============================================
              CHART + SUMMARY
          =============================================== */}

          <section className="ds-analysis-grid">
            <div className="ds-card">
              <div className="ds-card-header">
                <div>
                  <h3>
                    Distribution
                  </h3>

                  <p>
                    Frequency of
                    observations across
                    value intervals.
                  </p>
                </div>
              </div>

              <div className="ds-chart">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <BarChart
                    data={histogram}
                    margin={{
                      top: 10,
                      right: 12,
                      left: 0,
                      bottom: 10,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="label"
                      tick={{
                        fontSize: 10,
                      }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />

                    <YAxis
                      allowDecimals={false}
                      tick={{
                        fontSize: 10,
                      }}
                      tickLine={false}
                      axisLine={false}
                    />

                    <Tooltip
                      formatter={(
                        value
                      ) => [
                        value,
                        "Observations",
                      ]}
                      labelFormatter={(
                        label
                      ) =>
                        `Range: ${label}`
                      }
                    />

                    <Bar
                      dataKey="count"
                      fill="#475467"
                      radius={[
                        3,
                        3,
                        0,
                        0,
                      ]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="ds-card">
              <div className="ds-card-header">
                <div>
                  <h3>
                    Statistical Summary
                  </h3>

                  <p>
                    Main measures of
                    location and
                    dispersion.
                  </p>
                </div>
              </div>

              <div className="ds-summary">
                <SummaryRow
                  label="Mean"
                  value={formatValue(
                    statistics.mean
                  )}
                />

                <SummaryRow
                  label="Median"
                  value={formatValue(
                    statistics.median
                  )}
                />

                <SummaryRow
                  label="Standard deviation"
                  value={formatValue(
                    statistics.standardDeviation
                  )}
                />

                <SummaryRow
                  label="Variance"
                  value={formatValue(
                    statistics.variance
                  )}
                />

                <SummaryRow
                  label="Minimum"
                  value={formatValue(
                    statistics.minimum
                  )}
                />

                <SummaryRow
                  label="Maximum"
                  value={formatValue(
                    statistics.maximum
                  )}
                />

                <SummaryRow
                  label="First quartile (Q1)"
                  value={formatValue(
                    statistics.q1
                  )}
                />

                <SummaryRow
                  label="Third quartile (Q3)"
                  value={formatValue(
                    statistics.q3
                  )}
                />

                <SummaryRow
                  label="Interquartile range"
                  value={formatValue(
                    statistics.iqr
                  )}
                />

                <SummaryRow
                  label="Coefficient of variation"
                  value={`${formatValue(
                    statistics.coefficientOfVariation
                  )}%`}
                />
              </div>
            </div>
          </section>

          {/* ===============================================
              OBSERVATIONS
          =============================================== */}

          <section className="ds-card ds-observations-card">
            <div className="ds-card-header">
              <div>
                <h3>
                  Observations
                </h3>

                <p>
                  Historical values used
                  to calculate the
                  statistics.
                </p>
              </div>

              <span className="ds-observation-count">
                {observations.length}{" "}
                observations
              </span>
            </div>

            <div className="ds-table-wrapper">
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Value</th>
                  </tr>
                </thead>

                <tbody>
                  {[
                    ...observations,
                  ]
                    .reverse()
                    .map(
                      (
                        observation,
                        index
                      ) => (
                        <tr
                          key={`${observation.year}-${index}`}
                        >
                          <td>
                            {
                              observation.year
                            }
                          </td>

                          <td>
                            {formatValue(
                              Number(
                                observation.value
                              )
                            )}

                            {selectedIndicatorObject?.unit
                              ? ` ${selectedIndicatorObject.unit}`
                              : ""}
                          </td>
                        </tr>
                      )
                    )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ===============================================
              METHODOLOGY
          =============================================== */}

          <div className="ds-method-note">
            <strong>
              Methodology
            </strong>

            <span>
              Standard deviation and
              variance use the sample
              formula (n − 1). Quartiles
              are calculated using
              linear interpolation.
              Missing observations are
              excluded from the
              calculations.
            </span>
          </div>
        </>
      ) : (
        !error && (
          <div className="ds-empty">
            <h3>
              No observations available
            </h3>

            <p>
              There are no usable
              observations for the
              selected country and
              indicator.
            </p>
          </div>
        )
      )}
    </div>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="ds-metric">
      <div className="ds-metric-label">
        {label}
      </div>

      <div className="ds-metric-value">
        {value}
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="ds-summary-row">
      <span>{label}</span>

      <strong>{value}</strong>
    </div>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function getCountryDisplayName(
  country: Country
): string {
  return (
    country.name ??
    country.country_name ??
    ""
  );
}

function getCountryCode(
  country: Country
): string {
  return (
    country.iso3 ??
    country.code ??
    ""
  );
}

function percentile(
  sorted: number[],
  probability: number
): number {
  if (sorted.length === 0) {
    return NaN;
  }

  if (sorted.length === 1) {
    return sorted[0];
  }

  const position =
    (sorted.length - 1) *
    probability;

  const lower =
    Math.floor(position);

  const upper =
    Math.ceil(position);

  if (lower === upper) {
    return sorted[lower];
  }

  const weight =
    position - lower;

  return (
    sorted[lower] *
      (1 - weight) +
    sorted[upper] *
      weight
  );
}

function formatValue(
  value: number
): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  const absolute =
    Math.abs(value);

  if (
    absolute >=
      1_000_000_000 ||
    (absolute > 0 &&
      absolute < 0.0001)
  ) {
    return value.toExponential(
      3
    );
  }

  if (
    absolute >= 1_000_000
  ) {
    return value.toLocaleString(
      "en-US",
      {
        maximumFractionDigits: 2,
      }
    );
  }

  return value.toLocaleString(
    "en-US",
    {
      maximumFractionDigits: 4,
    }
  );
}

function formatCompactValue(
  value: number
): string {
  const absolute =
    Math.abs(value);

  if (
    absolute >= 1_000_000_000
  ) {
    return `${(
      value / 1_000_000_000
    ).toFixed(1)}B`;
  }

  if (
    absolute >= 1_000_000
  ) {
    return `${(
      value / 1_000_000
    ).toFixed(1)}M`;
  }

  if (
    absolute >= 1_000
  ) {
    return `${(
      value / 1_000
    ).toFixed(1)}K`;
  }

  return value.toLocaleString(
    "en-US",
    {
      maximumFractionDigits: 2,
    }
  );
}

function formatInteger(
  value: number
): string {
  return value.toLocaleString(
    "en-US"
  );
}

export default DescriptiveStatistics;