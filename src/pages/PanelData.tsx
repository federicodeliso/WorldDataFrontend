import React, { useEffect, useMemo, useState } from "react";
import "./PanelData.css";

const API_BASE = "http://127.0.0.1:8000";

type Country = {
  name?: string;
  country_name?: string;
  code?: string;
  iso3?: string;
};

type Indicator = {
  indicator_id?: string | number;
  code?: string;
  name?: string;
  unit?: string;
};

type Coefficient = {
  variable: string;
  coefficient: number;
  std_error: number;
  t_stat: number;
  p_value: number;
  ci_lower: number;
  ci_upper: number;
};

type ModelResult = {
  r_squared?: number;
  adjusted_r_squared?: number | null;
  observations?: number;
  coefficients?: Coefficient[];
  error?: string;
};

type HausmanTest = {
  statistic?: number;
  degrees_of_freedom?: number;
  p_value?: number;
  null_hypothesis?: string;
  alternative_hypothesis?: string;
  interpretation?: string;
  error?: string;
};

type PanelResponse = {
  panel: {
    countries_requested: string[];
    countries_used: string[];
    countries: number;
    observations: number;
    years: number;
    start_year: number;
    end_year: number;
    balanced: boolean;
    dependent: string;
    independents: string[];
  };

  pooled_ols?: ModelResult;
  fixed_effects?: ModelResult;
  random_effects?: ModelResult;

  hausman_test?: HausmanTest | null;
};

const formatNumber = (
  value: number | null | undefined,
  digits = 4
) => {
  if (value === null || value === undefined) {
    return "—";
  }

  if (!Number.isFinite(value)) {
    return "—";
  }

  return value.toFixed(digits);
};

const formatPValue = (
  value: number | null | undefined
) => {
  if (value === null || value === undefined) {
    return "—";
  }

  if (!Number.isFinite(value)) {
    return "—";
  }

  if (value < 0.001) {
    return "<0.001";
  }

  return value.toFixed(3);
};

const getCountryName = (country: Country) =>
  country.name ||
  country.country_name ||
  country.code ||
  country.iso3 ||
  "";

const getIndicatorCode = (indicator: Indicator) =>
  indicator.code ||
  String(indicator.indicator_id || "");

const getIndicatorLabel = (indicator: Indicator) => {
  const code = getIndicatorCode(indicator);
  const name = indicator.name || code;

  if (indicator.unit) {
    return `${name} (${indicator.unit})`;
  }

  return name;
};

const getSignificanceClass = (pValue: number) => {
  if (pValue < 0.01) return "significance-strong";
  if (pValue < 0.05) return "significance-medium";
  if (pValue < 0.10) return "significance-weak";
  return "significance-none";
};

const CoefficientTable = ({
  result,
}: {
  result?: ModelResult;
}) => {
  if (!result) {
    return null;
  }

  if (result.error) {
    return (
      <div className="panel-model-error">
        {result.error}
      </div>
    );
  }

  if (!result.coefficients?.length) {
    return (
      <div className="panel-empty">
        No coefficient results available.
      </div>
    );
  }

  return (
    <div className="panel-table-wrapper">
      <table className="panel-table">
        <thead>
          <tr>
            <th>Variable</th>
            <th>Coefficient</th>
            <th>Std. Error</th>
            <th>t-stat</th>
            <th>p-value</th>
            <th>95% CI</th>
          </tr>
        </thead>

        <tbody>
          {result.coefficients.map((coefficient) => (
            <tr key={coefficient.variable}>
              <td className="panel-variable">
                {coefficient.variable}
              </td>

              <td>
                {formatNumber(
                  coefficient.coefficient
                )}
              </td>

              <td>
                {formatNumber(
                  coefficient.std_error
                )}
              </td>

              <td>
                {formatNumber(
                  coefficient.t_stat
                )}
              </td>

              <td>
                <span
                  className={getSignificanceClass(
                    coefficient.p_value
                  )}
                >
                  {formatPValue(
                    coefficient.p_value
                  )}
                </span>
              </td>

              <td>
                [
                {formatNumber(
                  coefficient.ci_lower,
                  3
                )}
                ,{" "}
                {formatNumber(
                  coefficient.ci_upper,
                  3
                )}
                ]
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ModelCard = ({
  title,
  subtitle,
  result,
}: {
  title: string;
  subtitle: string;
  result?: ModelResult;
}) => {
  return (
    <section className="panel-model-card">
      <div className="panel-model-header">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>

      {result?.error ? (
        <div className="panel-model-error">
          {result.error}
        </div>
      ) : (
        <>
          <div className="panel-model-stats">
            <div>
              <span>R²</span>
              <strong>
                {formatNumber(result?.r_squared)}
              </strong>
            </div>

            <div>
              <span>Adjusted R²</span>
              <strong>
                {formatNumber(
                  result?.adjusted_r_squared
                )}
              </strong>
            </div>

            <div>
              <span>Observations</span>
              <strong>
                {result?.observations ?? "—"}
              </strong>
            </div>
          </div>

          <CoefficientTable result={result} />
        </>
      )}
    </section>
  );
};

export default function PanelData() {
  const [countries, setCountries] = useState<Country[]>(
    []
  );

  const [indicators, setIndicators] = useState<
    Indicator[]
  >([]);

  const [selectedCountries, setSelectedCountries] =
    useState<string[]>([]);

  const [dependent, setDependent] =
    useState<string>("");

  const [independents, setIndependents] = useState<
    string[]
  >([]);

  const [startYear, setStartYear] =
    useState<number>(2000);

  const [endYear, setEndYear] =
    useState<number>(
      new Date().getFullYear() - 1
    );

  const [countrySearch, setCountrySearch] =
    useState("");

  const [indicatorSearch, setIndicatorSearch] =
    useState("");

  const [loadingMetadata, setLoadingMetadata] =
    useState(true);

  const [running, setRunning] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [result, setResult] =
    useState<PanelResponse | null>(null);

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        setLoadingMetadata(true);
        setError(null);

        const [
          countriesResponse,
          indicatorsResponse,
        ] = await Promise.all([
          fetch(
            `${API_BASE}/countries?limit=500`
          ),
          fetch(
            `${API_BASE}/indicators?limit=2000`
          ),
        ]);

        if (!countriesResponse.ok) {
          throw new Error(
            "Failed to load countries."
          );
        }

        if (!indicatorsResponse.ok) {
          throw new Error(
            "Failed to load indicators."
          );
        }

        const countriesData =
          await countriesResponse.json();

        const indicatorsData =
          await indicatorsResponse.json();

        setCountries(
          Array.isArray(countriesData)
            ? countriesData
            : countriesData.countries || []
        );

        setIndicators(
          Array.isArray(indicatorsData)
            ? indicatorsData
            : indicatorsData.indicators || []
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load metadata."
        );
      } finally {
        setLoadingMetadata(false);
      }
    };

    loadMetadata();
  }, []);

  const countryOptions = useMemo(() => {
    const search = countrySearch
      .trim()
      .toLowerCase();

    return countries
      .map(getCountryName)
      .filter(Boolean)
      .filter((country) =>
        country.toLowerCase().includes(search)
      )
      .sort((a, b) =>
        a.localeCompare(b)
      );
  }, [countries, countrySearch]);

  const indicatorOptions = useMemo(() => {
    const search = indicatorSearch
      .trim()
      .toLowerCase();

    return indicators
      .filter((indicator) => {
        const code =
          getIndicatorCode(indicator)
            .toLowerCase();

        const name =
          (indicator.name || "")
            .toLowerCase();

        return (
          !search ||
          code.includes(search) ||
          name.includes(search)
        );
      })
      .sort((a, b) =>
        getIndicatorLabel(a).localeCompare(
          getIndicatorLabel(b)
        )
      );
  }, [indicators, indicatorSearch]);

  const dependentIndicator =
    indicators.find(
      (indicator) =>
        getIndicatorCode(indicator) ===
        dependent
    );

  const independentIndicatorSet =
    new Set(independents);

  const toggleCountry = (
    country: string
  ) => {
    setSelectedCountries((current) => {
      if (current.includes(country)) {
        return current.filter(
          (item) => item !== country
        );
      }

      return [
        ...current,
        country,
      ];
    });
  };

  const toggleIndependent = (
    code: string
  ) => {
    setIndependents((current) => {
      if (current.includes(code)) {
        return current.filter(
          (item) => item !== code
        );
      }

      if (current.length >= 10) {
        return current;
      }

      return [
        ...current,
        code,
      ];
    });
  };

  const selectAllVisibleCountries = () => {
    setSelectedCountries((current) => {
      const merged = new Set([
        ...current,
        ...countryOptions,
      ]);

      return Array.from(merged);
    });
  };

  const clearCountries = () => {
    setSelectedCountries([]);
  };

  const runRegression = async () => {
    setError(null);
    setResult(null);

    if (selectedCountries.length < 2) {
      setError(
        "Select at least two countries."
      );
      return;
    }

    if (!dependent) {
      setError(
        "Select a dependent variable."
      );
      return;
    }

    if (independents.length === 0) {
      setError(
        "Select at least one independent variable."
      );
      return;
    }

    if (independents.includes(dependent)) {
      setError(
        "The dependent variable cannot also be an independent variable."
      );
      return;
    }

    if (startYear > endYear) {
      setError(
        "Start year must be before or equal to end year."
      );
      return;
    }

    try {
      setRunning(true);

      const response = await fetch(
        `${API_BASE}/panel/regression`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            countries:
              selectedCountries,
            dependent,
            independents,
            start_year: startYear,
            end_year: endYear,
            models: [
              "pooled_ols",
              "fixed_effects",
              "random_effects",
            ],
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Panel regression failed."
        );
      }

      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Panel regression failed."
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="panel-page">
      <div className="panel-page-header">
        <div>
          <div className="panel-eyebrow">
            ECONOMETRICS
          </div>

          <h1>Panel Data</h1>

          <p>
            Compare economic relationships across
            countries and over time using Pooled
            OLS, Fixed Effects and Random Effects.
          </p>
        </div>
      </div>

      {error && (
        <div className="panel-error">
          <strong>Error</strong>
          <span>{error}</span>
        </div>
      )}

      <div className="panel-layout">
        {/* LEFT CONTROLS */}
        <aside className="panel-controls">
          <section className="panel-control-section">
            <div className="panel-section-title">
              Countries
            </div>

            <div className="panel-selection-count">
              {selectedCountries.length} selected
            </div>

            <input
              className="panel-search"
              type="text"
              placeholder="Search countries..."
              value={countrySearch}
              onChange={(event) =>
                setCountrySearch(
                  event.target.value
                )
              }
            />

            <div className="panel-country-actions">
              <button
                type="button"
                onClick={
                  selectAllVisibleCountries
                }
              >
                Select visible
              </button>

              <button
                type="button"
                onClick={clearCountries}
              >
                Clear
              </button>
            </div>

            <div className="panel-country-list">
              {loadingMetadata ? (
                <div className="panel-loading-small">
                  Loading countries...
                </div>
              ) : (
                countryOptions.map(
                  (country) => (
                    <label
                      key={country}
                      className="panel-checkbox-row"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCountries.includes(
                          country
                        )}
                        onChange={() =>
                          toggleCountry(
                            country
                          )
                        }
                      />

                      <span>
                        {country}
                      </span>
                    </label>
                  )
                )
              )}
            </div>
          </section>

          {/* DEPENDENT VARIABLE */}
          <section className="panel-control-section">
            <div className="panel-section-title">
              Dependent variable (Y)
            </div>

            <select
              className="panel-select"
              value={dependent}
              onChange={(event) =>
                setDependent(
                  event.target.value
                )
              }
            >
              <option value="">
                Select dependent variable
              </option>

              {indicators.map(
                (indicator) => {
                  const code =
                    getIndicatorCode(
                      indicator
                    );

                  return (
                    <option
                      key={code}
                      value={code}
                    >
                      {code} —{" "}
                      {getIndicatorLabel(
                        indicator
                      )}
                    </option>
                  );
                }
              )}
            </select>

            {dependentIndicator && (
              <div className="panel-selected-indicator">
                <strong>
                  {getIndicatorCode(
                    dependentIndicator
                  )}
                </strong>

                <span>
                  {dependentIndicator.name}
                </span>
              </div>
            )}
          </section>

          {/* INDEPENDENT VARIABLES */}
          <section className="panel-control-section">
            <div className="panel-section-title">
              Independent variables (X)
            </div>

            <div className="panel-selection-count">
              {independents.length} selected / 10
            </div>

            <input
              className="panel-search"
              type="text"
              placeholder="Search indicators..."
              value={indicatorSearch}
              onChange={(event) =>
                setIndicatorSearch(
                  event.target.value
                )
              }
            />

            <div className="panel-indicator-list">
              {indicatorOptions.map(
                (indicator) => {
                  const code =
                    getIndicatorCode(
                      indicator
                    );

                  const selected =
                    independentIndicatorSet.has(
                      code
                    );

                  const disabled =
                    !selected &&
                    independents.length >=
                      10;

                  return (
                    <label
                      key={code}
                      className={`panel-checkbox-row ${
                        disabled
                          ? "disabled"
                          : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={disabled}
                        onChange={() =>
                          toggleIndependent(
                            code
                          )
                        }
                      />

                      <span>
                        <strong>
                          {code}
                        </strong>

                        {indicator.name && (
                          <small>
                            {indicator.name}
                          </small>
                        )}
                      </span>
                    </label>
                  );
                }
              )}
            </div>
          </section>

          {/* YEARS */}
          <section className="panel-control-section">
            <div className="panel-section-title">
              Time period
            </div>

            <div className="panel-year-grid">
              <label>
                <span>Start</span>

                <input
                  type="number"
                  value={startYear}
                  onChange={(event) =>
                    setStartYear(
                      Number(
                        event.target.value
                      )
                    )
                  }
                />
              </label>

              <label>
                <span>End</span>

                <input
                  type="number"
                  value={endYear}
                  onChange={(event) =>
                    setEndYear(
                      Number(
                        event.target.value
                      )
                    )
                  }
                />
              </label>
            </div>
          </section>

          <button
            className="panel-run-button"
            type="button"
            onClick={runRegression}
            disabled={
              running ||
              loadingMetadata
            }
          >
            {running
              ? "Running..."
              : "Run Panel Regression"}
          </button>
        </aside>

        {/* RESULTS */}
        <main className="panel-results">
          {!result && !running && (
            <div className="panel-placeholder">
              <div className="panel-placeholder-icon">
                β
              </div>

              <h2>
                Panel regression
              </h2>

              <p>
                Select countries, choose a dependent
                variable and at least one explanatory
                variable, then run the model.
              </p>
            </div>
          )}

          {running && (
            <div className="panel-placeholder">
              <div className="panel-spinner" />

              <h2>
                Estimating models...
              </h2>

              <p>
                Running Pooled OLS, Fixed Effects
                and Random Effects.
              </p>
            </div>
          )}

          {result && !running && (
            <>
              {/* PANEL SUMMARY */}
              <section className="panel-summary-card">
                <div className="panel-result-heading">
                  <div>
                    <div className="panel-eyebrow">
                      PANEL STRUCTURE
                    </div>

                    <h2>
                      {result.panel.dependent}
                    </h2>

                    <p>
                      {result.panel.start_year}–
                      {result.panel.end_year}
                    </p>
                  </div>

                  <div
                    className={`panel-balance-badge ${
                      result.panel.balanced
                        ? "balanced"
                        : "unbalanced"
                    }`}
                  >
                    {result.panel.balanced
                      ? "Balanced panel"
                      : "Unbalanced panel"}
                  </div>
                </div>

                <div className="panel-summary-grid">
                  <div>
                    <span>Countries</span>
                    <strong>
                      {result.panel.countries}
                    </strong>
                  </div>

                  <div>
                    <span>Observations</span>
                    <strong>
                      {result.panel.observations}
                    </strong>
                  </div>

                  <div>
                    <span>Years</span>
                    <strong>
                      {result.panel.years}
                    </strong>
                  </div>

                  <div>
                    <span>Dependent</span>
                    <strong>
                      {result.panel.dependent}
                    </strong>
                  </div>

                  <div>
                    <span>Explanatory variables</span>
                    <strong>
                      {
                        result.panel
                          .independents.length
                      }
                    </strong>
                  </div>
                </div>
              </section>

              {/* MODELS */}
              <div className="panel-model-grid">
                <ModelCard
                  title="Pooled OLS"
                  subtitle="Treats all observations as one pooled sample."
                  result={
                    result.pooled_ols
                  }
                />

                <ModelCard
                  title="Fixed Effects"
                  subtitle="Controls for time-invariant country-specific effects."
                  result={
                    result.fixed_effects
                  }
                />

                <ModelCard
                  title="Random Effects"
                  subtitle="Models country-specific effects as random."
                  result={
                    result.random_effects
                  }
                />
              </div>

              {/* HAUSMAN */}
              {result.hausman_test && (
                <section className="panel-hausman-card">
                  <div className="panel-section-heading">
                    <div>
                      <div className="panel-eyebrow">
                        MODEL SELECTION
                      </div>

                      <h2>
                        Hausman Test
                      </h2>
                    </div>
                  </div>

                  {result.hausman_test.error ? (
                    <div className="panel-model-error">
                      {
                        result.hausman_test
                          .error
                      }
                    </div>
                  ) : (
                    <>
                      <div className="panel-hausman-stats">
                        <div>
                          <span>
                            Test statistic
                          </span>

                          <strong>
                            {formatNumber(
                              result
                                .hausman_test
                                .statistic
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Degrees of freedom
                          </span>

                          <strong>
                            {
                              result
                                .hausman_test
                                .degrees_of_freedom
                            }
                          </strong>
                        </div>

                        <div>
                          <span>
                            p-value
                          </span>

                          <strong>
                            {formatPValue(
                              result
                                .hausman_test
                                .p_value
                            )}
                          </strong>
                        </div>
                      </div>

                      <div className="panel-hausman-explanation">
                        <p>
                          <strong>
                            H₀:
                          </strong>{" "}
                          {
                            result
                              .hausman_test
                              .null_hypothesis
                          }
                        </p>

                        <p>
                          <strong>
                            H₁:
                          </strong>{" "}
                          {
                            result
                              .hausman_test
                              .alternative_hypothesis
                          }
                        </p>

                        <div
                          className={`panel-hausman-result ${
                            result.hausman_test
                              .p_value !==
                              undefined &&
                            result.hausman_test
                              .p_value < 0.05
                              ? "prefer-fe"
                              : "prefer-re"
                          }`}
                        >
                          {
                            result
                              .hausman_test
                              .interpretation
                          }
                        </div>
                      </div>
                    </>
                  )}
                </section>
              )}

              {/* METHODOLOGY */}
              <section className="panel-methodology">
                <div className="panel-eyebrow">
                  METHODOLOGY
                </div>

                <h2>
                  How to interpret the models
                </h2>

                <div className="panel-method-grid">
                  <div>
                    <h3>
                      Pooled OLS
                    </h3>

                    <p>
                      Treats the panel observations as
                      one combined dataset and does not
                      explicitly control for country-specific
                      effects.
                    </p>
                  </div>

                  <div>
                    <h3>
                      Fixed Effects
                    </h3>

                    <p>
                      Estimates relationships from
                      within-country changes over time,
                      controlling for characteristics of
                      countries that do not change over
                      time.
                    </p>
                  </div>

                  <div>
                    <h3>
                      Random Effects
                    </h3>

                    <p>
                      Treats country-specific effects as
                      random and assumes they are not
                      correlated with the explanatory
                      variables.
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}