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
  adjustedRSquared: number;
  n: number;
  minX: number;
  maxX: number;

  standardErrorSlope: number;
  tStatistic: number;
  pValue: number;

  confidenceLow: number;
  confidenceHigh: number;

  residualSumSquares: number;
  totalSumSquares: number;
  residualStandardError: number;
};

type AnalysisPoint = Point & {
  predicted: number;
  residual: number;
  standardizedResidual: number;
};

type SpearmanResult = {
  rho: number;
  n: number;
};

type OutlierResult = {
  country: string;
  residual: number;
  standardizedResidual: number;
};

const EU_COUNTRIES = new Set([
  "Austria",
  "Belgium",
  "Bulgaria",
  "Croatia",
  "Cyprus",
  "Czechia",
  "Denmark",
  "Estonia",
  "Finland",
  "France",
  "Germany",
  "Greece",
  "Hungary",
  "Ireland",
  "Italy",
  "Latvia",
  "Lithuania",
  "Luxembourg",
  "Malta",
  "Netherlands",
  "Poland",
  "Portugal",
  "Romania",
  "Slovakia",
  "Slovenia",
  "Spain",
  "Sweden",
]);

function countryName(country: Country): string {
  return country.name ?? country.country_name ?? "";
}

function normalCDF(x: number) {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

function erf(x: number) {
  const sign = x >= 0 ? 1 : -1;
  const absX = Math.abs(x);

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1 / (1 + p * absX);

  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
      t *
      Math.exp(-absX * absX));

  return sign * y;
}

function logGamma(z: number): number {
  const coefficients: number[] = [
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
) {
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

    const del = d * c;

    h *= del;

    if (Math.abs(del - 1) < epsilon) {
      break;
    }
  }

  return h;
}

function regularizedIncompleteBeta(
  x: number,
  a: number,
  b: number
) {
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
) {
  if (degreesOfFreedom <= 0) return 0.5;

  const x =
    degreesOfFreedom /
    (degreesOfFreedom + t * t);

  const ibeta =
    regularizedIncompleteBeta(
      x,
      degreesOfFreedom / 2,
      0.5
    );

  if (t >= 0) {
    return 1 - 0.5 * ibeta;
  }

  return 0.5 * ibeta;
}

function studentTTwoSidedPValue(
  t: number,
  degreesOfFreedom: number
) {
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
) {
  if (degreesOfFreedom <= 0) {
    return 1.96;
  }

  let low = 0;
  let high = 10;

  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2;

    const cdf = studentTCDF(
      mid,
      degreesOfFreedom
    );

    if (cdf < 0.975) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) / 2;
}

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

  let sumXY = 0;
  let sumXX = 0;
  let sumYY = 0;

  for (const point of points) {
    const dx = point.x - meanX;
    const dy = point.y - meanY;

    sumXY += dx * dy;
    sumXX += dx * dx;
    sumYY += dy * dy;
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

  const rSquared = r * r;

  const residuals = points.map(
    (point) =>
      point.y -
      (slope * point.x + intercept)
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

  const residualStandardError =
    Math.sqrt(
      residualSumSquares /
        degreesOfFreedom
    );

  const standardErrorSlope =
    residualStandardError /
    Math.sqrt(sumXX);

  const tStatistic =
    standardErrorSlope > 0
      ? slope / standardErrorSlope
      : 0;

  const pValue =
    studentTTwoSidedPValue(
      tStatistic,
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
    ((1 - rSquared) * (n - 1)) /
      (n - 2);

  const minX = Math.min(
    ...points.map(
      (point) => point.x
    )
  );

  const maxX = Math.max(
    ...points.map(
      (point) => point.x
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
    tStatistic,
    pValue,
    confidenceLow,
    confidenceHigh,
    residualSumSquares,
    totalSumSquares,
    residualStandardError,
  };
}

function buildPointsForYear(
  observations: Observation[],
  selectedYear: number,
  xIndicator: string,
  yIndicator: string
): Point[] {
  const xMap = new Map<string, number>();
  const yMap = new Map<string, number>();

  for (const observation of observations) {
    if (observation.year !== selectedYear) {
      continue;
    }

    if (
      observation.indicator === xIndicator &&
      Number.isFinite(observation.value)
    ) {
      xMap.set(
        observation.country,
        observation.value
      );
    }

    if (
      observation.indicator === yIndicator &&
      Number.isFinite(observation.value)
    ) {
      yMap.set(
        observation.country,
        observation.value
      );
    }
  }

  const result: Point[] = [];

  for (const country of xMap.keys()) {
    const x = xMap.get(country);
    const y = yMap.get(country);

    if (
      x !== undefined &&
      y !== undefined &&
      Number.isFinite(x) &&
      Number.isFinite(y)
    ) {
      result.push({
        country,
        x,
        y,
      });
    }
  }

  return result.sort((a, b) =>
    a.country.localeCompare(b.country)
  );
}

function rankWithTies(
  values: number[]
) {
  const sorted = values
    .map((value, index) => ({
      value,
      index,
    }))
    .sort(
      (a, b) =>
        a.value - b.value
    );

  const ranks = new Array<number>(
    values.length
  );

  let i = 0;

  while (i < sorted.length) {
    let j = i;

    while (
      j + 1 < sorted.length &&
      sorted[j + 1].value ===
        sorted[i].value
    ) {
      j++;
    }

    const rank =
      (i + j + 2) / 2;

    for (
      let k = i;
      k <= j;
      k++
    ) {
      ranks[sorted[k].index] =
        rank;
    }

    i = j + 1;
  }

  return ranks;
}

function calculateSpearman(
  points: Point[]
): SpearmanResult | null {
  if (points.length < 2) {
    return null;
  }

  const xRanks = rankWithTies(
    points.map(
      (point) => point.x
    )
  );

  const yRanks = rankWithTies(
    points.map(
      (point) => point.y
    )
  );

  const meanX =
    xRanks.reduce(
      (sum, value) => sum + value,
      0
    ) / xRanks.length;

  const meanY =
    yRanks.reduce(
      (sum, value) => sum + value,
      0
    ) / yRanks.length;

  let numerator = 0;
  let denominatorX = 0;
  let denominatorY = 0;

  for (
    let i = 0;
    i < points.length;
    i++
  ) {
    const dx =
      xRanks[i] - meanX;

    const dy =
      yRanks[i] - meanY;

    numerator += dx * dy;
    denominatorX += dx * dx;
    denominatorY += dy * dy;
  }

  if (
    denominatorX === 0 ||
    denominatorY === 0
  ) {
    return null;
  }

  return {
    rho:
      numerator /
      Math.sqrt(
        denominatorX *
          denominatorY
      ),
    n: points.length,
  };
}

function formatNumber(
  value: number
) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  const absolute =
    Math.abs(value);

  if (
    absolute >= 1_000_000_000
  ) {
    return `${(
      value / 1_000_000_000
    ).toFixed(2)}B`;
  }

  if (
    absolute >= 1_000_000
  ) {
    return `${(
      value / 1_000_000
    ).toFixed(2)}M`;
  }

  if (
    absolute >= 1_000
  ) {
    return `${(
      value / 1_000
    ).toFixed(2)}K`;
  }

  if (absolute >= 100) {
    return value.toFixed(1);
  }

  if (absolute >= 10) {
    return value.toFixed(2);
  }

  return value.toFixed(3);
}

function formatRegressionCoefficient(
  value: number
) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  const absolute =
    Math.abs(value);

  if (
    absolute >= 1_000_000 ||
    (absolute > 0 &&
      absolute < 0.001)
  ) {
    return value.toExponential(3);
  }

  if (absolute >= 1000) {
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
) {
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
) {
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
) {
  const absolute =
    Math.abs(r);

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

function IndicatorSelector({
  value,
  selectedIndicator,
  indicators,
  search,
  setSearch,
  open,
  setOpen,
  onSelect,
}: {
  value: string;
  selectedIndicator?: Indicator;
  indicators: Indicator[];
  search: string;
  setSearch: (
    value: string
  ) => void;
  open: boolean;
  setOpen: (
    value: boolean
  ) => void;
  onSelect: (
    code: string
  ) => void;
}) {
  return (
    <div className="correlation-selector-wrapper">
      <button
        type="button"
        className={`correlation-selector-button ${
          open ? "open" : ""
        }`}
        onClick={() =>
          setOpen(!open)
        }
      >
        <span className="correlation-single-selection">
          <strong>{value}</strong>

          {selectedIndicator?.name && (
            <span>
              {selectedIndicator.name}
            </span>
          )}
        </span>

        <ChevronDown
          size={16}
          className={`selector-chevron ${
            open ? "open" : ""
          }`}
        />
      </button>

      {open && (
        <div className="correlation-selector-panel">
          <div className="correlation-selector-search">
            <Search size={15} />

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search indicators..."
              autoFocus
            />

            {search && (
              <button
                type="button"
                className="correlation-search-clear"
                onClick={() =>
                  setSearch("")
                }
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="correlation-selector-list">
            {indicators.map(
              (indicator) => {
                const selected =
                  indicator.code ===
                  value;

                return (
                  <button
                    type="button"
                    key={
                      indicator.code
                    }
                    className={`correlation-selector-option ${
                      selected
                        ? "selected"
                        : ""
                    }`}
                    onClick={() =>
                      onSelect(
                        indicator.code
                      )
                    }
                  >
                    <span className="correlation-indicator-option-text">
                      <strong>
                        {
                          indicator.code
                        }
                      </strong>

                      {indicator.name && (
                        <span>
                          {
                            indicator.name
                          }
                        </span>
                      )}
                    </span>

                    {selected && (
                      <Check
                        size={15}
                      />
                    )}
                  </button>
                );
              }
            )}

            {indicators.length ===
              0 && (
              <div className="correlation-selector-empty">
                No indicators found.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ResidualChart({
  points,
}: {
  points: AnalysisPoint[];
}) {
  if (points.length === 0) {
    return null;
  }

  return (
    <div className="correlation-residual-chart">
      <ResponsiveContainer
        width="100%"
        height={520}
      >
        <ScatterChart
          margin={{
            top: 20,
            right: 30,
            bottom: 30,
            left: 20,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />

          <XAxis
            type="number"
            dataKey="x"
            name="X"
            tickFormatter={
              formatNumber
            }
          />

          <YAxis
            type="number"
            dataKey="residual"
            name="Residual"
            tickFormatter={
              formatNumber
            }
          />

          <ZAxis
            range={[45, 45]}
          />

          <Tooltip
            cursor={{
              strokeDasharray:
                "3 3",
            }}
            content={({
              active,
              payload,
            }) => {
              if (
                !active ||
                !payload ||
                !payload.length
              ) {
                return null;
              }

              const point =
                payload[0]
                  ?.payload as AnalysisPoint;

              if (!point) {
                return null;
              }

              return (
                <div className="correlation-tooltip">
                  <strong>
                    {point.country}
                  </strong>

                  <span>
                    X:{" "}
                    {formatNumber(
                      point.x
                    )}
                  </span>

                  <span>
                    Residual:{" "}
                    {formatNumber(
                      point.residual
                    )}
                  </span>

                  <span>
                    Standardized residual:{" "}
                    {point.standardizedResidual.toFixed(
                      3
                    )}
                  </span>
                </div>
              );
            }}
          />

          <Scatter
            data={points}
            fill="#7c3aed"
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Correlation() {
  const chartRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const controlsRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const [countries, setCountries] =
    useState<Country[]>([]);

  const [indicators, setIndicators] =
    useState<Indicator[]>([]);

  const [xIndicator, setXIndicator] =
    useState("GDP");

  const [yIndicator, setYIndicator] =
    useState("POP");

  const [year, setYear] =
    useState(2023);

  const [
    selectedCountries,
    setSelectedCountries,
  ] = useState<string[]>([]);

  const [
    countrySearch,
    setCountrySearch,
  ] = useState("");

  const [xSearch, setXSearch] =
    useState("");

  const [ySearch, setYSearch] =
    useState("");

  const [
    countriesOpen,
    setCountriesOpen,
  ] = useState(false);

  const [xOpen, setXOpen] =
    useState(false);

  const [yOpen, setYOpen] =
    useState(false);

  const [
    observations,
    setObservations,
  ] = useState<Observation[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [playing, setPlaying] =
    useState(false);

  const [
    showResiduals,
    setShowResiduals,
  ] = useState(false);

  /*
   * =========================================================
   * LOAD METADATA
   * =========================================================
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
            `${API}/indicators?limit=500`
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
            ? (countriesData as Country[])
            : Array.isArray(
                  countriesData?.countries
                )
              ? (countriesData.countries as Country[])
              : [];

        const indicatorArray: Indicator[] =
          Array.isArray(
            indicatorsData
          )
            ? (indicatorsData as Indicator[])
            : Array.isArray(
                  indicatorsData?.indicators
                )
              ? (indicatorsData.indicators as Indicator[])
              : [];

        setCountries(
          countryArray
        );

        setIndicators(
          indicatorArray
        );

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

        const euCountries =
          uniqueCountries.filter(
            (country) =>
              EU_COUNTRIES.has(
                country
              )
          );

        setSelectedCountries(
          euCountries
        );

        const indicatorCodes =
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
          indicatorCodes.includes(
            "GDP"
          )
        ) {
          setXIndicator("GDP");
        } else if (
          indicatorCodes.length > 0
        ) {
          setXIndicator(
            indicatorCodes[0]
          );
        }

        if (
          indicatorCodes.includes(
            "POP"
          )
        ) {
          setYIndicator("POP");
        } else if (
          indicatorCodes.length > 1
        ) {
          setYIndicator(
            indicatorCodes[1]
          );
        } else if (
          indicatorCodes.length > 0
        ) {
          setYIndicator(
            indicatorCodes[0]
          );
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load metadata."
        );
      }
    }

    loadMetadata();
  }, []);

  /*
   * =========================================================
   * CLOSE DROPDOWNS
   * =========================================================
   */

  useEffect(() => {
    function handleOutsideClick(
      event: MouseEvent
    ) {
      if (
        controlsRef.current &&
        !controlsRef.current.contains(
          event.target as Node
        )
      ) {
        setCountriesOpen(false);
        setXOpen(false);
        setYOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    return () =>
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
  }, []);

  /*
   * =========================================================
   * LOAD CORRELATION DATA
   *
   * IMPORTANT:
   * Promise.all() used to make one 404 destroy the
   * entire dataset. Czechia and Slovakia currently return
   * 404 for some indicators, so we use Promise.allSettled()
   * and keep every successful country.
   * =========================================================
   */

  useEffect(() => {
    async function loadData() {
      if (
        selectedCountries.length ===
          0 ||
        !xIndicator ||
        !yIndicator
      ) {
        setObservations([]);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const requests =
          selectedCountries.flatMap(
            (country) => [
              {
                country,
                indicator:
                  xIndicator,
                type: "x" as const,
              },
              {
                country,
                indicator:
                  yIndicator,
                type: "y" as const,
              },
            ]
          );

        const results =
          await Promise.allSettled(
            requests.map(
              async ({
                country,
                indicator,
                type,
              }) => {
                const response =
                  await fetch(
                    `${API}/data/${encodeURIComponent(
                      country
                    )}/${encodeURIComponent(
                      indicator
                    )}`
                  );

                if (!response.ok) {
                  throw new Error(
                    `${country}/${indicator}: ${response.status}`
                  );
                }

                const data =
                  await response.json();

                return {
                  country,
                  indicator,
                  type,
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
            country,
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
                (row as {
                  year?: unknown;
                }).year
              );

            const rowValue =
              Number(
                (row as {
                  value?: unknown;
                }).value
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
                country,
                indicator,
                year: rowYear,
                value: rowValue,
              });
            }
          }
        }

        /*
         * Keep the successful observations.
         * Missing countries such as Czechia or Slovakia
         * no longer prevent the rest of Europe from
         * appearing in the analysis.
         */

        setObservations(
          nextObservations
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load correlation data."
        );

        setObservations([]);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [
    selectedCountries,
    xIndicator,
    yIndicator,
  ]);

  /*
   * =========================================================
   * YEARS
   * =========================================================
   */

  const availableYears =
    useMemo(() => {
      return Array.from(
        new Set(
          observations.map(
            (observation) =>
              observation.year
          )
        )
      ).sort(
        (a, b) => a - b
      );
    }, [observations]);

  const playYears =
    useMemo(() => {
      return availableYears.filter(
        (availableYear) =>
          buildPointsForYear(
            observations,
            availableYear,
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

  useEffect(() => {
    if (
      availableYears.length ===
      0
    ) {
      return;
    }

    if (
      !availableYears.includes(
        year
      )
    ) {
      setYear(
        availableYears[
          availableYears.length - 1
        ]
      );
    }
  }, [
    availableYears,
    year,
  ]);

  useEffect(() => {
    if (!playing) {
      return;
    }

    if (
      playYears.length === 0
    ) {
      setPlaying(false);
      return;
    }

    const interval =
      window.setInterval(() => {
        setYear(
          (currentYear) => {
            const currentIndex =
              playYears.indexOf(
                currentYear
              );

            if (
              currentIndex === -1 ||
              currentIndex ===
                playYears.length - 1
            ) {
              setPlaying(false);
              return playYears[0];
            }

            return playYears[
              currentIndex + 1
            ];
          }
        );
      }, 1100);

    return () =>
      window.clearInterval(
        interval
      );
  }, [
    playing,
    playYears,
  ]);

  /*
   * =========================================================
   * ANALYSIS
   * =========================================================
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

  const regression =
    useMemo(
      () =>
        calculateRegression(
          points
        ),
      [points]
    );

  const analysisPoints =
    useMemo<AnalysisPoint[]>(
      () => {
        if (!regression) {
          return [];
        }

        return points.map(
          (point) => {
            const predicted =
              regression.slope *
                point.x +
              regression.intercept;

            const residual =
              point.y -
              predicted;

            const standardizedResidual =
              regression.residualStandardError >
              0
                ? residual /
                  regression.residualStandardError
                : 0;

            return {
              ...point,
              predicted,
              residual,
              standardizedResidual,
            };
          }
        );
      },
      [points, regression]
    );

  const spearman =
    useMemo(
      () =>
        calculateSpearman(
          points
        ),
      [points]
    );

  const largestResidual =
    useMemo<OutlierResult | null>(
      () => {
        if (
          analysisPoints.length ===
          0
        ) {
          return null;
        }

        const largest =
          [
            ...analysisPoints,
          ].sort(
            (a, b) =>
              Math.abs(
                b.standardizedResidual
              ) -
              Math.abs(
                a.standardizedResidual
              )
          )[0];

        return {
          country:
            largest.country,
          residual:
            largest.residual,
          standardizedResidual:
            largest.standardizedResidual,
        };
      },
      [analysisPoints]
    );

  /*
   * =========================================================
   * FILTERS
   * =========================================================
   */

  const filteredCountries =
    useMemo(() => {
      const query =
        countrySearch
          .trim()
          .toLowerCase();

      const filtered =
        countries
          .map(countryName)
          .filter(
            (
              country
            ): country is string =>
              Boolean(country)
          )
          .filter(
            (
              country,
              index,
              array
            ) =>
              array.indexOf(
                country
              ) === index
          )
          .filter(
            (country) =>
              !query ||
              country
                .toLowerCase()
                .includes(query)
          );

      return filtered.sort(
        (a, b) => {
          const aSelected =
            selectedCountries.includes(
              a
            );

          const bSelected =
            selectedCountries.includes(
              b
            );

          if (
            aSelected !==
            bSelected
          ) {
            return aSelected
              ? -1
              : 1;
          }

          return a.localeCompare(
            b
          );
        }
      );
    }, [
      countries,
      countrySearch,
      selectedCountries,
    ]);

  const filteredXIndicators =
    useMemo(() => {
      const query =
        xSearch
          .trim()
          .toLowerCase();

      return indicators.filter(
        (indicator) =>
          !query ||
          indicator.code
            .toLowerCase()
            .includes(query) ||
          (
            indicator.name ??
            ""
          )
            .toLowerCase()
            .includes(query)
      );
    }, [
      indicators,
      xSearch,
    ]);

  const filteredYIndicators =
    useMemo(() => {
      const query =
        ySearch
          .trim()
          .toLowerCase();

      return indicators.filter(
        (indicator) =>
          !query ||
          indicator.code
            .toLowerCase()
            .includes(query) ||
          (
            indicator.name ??
            ""
          )
            .toLowerCase()
            .includes(query)
      );
    }, [
      indicators,
      ySearch,
    ]);

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
   * =========================================================
   * DOWNLOAD
   * =========================================================
   */

  async function downloadChart() {
    if (!chartRef.current) {
      return;
    }

    try {
      const dataUrl =
        await toPng(
          chartRef.current,
          {
            cacheBust: true,
            pixelRatio: 2,
            backgroundColor:
              "#ffffff",
          }
        );

      const link =
        document.createElement(
          "a"
        );

      link.download =
        `worlddata-correlation-${xIndicator}-vs-${yIndicator}-${year}.png`;

      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error(
        "Unable to download chart:",
        err
      );
    }
  }

  function toggleCountry(
    country: string
  ) {
    setSelectedCountries(
      (current) =>
        current.includes(country)
          ? current.filter(
              (item) =>
                item !== country
            )
          : [
              ...current,
              country,
            ]
    );
  }

  function selectAllCountries() {
    setSelectedCountries(
      filteredCountries
    );
  }

  function clearCountries() {
    setSelectedCountries([]);
  }

  const relationship =
    regression
      ? relationshipLabel(
          regression.r
        )
      : "—";

  const equation =
    regression
      ? `${yIndicator} = ${formatRegressionCoefficient(
          regression.intercept
        )} ${
          regression.slope >= 0
            ? "+"
            : "−"
        } ${formatRegressionCoefficient(
          Math.abs(
            regression.slope
          )
        )} × ${xIndicator}`
      : "—";

  /*
   * =========================================================
   * RENDER
   * =========================================================
   */

  return (
    <main className="page correlation-page">
      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            WORLD DATA · ECONOMETRICS
          </div>

          <h1>
            Correlation &amp;
            Regression
          </h1>

          <p>
            Explore relationships
            between economic
            indicators across
            countries and evaluate
            them with correlation
            and OLS statistics.
          </p>
        </div>
      </div>

      {/* =====================================================
          CONTROLS
          ===================================================== */}

      <section
        className="correlation-controls"
        ref={controlsRef}
      >
        <div className="correlation-control">
          <label>COUNTRIES</label>

          <div className="correlation-selector-wrapper">
            <button
              type="button"
              className={`correlation-selector-button ${
                countriesOpen
                  ? "open"
                  : ""
              }`}
              onClick={() => {
                setCountriesOpen(
                  !countriesOpen
                );
                setXOpen(false);
                setYOpen(false);
              }}
            >
              <span className="correlation-selected-tags">
                {selectedCountries
                  .slice(0, 2)
                  .map(
                    (country) => (
                      <span
                        className="correlation-selection-tag"
                        key={
                          country
                        }
                      >
                        <span>
                          {country}
                        </span>

                        <button
                          type="button"
                          onClick={(
                            event
                          ) => {
                            event.stopPropagation();
                            toggleCountry(
                              country
                            );
                          }}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    )
                  )}

                {selectedCountries.length >
                  2 && (
                  <span className="correlation-selection-more">
                    +
                    {selectedCountries.length -
                      2}
                  </span>
                )}

                {selectedCountries.length ===
                  0 && (
                  <span className="correlation-placeholder">
                    Select countries
                  </span>
                )}
              </span>

              <ChevronDown
                size={16}
                className={`selector-chevron ${
                  countriesOpen
                    ? "open"
                    : ""
                }`}
              />
            </button>

            {countriesOpen && (
              <div className="correlation-selector-panel">
                <div className="correlation-selector-search">
                  <Search size={15} />

                  <input
                    value={
                      countrySearch
                    }
                    onChange={(
                      event
                    ) =>
                      setCountrySearch(
                        event.target
                          .value
                      )
                    }
                    placeholder="Search countries..."
                    autoFocus
                  />

                  {countrySearch && (
                    <button
                      type="button"
                      className="correlation-search-clear"
                      onClick={() =>
                        setCountrySearch(
                          ""
                        )
                      }
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                <div className="correlation-selector-actions">
                  <button
                    type="button"
                    onClick={
                      selectAllCountries
                    }
                  >
                    All
                  </button>

                  <button
                    type="button"
                    onClick={
                      clearCountries
                    }
                  >
                    Clear
                  </button>

                  <span className="correlation-selector-count">
                    {
                      selectedCountries.length
                    }{" "}
                    selected
                  </span>
                </div>

                <div className="correlation-selector-list">
                  {filteredCountries.map(
                    (country) => {
                      const selected =
                        selectedCountries.includes(
                          country
                        );

                      return (
                        <button
                          type="button"
                          key={
                            country
                          }
                          className={`correlation-selector-option ${
                            selected
                              ? "selected"
                              : ""
                          }`}
                          onClick={() =>
                            toggleCountry(
                              country
                            )
                          }
                        >
                          <span>
                            {country}
                          </span>

                          {selected && (
                            <Check
                              size={
                                15
                              }
                            />
                          )}
                        </button>
                      );
                    }
                  )}

                  {filteredCountries.length ===
                    0 && (
                    <div className="correlation-selector-empty">
                      No countries found.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="correlation-control">
          <label>X AXIS</label>

          <IndicatorSelector
            value={
              xIndicator
            }
            selectedIndicator={
              selectedXIndicator
            }
            indicators={
              filteredXIndicators
            }
            search={xSearch}
            setSearch={
              setXSearch
            }
            open={xOpen}
            setOpen={(open) => {
              setXOpen(open);

              if (open) {
                setYOpen(false);
                setCountriesOpen(
                  false
                );
              }
            }}
            onSelect={(code) => {
              setXIndicator(
                code
              );
              setXOpen(false);
              setXSearch("");
            }}
          />
        </div>

        <div className="correlation-control">
          <label>Y AXIS</label>

          <IndicatorSelector
            value={
              yIndicator
            }
            selectedIndicator={
              selectedYIndicator
            }
            indicators={
              filteredYIndicators
            }
            search={ySearch}
            setSearch={
              setYSearch
            }
            open={yOpen}
            setOpen={(open) => {
              setYOpen(open);

              if (open) {
                setXOpen(false);
                setCountriesOpen(
                  false
                );
              }
            }}
            onSelect={(code) => {
              setYIndicator(
                code
              );
              setYOpen(false);
              setYSearch("");
            }}
          />
        </div>

        <div className="correlation-control year-control">
          <label>YEAR</label>

          <div className="correlation-year-row">
            <select
              className="correlation-select"
              value={year}
              onChange={(
                event
              ) =>
                setYear(
                  Number(
                    event.target
                      .value
                  )
                )
              }
              disabled={
                availableYears.length ===
                0
              }
            >
              {availableYears.map(
                (
                  availableYear
                ) => (
                  <option
                    key={
                      availableYear
                    }
                    value={
                      availableYear
                    }
                  >
                    {
                      availableYear
                    }
                  </option>
                )
              )}
            </select>

            <button
              type="button"
              className={`correlation-play-button ${
                playing
                  ? "playing"
                  : ""
              }`}
              onClick={() =>
                setPlaying(
                  (current) =>
                    !current
                )
              }
              disabled={
                playYears.length <
                2
              }
              title={
                playing
                  ? "Pause"
                  : "Play years"
              }
            >
              {playing ? (
                <Pause
                  size={15}
                />
              ) : (
                <Play
                  size={15}
                />
              )}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="correlation-error">
          {error}
        </div>
      )}

      {/* =====================================================
          MAIN CHART
          ===================================================== */}

      <section className="panel correlation-chart-panel">
        <div className="correlation-chart-header">
          <div>
            <div className="correlation-chart-eyebrow">
              SCATTER + OLS
            </div>

            <h2>
              {xIndicator} vs{" "}
              {yIndicator}
            </h2>

            <p>
              {year} ·{" "}
              {points.length}{" "}
              countries
              {playing &&
                " · Playing"}
            </p>
          </div>

          <div className="correlation-chart-header-right">
            {regression && (
              <div className="correlation-r2-summary">
                <span>R²</span>

                <strong>
                  {regression.rSquared.toFixed(
                    3
                  )}
                </strong>
              </div>
            )}

            <button
              type="button"
              className="correlation-download-button"
              onClick={
                downloadChart
              }
              disabled={
                loading ||
                points.length <
                  2
              }
            >
              <Download
                size={15}
              />
              Download
            </button>
          </div>
        </div>

        <div
          className="correlation-chart"
          ref={chartRef}
        >
          {loading ? (
            <div className="correlation-chart-state">
              <Loader2
                size={22}
                className="spin"
              />

              <span>
                Loading data...
              </span>
            </div>
          ) : points.length <
            2 ? (
            <div className="correlation-chart-state">
              <span>
                Not enough
                observations for
                this combination.
              </span>
            </div>
          ) : showResiduals ? (
            <ResidualChart
              points={
                analysisPoints
              }
            />
          ) : (
            <ResponsiveContainer
              width="100%"
              height={520}
            >
              <ScatterChart
                margin={{
                  top: 20,
                  right: 30,
                  bottom: 30,
                  left: 20,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                />

                <XAxis
                  type="number"
                  dataKey="x"
                  name={
                    xIndicator
                  }
                  tickFormatter={
                    formatNumber
                  }
                />

                <YAxis
                  type="number"
                  dataKey="y"
                  name={
                    yIndicator
                  }
                  tickFormatter={
                    formatNumber
                  }
                />

                <ZAxis
                  range={[
                    55, 55,
                  ]}
                />

                <Tooltip
                  cursor={{
                    strokeDasharray:
                      "3 3",
                  }}
                  content={({
                    active,
                    payload,
                  }) => {
                    if (
                      !active ||
                      !payload ||
                      !payload.length
                    ) {
                      return null;
                    }

                    const point =
                      payload[0]
                        ?.payload as Point;

                    if (!point) {
                      return null;
                    }

                    return (
                      <div className="correlation-tooltip">
                        <strong>
                          {
                            point.country
                          }
                        </strong>

                        <span>
                          {
                            xIndicator
                          }
                          :{" "}
                          {formatNumber(
                            point.x
                          )}
                        </span>

                        <span>
                          {
                            yIndicator
                          }
                          :{" "}
                          {formatNumber(
                            point.y
                          )}
                        </span>

                        <span>
                          Year:{" "}
                          {year}
                        </span>
                      </div>
                    );
                  }}
                />

                <Scatter
                  name="Countries"
                  data={
                    points
                  }
                  fill="#2563eb"
                />

                {regression && (
                  <Scatter
                    name="OLS"
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
                      stroke:
                        "#ef4444",
                      strokeWidth: 2,
                      strokeDasharray:
                        "6 4",
                    }}
                    shape={() => (
                      <g />
                    )}
                  />
                )}
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </div>

        {regression &&
          points.length >=
            2 && (
            <div className="correlation-chart-switch">
              <button
                type="button"
                className={
                  !showResiduals
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setShowResiduals(
                    false
                  )
                }
              >
                Scatter + OLS
              </button>

              <button
                type="button"
                className={
                  showResiduals
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setShowResiduals(
                    true
                  )
                }
              >
                Residuals
              </button>
            </div>
          )}
      </section>

      {/* =====================================================
          REGRESSION SUMMARY
          ===================================================== */}

      {regression && (
        <section className="correlation-results-overview">
          <div className="correlation-overview-header">
            <div>
              <div className="correlation-section-eyebrow">
                REGRESSION SUMMARY
              </div>

              <h2>
                {yIndicator} on{" "}
                {xIndicator}
              </h2>

              <p>
                Cross-country OLS
                estimates for{" "}
                {year}.
              </p>
            </div>

            <div className="correlation-overview-badge">
              n = {regression.n}
            </div>
          </div>

          <div className="correlation-equation-card">
            <span>
              OLS EQUATION
            </span>

            <strong>
              {equation}
            </strong>
          </div>

          <div className="correlation-stat-grid">
            <div className="correlation-stat-card">
              <span>Pearson r</span>

              <strong>
                {regression.r.toFixed(
                  3
                )}
              </strong>

              <small>
                Linear association
              </small>
            </div>

            <div className="correlation-stat-card">
              <span>
                Spearman rho
              </span>

              <strong>
                {spearman
                  ? spearman.rho.toFixed(
                      3
                    )
                  : "—"}
              </strong>

              <small>
                Rank association
              </small>
            </div>

            <div className="correlation-stat-card">
              <span>R²</span>

              <strong>
                {regression.rSquared.toFixed(
                  3
                )}
              </strong>

              <small>
                Explained variation
              </small>
            </div>

            <div className="correlation-stat-card">
              <span>
                Adjusted R²
              </span>

              <strong>
                {regression.adjustedRSquared.toFixed(
                  3
                )}
              </strong>

              <small>
                Adjusted fit
              </small>
            </div>

            <div className="correlation-stat-card">
              <span>
                Observations
              </span>

              <strong>
                {regression.n}
              </strong>

              <small>
                Countries
              </small>
            </div>

            <div className="correlation-stat-card relationship">
              <span>
                Relationship
              </span>

              <strong>
                {relationship}
              </strong>

              <small>
                Pearson classification
              </small>
            </div>
          </div>
        </section>
      )}

      {/* =====================================================
          OLS COEFFICIENT DIAGNOSTICS
          ===================================================== */}

      {regression && (
        <section className="correlation-analysis-section">
          <div className="correlation-section-heading">
            <div>
              <div className="correlation-section-eyebrow">
                STATISTICAL INFERENCE
              </div>

              <h3>
                OLS coefficient
                diagnostics
              </h3>

              <p>
                Inference for the
                estimated slope
                coefficient.
              </p>
            </div>
          </div>

          <div className="correlation-diagnostics-table-wrapper">
            <table className="correlation-diagnostics-table">
              <thead>
                <tr>
                  <th>
                    Statistic
                  </th>

                  <th>
                    Estimate
                  </th>

                  <th>
                    Interpretation
                  </th>
                </tr>
              </thead>

              <tbody>
                <tr>
                  <td>
                    OLS coefficient
                  </td>

                  <td className="value">
                    {formatRegressionCoefficient(
                      regression.slope
                    )}
                  </td>

                  <td>
                    Estimated change
                    in{" "}
                    <strong>
                      {yIndicator}
                    </strong>{" "}
                    for a one-unit
                    increase in{" "}
                    <strong>
                      {xIndicator}
                    </strong>
                  </td>
                </tr>

                <tr>
                  <td>
                    Standard error
                  </td>

                  <td className="value">
                    {formatRegressionCoefficient(
                      regression.standardErrorSlope
                    )}
                  </td>

                  <td>
                    Sampling
                    uncertainty around
                    the coefficient
                  </td>
                </tr>

                <tr>
                  <td>
                    t-statistic
                  </td>

                  <td className="value">
                    {regression.tStatistic.toFixed(
                      3
                    )}
                  </td>

                  <td>
                    Test statistic for
                    H₀: coefficient = 0
                  </td>
                </tr>

                <tr>
                  <td>
                    p-value
                  </td>

                  <td className="value">
                    {formatPValue(
                      regression.pValue
                    )}
                  </td>

                  <td>
                    <span className="correlation-significance-badge">
                      {significanceLabel(
                        regression.pValue
                      )}
                    </span>
                  </td>
                </tr>

                <tr>
                  <td>
                    95% confidence
                    interval
                  </td>

                  <td className="value">
                    [
                    {formatRegressionCoefficient(
                      regression.confidenceLow
                    )}
                    ,{" "}
                    {formatRegressionCoefficient(
                      regression.confidenceHigh
                    )}
                    ]
                  </td>

                  <td>
                    Plausible range for
                    the population
                    coefficient
                  </td>
                </tr>

                <tr>
                  <td>
                    Residual standard
                    error
                  </td>

                  <td className="value">
                    {formatNumber(
                      regression.residualStandardError
                    )}
                  </td>

                  <td>
                    Typical size of
                    regression residuals
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* =====================================================
          RESEARCH INTERPRETATION
          ===================================================== */}

      {regression && (
        <section className="correlation-analysis-section">
          <div className="correlation-section-heading">
            <div>
              <div className="correlation-section-eyebrow">
                RESEARCH INTERPRETATION
              </div>

              <h3>
                What the regression
                suggests
              </h3>
            </div>
          </div>

          <div className="correlation-research-grid">
            <article className="correlation-research-card">
              <div className="correlation-research-number">
                01
              </div>

              <div>
                <h4>
                  Estimated association
                </h4>

                <p>
                  A one-unit increase
                  in{" "}
                  <strong>
                    {xIndicator}
                  </strong>{" "}
                  is associated
                  with an estimated{" "}
                  <strong>
                    {formatRegressionCoefficient(
                      regression.slope
                    )}
                  </strong>{" "}
                  unit change in{" "}
                  <strong>
                    {yIndicator}
                  </strong>{" "}
                  in this
                  cross-country
                  sample.
                </p>
              </div>
            </article>

            <article className="correlation-research-card">
              <div className="correlation-research-number">
                02
              </div>

              <div>
                <h4>
                  Explained variation
                </h4>

                <p>
                  The model explains{" "}
                  <strong>
                    {(
                      regression.rSquared *
                      100
                    ).toFixed(1)}
                    %
                  </strong>{" "}
                  of the
                  cross-country
                  variation in{" "}
                  <strong>
                    {yIndicator}
                  </strong>{" "}
                  for{" "}
                  <strong>
                    {year}
                  </strong>
                  .
                </p>
              </div>
            </article>

            <article className="correlation-research-card">
              <div className="correlation-research-number">
                03
              </div>

              <div>
                <h4>
                  Pearson vs
                  Spearman
                </h4>

                <p>
                  Pearson measures
                  the linear
                  relationship, while
                  Spearman evaluates
                  whether the
                  relationship is
                  consistently
                  monotonic in rank
                  terms.
                </p>
              </div>
            </article>

            <article className="correlation-research-card correlation-research-warning">
              <div className="correlation-research-number">
                !
              </div>

              <div>
                <h4>
                  Important
                </h4>

                <p>
                  This is an
                  observational
                  cross-country
                  relationship. The
                  regression{" "}
                  <strong>
                    does not
                    establish
                    causality
                  </strong>
                  . Differences may
                  reflect omitted
                  variables, reverse
                  causality,
                  measurement
                  differences, or
                  country-specific
                  characteristics.
                </p>
              </div>
            </article>
          </div>
        </section>
      )}

      {/* =====================================================
          OBSERVATION DIAGNOSTICS
          ===================================================== */}

      {largestResidual && (
        <section className="correlation-analysis-section correlation-outlier-section">
          <div className="correlation-section-heading">
            <div>
              <div className="correlation-section-eyebrow">
                OBSERVATION DIAGNOSTICS
              </div>

              <h3>
                Largest standardized
                residual
              </h3>

              <p>
                Observation furthest
                from the fitted OLS
                relationship.
              </p>
            </div>
          </div>

          <div className="correlation-outlier-table-wrapper">
            <table className="correlation-outlier-table">
              <thead>
                <tr>
                  <th>
                    Country
                  </th>

                  <th>
                    Residual
                  </th>

                  <th>
                    Standardized
                    residual
                  </th>

                  <th>
                    Assessment
                  </th>
                </tr>
              </thead>

              <tbody>
                <tr>
                  <td>
                    <strong>
                      {
                        largestResidual.country
                      }
                    </strong>
                  </td>

                  <td className="value">
                    {formatNumber(
                      largestResidual.residual
                    )}
                  </td>

                  <td className="value">
                    {largestResidual.standardizedResidual.toFixed(
                      3
                    )}
                  </td>

                  <td>
                    <span
                      className={`correlation-outlier-badge ${
                        Math.abs(
                          largestResidual.standardizedResidual
                        ) >= 2
                          ? "warning"
                          : "normal"
                      }`}
                    >
                      {Math.abs(
                        largestResidual.standardizedResidual
                      ) >= 2
                        ? "Potential outlier"
                        : "Within typical range"}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}