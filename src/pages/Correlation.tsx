import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import {
  Check,
  ChevronDown,
  Download,
  Loader2,
  Pause,
  Play,
  Search,
  X,
} from "lucide-react";
import "./Correlation.css";

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

type Observation = {
  country: string;
  indicator: string;
  year: number;
  value: number;
};

type Point = {
  country: string;
  x: number;
  y: number;
};

type Regression = {
  slope: number;
  intercept: number;
  r: number;
  rSquared: number;
  n: number;
  minX: number;
  maxX: number;
};

function Correlation() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);

  const [xIndicator, setXIndicator] = useState("GDP");
  const [yIndicator, setYIndicator] = useState("POP");

  const [year, setYear] = useState(2023);
  const [selectedCountries, setSelectedCountries] =
    useState<string[]>([]);

  const [countrySearch, setCountrySearch] = useState("");
  const [countriesOpen, setCountriesOpen] =
    useState(false);

  const [observations, setObservations] =
    useState<Observation[]>([]);

  const [loadingMetadata, setLoadingMetadata] =
    useState(true);

  const [loadingData, setLoadingData] =
    useState(false);

  const [downloading, setDownloading] =
    useState(false);

  const [playing, setPlaying] = useState(false);

  const [error, setError] = useState("");

  const controlsRef =
    useRef<HTMLDivElement>(null);

  const chartRef =
    useRef<HTMLDivElement>(null);

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

        const allCountryNames = Array.from(
          new Set(
            countryRows
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

        setSelectedCountries(allCountryNames);

        const codes = indicatorRows.map(
          (item) => item.code
        );

        if (
          !codes.includes("GDP") &&
          codes.length > 0
        ) {
          setXIndicator(codes[0]);
        }

        if (
          !codes.includes("POP") &&
          codes.length > 1
        ) {
          setYIndicator(codes[1]);
        } else if (
          codes.length > 0 &&
          xIndicator === yIndicator
        ) {
          setYIndicator(
            codes.find(
              (code) => code !== xIndicator
            ) ?? codes[0]
          );
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load correlation metadata."
        );
      } finally {
        setLoadingMetadata(false);
      }
    }

    loadMetadata();
  }, []);

  /*
   * ---------------------------------------------------------
   * CLOSE COUNTRY DROPDOWN
   * ---------------------------------------------------------
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
   * ---------------------------------------------------------
   * LOAD FULL SELECTED SERIES
   *
   * We load the full history once. The year player then
   * changes the displayed year locally, so playback does
   * not repeatedly call the API.
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (
      selectedCountries.length === 0 ||
      !xIndicator ||
      !yIndicator
    ) {
      setObservations([]);
      setPlaying(false);
      return;
    }

    async function loadCorrelationData() {
      try {
        setLoadingData(true);
        setError("");
        setPlaying(false);

        const requests = selectedCountries.flatMap(
          (country) => [
            {
              country,
              indicator: xIndicator,
            },
            {
              country,
              indicator: yIndicator,
            },
          ]
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
              : json.results ??
                json.data ??
                [];
          })
        );

        const allRows: Observation[] = [];

        for (
          let i = 0;
          i < requests.length;
          i += 1
        ) {
          const request = requests[i];
          const rows = resultSets[i];

          rows.forEach((row: any) => {
            const rowYear = Number(row.year);
            const value = Number(row.value);

            if (
              Number.isFinite(rowYear) &&
              Number.isFinite(value)
            ) {
              allRows.push({
                country: request.country,
                indicator: request.indicator,
                year: rowYear,
                value,
              });
            }
          });
        }

        setObservations(allRows);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load correlation data."
        );

        setObservations([]);
      } finally {
        setLoadingData(false);
      }
    }

    loadCorrelationData();
  }, [
    selectedCountries,
    xIndicator,
    yIndicator,
  ]);

  /*
   * ---------------------------------------------------------
   * AVAILABLE PLAY YEARS
   * Only years with at least two complete country pairs
   * are included.
   * ---------------------------------------------------------
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

  const playYears = useMemo(() => {
    return availableYears.filter(
      (itemYear) =>
        buildPointsForYear(
          observations,
          itemYear,
          xIndicator,
          yIndicator
        ).length >= 2
    );
  }, [
    observations,
    availableYears,
    xIndicator,
    yIndicator,
  ]);

  /*
   * ---------------------------------------------------------
   * KEEP YEAR VALID
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (availableYears.length === 0) {
      return;
    }

    if (!availableYears.includes(year)) {
      setYear(
        availableYears[
          availableYears.length - 1
        ]
      );
    }
  }, [availableYears, year]);

  /*
   * ---------------------------------------------------------
   * YEAR PLAYBACK
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (
      !playing ||
      playYears.length < 2
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      setYear((currentYear) => {
        const currentIndex =
          playYears.indexOf(currentYear);

        if (
          currentIndex === -1 ||
          currentIndex >=
            playYears.length - 1
        ) {
          setPlaying(false);
          return playYears[
            playYears.length - 1
          ];
        }

        return playYears[
          currentIndex + 1
        ];
      });
    }, 1100);

    return () => {
      window.clearInterval(interval);
    };
  }, [playing, playYears]);

  /*
   * ---------------------------------------------------------
   * CURRENT POINTS
   * ---------------------------------------------------------
   */

  const points = useMemo(
    () =>
      buildPointsForYear(
        observations,
        year,
        xIndicator,
        yIndicator
      ),
    [
      observations,
      year,
      xIndicator,
      yIndicator,
    ]
  );

  /*
   * ---------------------------------------------------------
   * REGRESSION
   * ---------------------------------------------------------
   */

  const regression = useMemo<Regression | null>(
    () => calculateRegression(points),
    [points]
  );

  /*
   * ---------------------------------------------------------
   * COUNTRY OPTIONS
   * Selected countries are always on top.
   * ---------------------------------------------------------
   */

  const countryOptions = useMemo(() => {
    const names = Array.from(
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
    );

    const query =
      countrySearch.trim().toLowerCase();

    return names
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

        if (aSelected && !bSelected) {
          return -1;
        }

        if (!aSelected && bSelected) {
          return 1;
        }

        return a.localeCompare(b);
      });
  }, [
    countries,
    countrySearch,
    selectedCountries,
  ]);

  /*
   * ---------------------------------------------------------
   * DOWNLOAD
   * ---------------------------------------------------------
   */

  async function downloadChart() {
    if (!chartRef.current) {
      return;
    }

    try {
      setDownloading(true);

      const image = await toPng(
        chartRef.current,
        {
          cacheBust: true,
          pixelRatio: 2,
          backgroundColor: "#ffffff",
        }
      );

      const link =
        document.createElement("a");

      link.download =
        `worlddata-correlation-${xIndicator}-vs-${yIndicator}-${year}.png`;

      link.href = image;
      link.click();
    } catch (err) {
      console.error(
        "Could not download correlation chart:",
        err
      );
    } finally {
      setDownloading(false);
    }
  }

  /*
   * ---------------------------------------------------------
   * FORMAT
   * ---------------------------------------------------------
   */

  function formatNumber(value: number) {
    if (!Number.isFinite(value)) {
      return "—";
    }

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

  /*
   * ---------------------------------------------------------
   * LOADING SCREEN
   * ---------------------------------------------------------
   */

  if (loadingMetadata) {
    return (
      <section className="correlation-page">
        <div className="correlation-loading">
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
   * ---------------------------------------------------------
   * RENDER
   * ---------------------------------------------------------
   */

  return (
    <section className="correlation-page">
      <div className="correlation-heading">
        <div>
          <div className="eyebrow">
            WORLD DATA · RELATIONSHIPS
          </div>

          <h1>Correlation</h1>

          <p>
            Explore whether two indicators move
            together across countries.
          </p>
        </div>

        {regression && (
          <div className="correlation-summary">
            <span>CORRELATION</span>

            <strong>
              {regression.r >= 0
                ? "+"
                : ""}
              {regression.r.toFixed(2)}
            </strong>

            <small>
              {regression.n} countries
            </small>
          </div>
        )}
      </div>

      {error && (
        <div className="correlation-error">
          <strong>
            Unable to load data
          </strong>

          <span>{error}</span>
        </div>
      )}

      <div
        className="correlation-controls"
        ref={controlsRef}
      >
        {/* COUNTRIES */}

        <div className="correlation-control correlation-country-control">
          <label>COUNTRIES</label>

          <button
            type="button"
            className="correlation-selector-button"
            onClick={() =>
              setCountriesOpen(
                (open) => !open
              )
            }
          >
            <div className="correlation-selected-tags">
              {selectedCountries.length ===
              0 ? (
                <span className="correlation-placeholder">
                  Select countries
                </span>
              ) : (
                <>
                  {selectedCountries
                    .slice(0, 2)
                    .map((country) => (
                      <span
                        key={country}
                        className="correlation-selection-tag"
                      >
                        {country}
                        <X size={11} />
                      </span>
                    ))}

                  {selectedCountries.length >
                    2 && (
                    <span className="correlation-selection-more">
                      +
                      {selectedCountries.length -
                        2}
                    </span>
                  )}
                </>
              )}
            </div>

            <ChevronDown
              size={15}
              className={
                countriesOpen
                  ? "selector-chevron open"
                  : "selector-chevron"
              }
            />
          </button>

          {countriesOpen && (
            <div className="correlation-country-panel">
              <div className="correlation-country-search">
                <Search size={15} />

                <input
                  autoFocus
                  value={countrySearch}
                  onChange={(event) =>
                    setCountrySearch(
                      event.target.value
                    )
                  }
                  placeholder="Search countries..."
                />

                {countrySearch && (
                  <button
                    type="button"
                    className="correlation-search-clear"
                    onClick={() =>
                      setCountrySearch("")
                    }
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="correlation-country-actions">
                <button
                  type="button"
                  onClick={() => {
                    const all =
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
                        .sort(
                          (a, b) =>
                            a.localeCompare(
                              b
                            )
                        );

                    setSelectedCountries(
                      all
                    );
                  }}
                >
                  All
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setSelectedCountries(
                      []
                    )
                  }
                >
                  Clear
                </button>
              </div>

              <div className="correlation-country-list">
                {countryOptions.length ===
                0 ? (
                  <div className="correlation-country-empty">
                    No countries found.
                  </div>
                ) : (
                  countryOptions.map(
                    (country) => {
                      const selected =
                        selectedCountries.includes(
                          country
                        );

                      return (
                        <button
                          type="button"
                          key={country}
                          className={
                            selected
                              ? "correlation-country-option selected"
                              : "correlation-country-option"
                          }
                          onClick={() => {
                            setSelectedCountries(
                              selected
                                ? selectedCountries.filter(
                                    (
                                      item
                                    ) =>
                                      item !==
                                      country
                                  )
                                : [
                                    ...selectedCountries,
                                    country,
                                  ]
                            );
                          }}
                        >
                          <span>
                            {country}
                          </span>

                          {selected && (
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

        {/* X AXIS */}

        <div className="correlation-control">
          <label>X AXIS</label>

          <select
            value={xIndicator}
            onChange={(event) =>
              setXIndicator(
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

        {/* Y AXIS */}

        <div className="correlation-control">
          <label>Y AXIS</label>

          <select
            value={yIndicator}
            onChange={(event) =>
              setYIndicator(
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

        {/* YEAR */}

        <div className="correlation-control year-control">
          <label>YEAR</label>

          <div className="correlation-year-row">
            <select
              value={year}
              onChange={(event) => {
                setYear(
                  Number(
                    event.target.value
                  )
                );
                setPlaying(false);
              }}
              disabled={
                playYears.length === 0
              }
            >
              {availableYears.map((item) => (
                <option
                  key={item}
                  value={item}
                >
                  {item}
                </option>
              ))}
            </select>

            <button
              type="button"
              className={
                playing
                  ? "correlation-play-button playing"
                  : "correlation-play-button"
              }
              onClick={() => {
                if (
                  playYears.length < 2
                ) {
                  return;
                }

                if (
                  !playing &&
                  year ===
                    playYears[
                      playYears.length - 1
                    ]
                ) {
                  setYear(playYears[0]);
                }

                setPlaying(
                  (current) => !current
                );
              }}
              disabled={
                playYears.length < 2
              }
              aria-label={
                playing
                  ? "Pause year animation"
                  : "Play year animation"
              }
            >
              {playing ? (
                <Pause size={14} />
              ) : (
                <Play size={14} />
              )}
            </button>
          </div>
        </div>
      </div>

      {selectedCountries.length === 0 ? (
        <div className="correlation-card">
          <div className="correlation-empty">
            <h3>
              Select at least one country
            </h3>

            <p>
              Choose countries above to build
              the correlation analysis.
            </p>
          </div>
        </div>
      ) : (
        <div className="correlation-card">
          <div className="correlation-card-header">
            <div>
              <div className="eyebrow">
                SCATTER ANALYSIS
              </div>

              <h2>
                {xIndicator} vs {yIndicator}
              </h2>

              <p>
                {year} · {points.length}{" "}
                countries
                {playing && " · Playing"}
              </p>
            </div>

            <div className="correlation-actions">
              <button
                type="button"
                className="correlation-download"
                onClick={downloadChart}
                disabled={
                  downloading ||
                  points.length < 2
                }
              >
                <Download size={14} />

                {downloading
                  ? "Exporting..."
                  : "Download PNG"}
              </button>

              {regression && (
                <div className="regression-stat">
                  <span>R²</span>

                  <strong>
                    {regression.rSquared.toFixed(
                      3
                    )}
                  </strong>
                </div>
              )}
            </div>
          </div>

          <div
            className="correlation-chart"
            ref={chartRef}
          >
            {loadingData ? (
              <div className="correlation-loading">
                <Loader2
                  className="spin"
                  size={18}
                />
                Loading selected countries...
              </div>
            ) : points.length < 2 ? (
              <div className="correlation-empty">
                <h3>
                  Not enough observations
                </h3>

                <p>
                  At least two countries need
                  observations for both indicators
                  in {year}.
                </p>
              </div>
            ) : (
              <ResponsiveContainer
                width="100%"
                height={520}
              >
                <ScatterChart
                  key={`${xIndicator}-${yIndicator}-${year}`}
                  margin={{
                    top: 20,
                    right: 30,
                    bottom: 55,
                    left: 35,
                  }}
                >
                  <CartesianGrid
                    stroke="#e8ecf1"
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    type="number"
                    dataKey="x"
                    name={xIndicator}
                    tick={{
                      fontSize: 10,
                      fill: "#64748b",
                    }}
                    tickLine={false}
                    axisLine={{
                      stroke: "#e5e7eb",
                    }}
                    tickFormatter={formatNumber}
                    label={{
                      value: xIndicator,
                      position: "bottom",
                      offset: 25,
                      style: {
                        fontSize: 11,
                        fill: "#64748b",
                      },
                    }}
                  />

                  <YAxis
                    type="number"
                    dataKey="y"
                    name={yIndicator}
                    tick={{
                      fontSize: 10,
                      fill: "#64748b",
                    }}
                    tickLine={false}
                    axisLine={{
                      stroke: "#e5e7eb",
                    }}
                    tickFormatter={formatNumber}
                    label={{
                      value: yIndicator,
                      angle: -90,
                      position: "insideLeft",
                      style: {
                        fontSize: 11,
                        fill: "#64748b",
                      },
                    }}
                  />

                  <ZAxis range={[48, 48]} />

                  <Tooltip
                    cursor={{
                      strokeDasharray: "3 3",
                    }}
                    content={({
                      active,
                      payload,
                    }) => {
                      if (
                        !active ||
                        !payload ||
                        payload.length === 0
                      ) {
                        return null;
                      }

                      const point =
                        payload[0]
                          ?.payload as
                          | Point
                          | undefined;

                      if (!point) {
                        return null;
                      }

                      return (
                        <div className="correlation-tooltip">
                          <strong>
                            {point.country}
                          </strong>

                          <span>
                            {xIndicator}:{" "}
                            {formatNumber(
                              point.x
                            )}
                          </span>

                          <span>
                            {yIndicator}:{" "}
                            {formatNumber(
                              point.y
                            )}
                          </span>

                          <span className="correlation-tooltip-year">
                            {year}
                          </span>
                        </div>
                      );
                    }}
                  />

                  <Scatter
                    name={`${xIndicator} vs ${yIndicator}`}
                    data={points}
                    fill="#2563eb"
                    isAnimationActive
                    animationDuration={700}
                    animationEasing="ease-in-out"
                  />

                  {regression && (
                    <Scatter
                      name="Regression"
                      data={[
                        {
                          x: regression.minX,
                          y:
                            regression.slope *
                              regression.minX +
                            regression.intercept,
                        },
                        {
                          x: regression.maxX,
                          y:
                            regression.slope *
                              regression.maxX +
                            regression.intercept,
                        },
                      ]}
                      line={{
                        stroke: "#dc2626",
                        strokeWidth: 2,
                        strokeDasharray: "6 5",
                      }}
                      lineType="joint"
                      shape={() => null}
                      isAnimationActive={false}
                    />
                  )}
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>

          {regression && (
            <div className="correlation-stats">
              <div>
                <span>Correlation r</span>

                <strong>
                  {regression.r.toFixed(3)}
                </strong>
              </div>

              <div>
                <span>R²</span>

                <strong>
                  {regression.rSquared.toFixed(
                    3
                  )}
                </strong>
              </div>

              <div>
                <span>Observations</span>

                <strong>
                  {regression.n}
                </strong>
              </div>

              <div>
                <span>Relationship</span>

                <strong>
                  {relationshipLabel(
                    regression.r
                  )}
                </strong>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/*
 * =========================================================
 * BUILD YEAR POINTS
 * =========================================================
 */

function buildPointsForYear(
  observations: Observation[],
  year: number,
  xIndicator: string,
  yIndicator: string
): Point[] {
  const xValues = new Map<
    string,
    number
  >();

  const yValues = new Map<
    string,
    number
  >();

  observations.forEach((observation) => {
    if (observation.year !== year) {
      return;
    }

    if (
      observation.indicator ===
      xIndicator
    ) {
      xValues.set(
        observation.country,
        observation.value
      );
    }

    if (
      observation.indicator ===
      yIndicator
    ) {
      yValues.set(
        observation.country,
        observation.value
      );
    }
  });

  const combined: Point[] = [];

  xValues.forEach((x, country) => {
    const y = yValues.get(country);

    if (
      y !== undefined &&
      Number.isFinite(x) &&
      Number.isFinite(y)
    ) {
      combined.push({
        country,
        x,
        y,
      });
    }
  });

  return combined.sort((a, b) =>
    a.country.localeCompare(b.country)
  );
}

/*
 * =========================================================
 * REGRESSION
 * =========================================================
 */

function calculateRegression(
  points: Point[]
): Regression | null {
  if (points.length < 2) {
    return null;
  }

  const n = points.length;

  const meanX =
    points.reduce(
      (sum, point) => sum + point.x,
      0
    ) / n;

  const meanY =
    points.reduce(
      (sum, point) => sum + point.y,
      0
    ) / n;

  let numerator = 0;
  let denominator = 0;
  let sumXX = 0;
  let sumYY = 0;

  points.forEach((point) => {
    const dx = point.x - meanX;
    const dy = point.y - meanY;

    numerator += dx * dy;
    denominator += dx * dx;
    sumXX += dx * dx;
    sumYY += dy * dy;
  });

  /*
   * If all X values are identical, a normal
   * regression line cannot be drawn.
   */
  if (denominator === 0 || sumXX === 0) {
    return null;
  }

  const slope = numerator / denominator;
  const intercept = meanY - slope * meanX;

  const r =
    sumXX === 0 || sumYY === 0
      ? 0
      : numerator /
        Math.sqrt(sumXX * sumYY);

  const minX = Math.min(
    ...points.map((point) => point.x)
  );

  const maxX = Math.max(
    ...points.map((point) => point.x)
  );

  /*
   * If minX === maxX there is no horizontal
   * variation, so no meaningful segment exists.
   */
  if (minX === maxX) {
    return null;
  }

  return {
    slope,
    intercept,
    r,
    rSquared: r * r,
    n,
    minX,
    maxX,
  };
}

function relationshipLabel(r: number) {
  const absolute = Math.abs(r);

  if (absolute >= 0.8) {
    return r >= 0
      ? "Very strong positive"
      : "Very strong negative";
  }

  if (absolute >= 0.6) {
    return r >= 0
      ? "Strong positive"
      : "Strong negative";
  }

  if (absolute >= 0.4) {
    return r >= 0
      ? "Moderate positive"
      : "Moderate negative";
  }

  if (absolute >= 0.2) {
    return r >= 0
      ? "Weak positive"
      : "Weak negative";
  }

  return "Very weak";
}

export default Correlation;