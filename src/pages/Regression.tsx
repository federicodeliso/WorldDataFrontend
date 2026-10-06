import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2 } from "lucide-react";
import "./Regression.css";

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
  unit?: string | null;
  description?: string | null;
  frequency?: string | null;
  category?: string | null;
};

type Observation = {
  country: string;
  indicator: string;
  year: number;
  value: number;
};

type RegressionPoint = {
  year: number;
  x: number;
  y: number;
  fitted: number;
  residual: number;
};

type RegressionResult = {
  slope: number;
  intercept: number;
  r: number;
  rSquared: number;
  adjustedRSquared: number;
  n: number;
  minX: number;
  maxX: number;

  standardErrorSlope: number;
  standardErrorIntercept: number;

  tStatistic: number;
  interceptTStatistic: number;

  pValue: number;
  interceptPValue: number;

  confidenceLow: number;
  confidenceHigh: number;

  residualSumSquares: number;
  totalSumSquares: number;
  residualStandardError: number;

  points: RegressionPoint[];
};

function countryName(country: Country): string {
  return country.name ?? country.country_name ?? "";
}

/*
 * ============================================================
 * STATISTICAL FUNCTIONS
 * ============================================================
 */

function logGamma(z: number): number {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019572e-6,
    1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    return (
      Math.log(Math.PI) -
      Math.log(Math.sin(Math.PI * z)) -
      logGamma(1 - z)
    );
  }

  let x = 0.9999999999998099;
  const shifted = z - 1;

  coefficients.forEach((coefficient, index) => {
    x += coefficient / (shifted + index + 1);
  });

  const t = shifted + coefficients.length - 0.5;

  return (
    0.5 * Math.log(2 * Math.PI) +
    (shifted + 0.5) * Math.log(t) -
    t +
    Math.log(x)
  );
}

function betaContinuedFraction(
  a: number,
  b: number,
  x: number
): number {
  const maxIterations = 200;
  const epsilon = 3e-7;
  const fpMin = 1e-30;

  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;

  let c = 1;
  let d = 1 - (qab * x) / qap;

  if (Math.abs(d) < fpMin) {
    d = fpMin;
  }

  d = 1 / d;

  let h = d;

  for (let m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m;

    let aa =
      (m * (b - m) * x) /
      ((qam + m2) * (a + m2));

    d = 1 + aa * d;

    if (Math.abs(d) < fpMin) {
      d = fpMin;
    }

    c = 1 + aa / c;

    if (Math.abs(c) < fpMin) {
      c = fpMin;
    }

    d = 1 / d;
    h *= d * c;

    aa =
      (-(a + m) * (qab + m) * x) /
      ((a + m2) * (qap + m2));

    d = 1 + aa * d;

    if (Math.abs(d) < fpMin) {
      d = fpMin;
    }

    c = 1 + aa / c;

    if (Math.abs(c) < fpMin) {
      c = fpMin;
    }

    d = 1 / d;

    const delta = d * c;

    h *= delta;

    if (Math.abs(delta - 1) < epsilon) {
      break;
    }
  }

  return h;
}

function regularizedIncompleteBeta(
  x: number,
  a: number,
  b: number
): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const logBeta =
    logGamma(a) +
    logGamma(b) -
    logGamma(a + b);

  const front =
    Math.exp(
      a * Math.log(x) +
        b * Math.log(1 - x) -
        logBeta
    ) / a;

  if (x < (a + 1) / (a + b + 2)) {
    return (
      front *
      betaContinuedFraction(a, b, x)
    );
  }

  return (
    1 -
    (Math.exp(
      b * Math.log(1 - x) +
        a * Math.log(x) -
        logBeta
    ) /
      b) *
      betaContinuedFraction(
        b,
        a,
        1 - x
      )
  );
}

function studentTCDF(
  t: number,
  degreesOfFreedom: number
): number {
  if (degreesOfFreedom <= 0) {
    return 0.5;
  }

  const x =
    degreesOfFreedom /
    (degreesOfFreedom + t * t);

  const incompleteBeta =
    regularizedIncompleteBeta(
      x,
      degreesOfFreedom / 2,
      0.5
    );

  if (t >= 0) {
    return 1 - 0.5 * incompleteBeta;
  }

  return 0.5 * incompleteBeta;
}

function studentTTwoSidedPValue(
  t: number,
  degreesOfFreedom: number
): number {
  const cdf = studentTCDF(
    Math.abs(t),
    degreesOfFreedom
  );

  return Math.max(
    0,
    Math.min(1, 2 * (1 - cdf))
  );
}

function studentTCritical95(
  degreesOfFreedom: number
): number {
  if (degreesOfFreedom <= 0) {
    return 1.96;
  }

  let low = 0;
  let high = 10;

  for (let i = 0; i < 80; i++) {
    const middle = (low + high) / 2;

    const cdf = studentTCDF(
      middle,
      degreesOfFreedom
    );

    if (cdf < 0.975) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return (low + high) / 2;
}

/*
 * ============================================================
 * OLS REGRESSION
 * ============================================================
 */

function calculateRegression(
  observations: Array<{
    year: number;
    x: number;
    y: number;
  }>
): RegressionResult | null {
  if (observations.length < 3) {
    return null;
  }

  const n = observations.length;

  const meanX =
    observations.reduce(
      (sum, observation) =>
        sum + observation.x,
      0
    ) / n;

  const meanY =
    observations.reduce(
      (sum, observation) =>
        sum + observation.y,
      0
    ) / n;

  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;

  for (const observation of observations) {
    const dx = observation.x - meanX;
    const dy = observation.y - meanY;

    sumXX += dx * dx;
    sumYY += dy * dy;
    sumXY += dx * dy;
  }

  if (sumXX === 0 || sumYY === 0) {
    return null;
  }

  const slope = sumXY / sumXX;

  const intercept =
    meanY - slope * meanX;

  const r =
    sumXY /
    Math.sqrt(sumXX * sumYY);

  const rSquared = Math.max(
    0,
    Math.min(1, r * r)
  );

  const predictedValues =
    observations.map(
      (observation) =>
        intercept +
        slope * observation.x
    );

  const residuals =
    observations.map(
      (observation, index) =>
        observation.y -
        predictedValues[index]
    );

  const residualSumSquares =
    residuals.reduce(
      (sum, residual) =>
        sum + residual * residual,
      0
    );

  const totalSumSquares = sumYY;

  const degreesOfFreedom = n - 2;

  if (degreesOfFreedom <= 0) {
    return null;
  }

  const residualVariance =
    residualSumSquares /
    degreesOfFreedom;

  const residualStandardError =
    Math.sqrt(residualVariance);

  const standardErrorSlope =
    residualStandardError /
    Math.sqrt(sumXX);

  const standardErrorIntercept =
    residualStandardError *
    Math.sqrt(
      1 / n +
        (meanX * meanX) / sumXX
    );

  const tStatistic =
    standardErrorSlope > 0
      ? slope / standardErrorSlope
      : 0;

  const interceptTStatistic =
    standardErrorIntercept > 0
      ? intercept /
        standardErrorIntercept
      : 0;

  const pValue =
    studentTTwoSidedPValue(
      tStatistic,
      degreesOfFreedom
    );

  const interceptPValue =
    studentTTwoSidedPValue(
      interceptTStatistic,
      degreesOfFreedom
    );

  const criticalValue =
    studentTCritical95(
      degreesOfFreedom
    );

  const confidenceLow =
    slope -
    criticalValue *
      standardErrorSlope;

  const confidenceHigh =
    slope +
    criticalValue *
      standardErrorSlope;

  const adjustedRSquared =
    1 -
    ((1 - rSquared) *
      (n - 1)) /
      (n - 2);

  const points: RegressionPoint[] =
    observations.map(
      (observation, index) => ({
        year: observation.year,
        x: observation.x,
        y: observation.y,
        fitted:
          predictedValues[index],
        residual:
          residuals[index],
      })
    );

  const minX = Math.min(
    ...observations.map(
      (observation) =>
        observation.x
    )
  );

  const maxX = Math.max(
    ...observations.map(
      (observation) =>
        observation.x
    )
  );

  return {
    slope,
    intercept,
    r,
    rSquared,
    adjustedRSquared,
    n,
    minX,
    maxX,
    standardErrorSlope,
    standardErrorIntercept,
    tStatistic,
    interceptTStatistic,
    pValue,
    interceptPValue,
    confidenceLow,
    confidenceHigh,
    residualSumSquares,
    totalSumSquares,
    residualStandardError,
    points,
  };
}

/*
 * ============================================================
 * FORMATTING
 * ============================================================
 */

function formatNumber(
  value: number,
  decimals = 3
): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  const absolute = Math.abs(value);

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

  return value.toFixed(decimals);
}

function formatCoefficient(
  value: number
): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  const absolute = Math.abs(value);

  if (
    absolute > 0 &&
    absolute < 0.001
  ) {
    return value.toExponential(3);
  }

  if (absolute >= 1_000_000) {
    return value.toExponential(3);
  }

  if (absolute >= 1_000) {
    return value.toLocaleString(
      undefined,
      {
        maximumFractionDigits: 2,
      }
    );
  }

  return value.toFixed(4);
}

function formatPValue(
  value: number
): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  if (value < 0.0001) {
    return "<0.0001";
  }

  return value.toFixed(4);
}

function significanceLabel(
  pValue: number
): string {
  if (pValue < 0.01) {
    return "Highly significant";
  }

  if (pValue < 0.05) {
    return "Significant";
  }

  if (pValue < 0.1) {
    return "Weak evidence";
  }

  return "Not significant";
}

function relationshipLabel(
  r: number
): string {
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

  return "Very weak / no linear";
}

/*
 * ============================================================
 * COMPONENT
 * ============================================================
 */

export default function Regression() {
  const [countries, setCountries] =
    useState<Country[]>([]);

  const [indicators, setIndicators] =
    useState<Indicator[]>([]);

  const [selectedCountry, setSelectedCountry] =
    useState("");

  const [xIndicator, setXIndicator] =
    useState("");

  const [yIndicator, setYIndicator] =
    useState("");

  const [startYear, setStartYear] =
    useState(2000);

  const [endYear, setEndYear] =
    useState(new Date().getFullYear());

  const [
    observations,
    setObservations,
  ] = useState<Observation[]>([]);

  const [loadingMetadata, setLoadingMetadata] =
    useState(true);

  const [loadingData, setLoadingData] =
    useState(false);

  const [error, setError] =
    useState("");

  /*
   * ==========================================================
   * LOAD METADATA
   * ==========================================================
   */

  useEffect(() => {
    async function loadMetadata() {
      try {
        const [
          countriesResponse,
          indicatorsResponse,
        ] = await Promise.all([
          fetch(
            `${API}/countries?limit=500`
          ),
          fetch(
            `${API}/indicators?limit=2000`
          ),
        ]);

        if (
          !countriesResponse.ok ||
          !indicatorsResponse.ok
        ) {
          throw new Error(
            "Unable to load WorldData metadata."
          );
        }

        const countriesData =
          await countriesResponse.json();

        const indicatorsData =
          await indicatorsResponse.json();

        const countryArray: Country[] =
          Array.isArray(
            countriesData
          )
            ? countriesData
            : Array.isArray(
                  countriesData?.countries
                )
              ? countriesData.countries
              : [];

        const indicatorArray: Indicator[] =
          Array.isArray(
            indicatorsData
          )
            ? indicatorsData
            : Array.isArray(
                  indicatorsData?.indicators
                )
              ? indicatorsData.indicators
              : [];

        setCountries(
          countryArray
        );

        setIndicators(
          indicatorArray
        );

        /*
         * IMPORTANT:
         * The backend /data endpoint uses the
         * country NAME and indicator CODE.
         */

        const uniqueCountries =
          Array.from(
            new Set(
              countryArray
                .map(countryName)
                .filter(
                  (
                    country
                  ): country is string =>
                    Boolean(country)
                )
            )
          ).sort((a, b) =>
            a.localeCompare(b)
          );

        if (
          uniqueCountries.length > 0
        ) {
          setSelectedCountry(
            uniqueCountries[0]
          );
        }

        const codes =
          indicatorArray
            .map(
              (indicator) =>
                indicator.code
            )
            .filter(
              (
                code
              ): code is string =>
                Boolean(code)
            );

        if (
          codes.includes("GDP")
        ) {
          setXIndicator("GDP");
        } else if (
          codes.length > 0
        ) {
          setXIndicator(codes[0]);
        }

        if (
          codes.includes("POP")
        ) {
          setYIndicator("POP");
        } else if (
          codes.length > 1
        ) {
          setYIndicator(codes[1]);
        } else if (
          codes.length > 0
        ) {
          setYIndicator(codes[0]);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load metadata."
        );
      } finally {
        setLoadingMetadata(false);
      }
    }

    loadMetadata();
  }, []);

  /*
   * ==========================================================
   * LOAD DATA
   *
   * Same API structure as Correlation.tsx:
   *
   * /data/{COUNTRY NAME}/{INDICATOR CODE}
   *
   * ==========================================================
   */

  useEffect(() => {
    async function loadData() {
      if (
        !selectedCountry ||
        !xIndicator ||
        !yIndicator
      ) {
        setObservations([]);
        return;
      }

      setLoadingData(true);
      setError("");

      try {
        const requests = [
          {
            indicator: xIndicator,
          },
          {
            indicator: yIndicator,
          },
        ];

        const results =
          await Promise.allSettled(
            requests.map(
              async ({
                indicator,
              }) => {
                const response =
                  await fetch(
                    `${API}/data/${encodeURIComponent(
                      selectedCountry
                    )}/${encodeURIComponent(
                      indicator
                    )}`
                  );

                if (!response.ok) {
                  throw new Error(
                    `${selectedCountry}/${indicator}: ${response.status}`
                  );
                }

                const data =
                  await response.json();

                return {
                  indicator,
                  data,
                };
              }
            )
          );

        const nextObservations: Observation[] =
          [];

        for (const result of results) {
          if (
            result.status !==
            "fulfilled"
          ) {
            continue;
          }

          const {
            indicator,
            data,
          } = result.value;

          if (
            !Array.isArray(data)
          ) {
            continue;
          }

          for (const row of data) {
            if (
              !row ||
              typeof row !==
                "object"
            ) {
              continue;
            }

            const rowYear =
              Number(
                (
                  row as {
                    year?: unknown;
                  }
                ).year
              );

            const rowValue =
              Number(
                (
                  row as {
                    value?: unknown;
                  }
                ).value
              );

            if (
              Number.isFinite(
                rowYear
              ) &&
              Number.isFinite(
                rowValue
              )
            ) {
              nextObservations.push({
                country:
                  selectedCountry,
                indicator,
                year: rowYear,
                value: rowValue,
              });
            }
          }
        }

        /*
         * If both requests failed, show an actual
         * API error instead of misleading the user
         * with "not enough observations".
         */

        if (
          nextObservations.length ===
          0
        ) {
          const failedRequests =
            results.filter(
              (
                result
              ) =>
                result.status ===
                "rejected"
            );

          if (
            failedRequests.length > 0
          ) {
            throw new Error(
              `Unable to load data for ${selectedCountry}. Check that the selected indicators have data for this country.`
            );
          }
        }

        setObservations(
          nextObservations
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load the selected indicator data."
        );

        setObservations([]);
      } finally {
        setLoadingData(false);
      }
    }

    loadData();
  }, [
    selectedCountry,
    xIndicator,
    yIndicator,
  ]);

  /*
   * ==========================================================
   * JOIN DATA BY YEAR
   * ==========================================================
   */

  const regressionObservations =
    useMemo(() => {
      const xByYear =
        new Map<number, number>();

      const yByYear =
        new Map<number, number>();

      for (const observation of observations) {
        if (
          observation.indicator ===
          xIndicator
        ) {
          xByYear.set(
            observation.year,
            observation.value
          );
        }

        if (
          observation.indicator ===
          yIndicator
        ) {
          yByYear.set(
            observation.year,
            observation.value
          );
        }
      }

      const joined: Array<{
        year: number;
        x: number;
        y: number;
      }> = [];

      for (const [
        year,
        x,
      ] of xByYear.entries()) {
        const y =
          yByYear.get(year);

        if (
          y !== undefined &&
          year >= startYear &&
          year <= endYear &&
          Number.isFinite(x) &&
          Number.isFinite(y)
        ) {
          joined.push({
            year,
            x,
            y,
          });
        }
      }

      return joined.sort(
        (a, b) =>
          a.year - b.year
      );
    }, [
      observations,
      xIndicator,
      yIndicator,
      startYear,
      endYear,
    ]);

  const regression =
    useMemo(
      () =>
        calculateRegression(
          regressionObservations
        ),
      [regressionObservations]
    );

  /*
   * ==========================================================
   * SELECTED INDICATOR METADATA
   * ==========================================================
   */

  const selectedXIndicator =
    useMemo(
      () =>
        indicators.find(
          (indicator) =>
            indicator.code ===
            xIndicator
        ),
      [
        indicators,
        xIndicator,
      ]
    );

  const selectedYIndicator =
    useMemo(
      () =>
        indicators.find(
          (indicator) =>
            indicator.code ===
            yIndicator
        ),
      [
        indicators,
        yIndicator,
      ]
    );

  /*
   * ==========================================================
   * CHART DATA
   * ==========================================================
   */

  const scatterData =
    useMemo(
      () =>
        regression?.points.map(
          (point) => ({
            x: point.x,
            y: point.y,
            year: point.year,
          })
        ) ?? [],
      [regression]
    );

  const fittedLineData =
    useMemo(() => {
      if (!regression) {
        return [];
      }

      return [
        {
          x: regression.minX,
          fitted:
            regression.intercept +
            regression.slope *
              regression.minX,
        },
        {
          x: regression.maxX,
          fitted:
            regression.intercept +
            regression.slope *
              regression.maxX,
        },
      ];
    }, [regression]);

  const residualData =
    useMemo(
      () =>
        regression?.points.map(
          (point) => ({
            year: point.year,
            residual:
              point.residual,
          })
        ) ?? [],
      [regression]
    );

  const comparisonData =
    useMemo(
      () =>
        regression?.points.map(
          (point) => ({
            year: point.year,
            observed: point.y,
            fitted: point.fitted,
          })
        ) ?? [],
      [regression]
    );

  /*
   * ==========================================================
   * EQUATION
   * ==========================================================
   */

  const equation =
    regression
      ? `${yIndicator} = ${formatCoefficient(
          regression.intercept
        )} ${
          regression.slope >= 0
            ? "+"
            : "−"
        } ${formatCoefficient(
          Math.abs(
            regression.slope
          )
        )} × ${xIndicator}`
      : "—";

  if (loadingMetadata) {
    return (
      <div className="reg-loading-page">
        <div className="reg-loading">
          <Loader2
            size={22}
            className="reg-spin"
          />

          <span>
            Loading regression
            workspace...
          </span>
        </div>
      </div>
    );
  }

  return (
    <main className="page reg-page">
      <div className="reg-header">
        <div>
          <div className="page-eyebrow">
            WORLD DATA · ECONOMETRICS
          </div>

          <h1>Regression</h1>

          <p>
            Estimate and explore the
            relationship between two
            economic indicators over
            time.
          </p>
        </div>
      </div>

      {/* =====================================================
          CONTROLS
          ===================================================== */}

      <section className="reg-controls">
        <div className="reg-control">
          <label htmlFor="reg-country">
            COUNTRY
          </label>

          <select
            id="reg-country"
            value={selectedCountry}
            onChange={(event) =>
              setSelectedCountry(
                event.target.value
              )
            }
          >
            {Array.from(
              new Set(
                countries
                  .map(countryName)
                  .filter(Boolean)
              )
            )
              .sort((a, b) =>
                a.localeCompare(b)
              )
              .map((country) => (
                <option
                  key={country}
                  value={country}
                >
                  {country}
                </option>
              ))}
          </select>
        </div>

        <div className="reg-control">
          <label htmlFor="reg-x">
            INDEPENDENT VARIABLE · X
          </label>

          <select
            id="reg-x"
            value={xIndicator}
            onChange={(event) =>
              setXIndicator(
                event.target.value
              )
            }
          >
            {indicators.map(
              (indicator) => (
                <option
                  key={
                    indicator.code
                  }
                  value={
                    indicator.code
                  }
                >
                  {indicator.code}
                  {indicator.name
                    ? ` · ${indicator.name}`
                    : ""}
                </option>
              )
            )}
          </select>
        </div>

        <div className="reg-control">
          <label htmlFor="reg-y">
            DEPENDENT VARIABLE · Y
          </label>

          <select
            id="reg-y"
            value={yIndicator}
            onChange={(event) =>
              setYIndicator(
                event.target.value
              )
            }
          >
            {indicators.map(
              (indicator) => (
                <option
                  key={
                    indicator.code
                  }
                  value={
                    indicator.code
                  }
                >
                  {indicator.code}
                  {indicator.name
                    ? ` · ${indicator.name}`
                    : ""}
                </option>
              )
            )}
          </select>
        </div>

        <div className="reg-year-controls">
          <div className="reg-control">
            <label htmlFor="reg-start">
              FROM
            </label>

            <input
              id="reg-start"
              type="number"
              min={1900}
              max={endYear}
              value={startYear}
              onChange={(event) =>
                setStartYear(
                  Number(
                    event.target.value
                  )
                )
              }
            />
          </div>

          <div className="reg-control">
            <label htmlFor="reg-end">
              TO
            </label>

            <input
              id="reg-end"
              type="number"
              min={startYear}
              max={
                new Date().getFullYear()
              }
              value={endYear}
              onChange={(event) =>
                setEndYear(
                  Number(
                    event.target.value
                  )
                )
              }
            />
          </div>
        </div>
      </section>

      {error && (
        <div className="reg-error">
          {error}
        </div>
      )}

      {loadingData ? (
        <div className="reg-loading">
          <Loader2
            size={20}
            className="reg-spin"
          />

          <span>
            Loading selected data...
          </span>
        </div>
      ) : regressionObservations.length <
        3 ? (
        <div className="reg-empty">
          <strong>
            Not enough matched data.
          </strong>

          <span>
            The selected X and Y
            indicators need at least
            three years with valid
            observations in common.
          </span>

          <small>
            Loaded{" "}
            {
              regressionObservations.length
            }{" "}
            matched observations.
          </small>
        </div>
      ) : !regression ? (
        <div className="reg-empty">
          <strong>
            Regression cannot be
            calculated.
          </strong>

          <span>
            The selected X variable
            has no variation in the
            available observations.
          </span>
        </div>
      ) : (
        <>
          {/* =================================================
              SERIES HEADER
              ================================================= */}

          <section className="reg-series-header">
            <div>
              <span className="reg-eyebrow">
                OLS REGRESSION
              </span>

              <div className="reg-equation-word">
                {selectedYIndicator?.name ??
                  yIndicator}
              </div>

              <div className="reg-equation">
                {equation}
              </div>
            </div>

            <div className="reg-series-meta">
              <span>
                {selectedCountry}
              </span>

              <span>
                {startYear}–
                {endYear}
              </span>

              <span>
                n = {regression.n}
              </span>
            </div>
          </section>

          {/* =================================================
              METRICS
              ================================================= */}

          <section className="reg-metrics">
            <div className="reg-metric">
              <span>R²</span>

              <strong>
                {regression.rSquared.toFixed(
                  4
                )}
              </strong>

              <small>
                {(
                  regression.rSquared *
                  100
                ).toFixed(1)}
                % explained
              </small>
            </div>

            <div className="reg-metric">
              <span>
                Adjusted R²
              </span>

              <strong>
                {regression.adjustedRSquared.toFixed(
                  4
                )}
              </strong>

              <small>
                Adjusted model fit
              </small>
            </div>

            <div className="reg-metric">
              <span>
                Pearson r
              </span>

              <strong>
                {regression.r.toFixed(
                  4
                )}
              </strong>

              <small>
                {relationshipLabel(
                  regression.r
                )}
              </small>
            </div>

            <div className="reg-metric">
              <span>
                Observations
              </span>

              <strong>
                {regression.n}
              </strong>

              <small>
                Matched years
              </small>
            </div>

            <div className="reg-metric">
              <span>
                Slope
              </span>

              <strong>
                {formatCoefficient(
                  regression.slope
                )}
              </strong>

              <small>
                p ={" "}
                {formatPValue(
                  regression.pValue
                )}
              </small>
            </div>

            <div className="reg-metric">
              <span>
                Residual SE
              </span>

              <strong>
                {formatNumber(
                  regression.residualStandardError
                )}
              </strong>

              <small>
                Model standard error
              </small>
            </div>
          </section>

          {/* =================================================
              MAIN REGRESSION CHART
              ================================================= */}

          <section className="reg-analysis-grid">
            <div className="reg-card reg-card-large">
              <div className="reg-card-header">
                <div>
                  <h2>
                    Regression
                    relationship
                  </h2>

                  <p>
                    Observed values and
                    fitted OLS line.
                  </p>
                </div>
              </div>

              <div className="reg-chart">
                <ResponsiveContainer
                  width="100%"
                  height={390}
                >
                  <ComposedChart
                    margin={{
                      top: 15,
                      right: 25,
                      bottom: 30,
                      left: 15,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                    />

                    <XAxis
                      type="number"
                      dataKey="x"
                      domain={[
                        "auto",
                        "auto",
                      ]}
                      name={
                        xIndicator
                      }
                      tick={{
                        fontSize: 12,
                      }}
                      label={{
                        value:
                          xIndicator,
                        position:
                          "insideBottom",
                        offset: -15,
                      }}
                    />

                    <YAxis
                      type="number"
                      dataKey="y"
                      domain={[
                        "auto",
                        "auto",
                      ]}
                      name={
                        yIndicator
                      }
                      tick={{
                        fontSize: 12,
                      }}
                      label={{
                        value:
                          yIndicator,
                        angle: -90,
                        position:
                          "insideLeft",
                      }}
                    />

                    <Tooltip
                      content={({
                        active,
                        payload,
                      }) => {
                        if (
                          !active ||
                          !payload ||
                          payload.length ===
                            0
                        ) {
                          return null;
                        }

                        const point =
                          payload[0]
                            ?.payload as {
                            x?: number;
                            y?: number;
                            fitted?: number;
                          };

                        if (!point) {
                          return null;
                        }

                        return (
                          <div className="reg-tooltip">
                            {point.x !==
                              undefined && (
                              <span>
                                X:{" "}
                                {formatNumber(
                                  point.x
                                )}
                              </span>
                            )}

                            {point.y !==
                              undefined && (
                              <span>
                                Y:{" "}
                                {formatNumber(
                                  point.y
                                )}
                              </span>
                            )}

                            {point.fitted !==
                              undefined && (
                              <span>
                                Fitted:{" "}
                                {formatNumber(
                                  point.fitted
                                )}
                              </span>
                            )}
                          </div>
                        );
                      }}
                    />

                    <Scatter
                      name="Observed"
                      data={
                        scatterData
                      }
                    />

                    <Line
                      name="OLS fitted"
                      data={
                        fittedLineData
                      }
                      dataKey="fitted"
                      type="linear"
                      dot={false}
                      strokeWidth={2}
                      isAnimationActive={
                        false
                      }
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* =================================================
                COEFFICIENT TABLE
                ================================================= */}

            <div className="reg-card">
              <div className="reg-card-header">
                <div>
                  <h2>
                    Coefficient
                    estimates
                  </h2>

                  <p>
                    OLS estimates and
                    statistical inference.
                  </p>
                </div>
              </div>

              <div className="reg-table-wrapper">
                <table className="reg-table">
                  <thead>
                    <tr>
                      <th>
                        Variable
                      </th>

                      <th>
                        Coefficient
                      </th>

                      <th>
                        Std. Error
                      </th>

                      <th>
                        t
                      </th>

                      <th>
                        p-value
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    <tr>
                      <td>
                        Intercept
                      </td>

                      <td>
                        {formatCoefficient(
                          regression.intercept
                        )}
                      </td>

                      <td>
                        {formatCoefficient(
                          regression.standardErrorIntercept
                        )}
                      </td>

                      <td>
                        {regression.interceptTStatistic.toFixed(
                          3
                        )}
                      </td>

                      <td>
                        {formatPValue(
                          regression.interceptPValue
                        )}
                      </td>
                    </tr>

                    <tr>
                      <td>
                        {xIndicator}
                      </td>

                      <td>
                        {formatCoefficient(
                          regression.slope
                        )}
                      </td>

                      <td>
                        {formatCoefficient(
                          regression.standardErrorSlope
                        )}
                      </td>

                      <td>
                        {regression.tStatistic.toFixed(
                          3
                        )}
                      </td>

                      <td>
                        {formatPValue(
                          regression.pValue
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="reg-significance">
                {significanceLabel(
                  regression.pValue
                )}
              </div>
            </div>
          </section>

          {/* =================================================
              RESIDUALS + FITTED
              ================================================= */}

          <section className="reg-analysis-grid">
            <div className="reg-card">
              <div className="reg-card-header">
                <div>
                  <h2>
                    Residuals over
                    time
                  </h2>

                  <p>
                    Observed minus fitted
                    values.
                  </p>
                </div>
              </div>

              <div className="reg-small-chart">
                <ResponsiveContainer
                  width="100%"
                  height={300}
                >
                  <ComposedChart
                    data={
                      residualData
                    }
                    margin={{
                      top: 10,
                      right: 15,
                      bottom: 15,
                      left: 5,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                    />

                    <XAxis
                      dataKey="year"
                      tick={{
                        fontSize: 11,
                      }}
                    />

                    <YAxis
                      tick={{
                        fontSize: 11,
                      }}
                    />

                    <Tooltip />

                    <Line
                      type="monotone"
                      dataKey="residual"
                      name="Residual"
                      dot={false}
                      strokeWidth={2}
                      isAnimationActive={
                        false
                      }
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="reg-card">
              <div className="reg-card-header">
                <div>
                  <h2>
                    Observed vs
                    fitted
                  </h2>

                  <p>
                    Actual Y compared
                    with model predictions.
                  </p>
                </div>
              </div>

              <div className="reg-small-chart">
                <ResponsiveContainer
                  width="100%"
                  height={300}
                >
                  <ComposedChart
                    data={
                      comparisonData
                    }
                    margin={{
                      top: 10,
                      right: 15,
                      bottom: 15,
                      left: 5,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                    />

                    <XAxis
                      dataKey="year"
                      tick={{
                        fontSize: 11,
                      }}
                    />

                    <YAxis
                      tick={{
                        fontSize: 11,
                      }}
                    />

                    <Tooltip />

                    <Line
                      type="monotone"
                      dataKey="observed"
                      name="Observed"
                      dot={false}
                      strokeWidth={2}
                      isAnimationActive={
                        false
                      }
                    />

                    <Line
                      type="monotone"
                      dataKey="fitted"
                      name="Fitted"
                      dot={false}
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      isAnimationActive={
                        false
                      }
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* =================================================
              INFERENCE
              ================================================= */}

          <section className="reg-methodology">
            <div>
              <h2>
                Statistical
                interpretation
              </h2>

              <p>
                The slope coefficient
                measures the estimated
                change in{" "}
                <strong>
                  {yIndicator}
                </strong>{" "}
                associated with a
                one-unit increase in{" "}
                <strong>
                  {xIndicator}
                </strong>
                .
              </p>

              <p>
                The model has an R² of{" "}
                <strong>
                  {regression.rSquared.toFixed(
                    3
                  )}
                </strong>
                , meaning that{" "}
                <strong>
                  {(
                    regression.rSquared *
                    100
                  ).toFixed(1)}
                  %
                </strong>{" "}
                of the variation in Y
                is explained by the
                linear relationship with
                X within this sample.
              </p>

              <p>
                The slope p-value is{" "}
                <strong>
                  {formatPValue(
                    regression.pValue
                  )}
                </strong>
                . The 95% confidence
                interval for the slope is{" "}
                <strong>
                  [
                  {formatCoefficient(
                    regression.confidenceLow
                  )}
                  ,{" "}
                  {formatCoefficient(
                    regression.confidenceHigh
                  )}
                  ]
                </strong>
                .
              </p>

              <p>
                These are observational
                estimates. A statistically
                significant regression
                relationship does{" "}
                <strong>
                  not establish
                  causality
                </strong>
                .
              </p>
            </div>
          </section>
        </>
      )}
    </main>
  );
}