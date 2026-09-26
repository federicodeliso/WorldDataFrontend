import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
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
import "./CorrelationOverTime.css";

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
  year: number;
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

type SpearmanResult = {
  rho: number;
  n: number;
};

const API_BASE = "http://127.0.0.1:8000";

function logGamma(z: number): number {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    return (
      Math.log(Math.PI) -
      Math.log(Math.sin(Math.PI * z)) -
      logGamma(1 - z)
    );
  }

  let x = 0.99999999999980993;

  for (let i = 0; i < coefficients.length; i += 1) {
    x += coefficients[i] / (z + i);
  }

  const t = z + coefficients.length - 0.5;

  return (
    0.5 * Math.log(2 * Math.PI) +
    (z - 0.5) * Math.log(t) -
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

  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;

  let c = 1;
  let d = 1 - (qab * x) / qap;

  if (Math.abs(d) < fpMin) {
    d = fpMin;
  }

  d = 1 / d;

  let h = d;

  for (let m = 1; m <= maxIterations; m += 1) {
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

  const bt = Math.exp(
    a * Math.log(x) +
      b * Math.log(1 - x) -
      logBeta
  );

  if (x < (a + 1) / (a + b + 2)) {
    return (
      (bt * betaContinuedFraction(a, b, x)) /
      a
    );
  }

  return (
    1 -
    (bt *
      betaContinuedFraction(b, a, 1 - x)) /
      b
  );
}

function studentTCDF(
  t: number,
  degreesOfFreedom: number
): number {
  if (degreesOfFreedom <= 0) {
    return NaN;
  }

  if (t === 0) {
    return 0.5;
  }

  const x =
    degreesOfFreedom /
    (degreesOfFreedom + t * t);

  const ibeta = regularizedIncompleteBeta(
    x,
    degreesOfFreedom / 2,
    0.5
  );

  if (t > 0) {
    return 1 - 0.5 * ibeta;
  }

  return 0.5 * ibeta;
}

function studentTTwoSidedPValue(
  t: number,
  degreesOfFreedom: number
): number {
  const cdf = studentTCDF(
    Math.abs(t),
    degreesOfFreedom
  );

  return Math.min(1, 2 * (1 - cdf));
}

function studentTCritical95(
  degreesOfFreedom: number
): number {
  const criticalValues: Record<
    number,
    number
  > = {
    1: 12.706,
    2: 4.303,
    3: 3.182,
    4: 2.776,
    5: 2.571,
    6: 2.447,
    7: 2.365,
    8: 2.306,
    9: 2.262,
    10: 2.228,
    11: 2.201,
    12: 2.179,
    13: 2.160,
    14: 2.145,
    15: 2.131,
    16: 2.120,
    17: 2.110,
    18: 2.101,
    19: 2.093,
    20: 2.086,
    21: 2.080,
    22: 2.074,
    23: 2.069,
    24: 2.064,
    25: 2.060,
    26: 2.056,
    27: 2.052,
    28: 2.048,
    29: 2.045,
    30: 2.042,
  };

  if (degreesOfFreedom <= 30) {
    return (
      criticalValues[degreesOfFreedom] ??
      1.96
    );
  }

  return 1.96;
}

function calculateRegression(
  points: Point[]
): Regression | null {
  const n = points.length;

  if (n < 3) {
    return null;
  }

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

  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;

  for (const point of points) {
    const dx = point.x - meanX;
    const dy = point.y - meanY;

    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }

  if (varianceX === 0 || varianceY === 0) {
    return null;
  }

  const slope = covariance / varianceX;
  const intercept =
    meanY - slope * meanX;

  const r =
    covariance /
    Math.sqrt(varianceX * varianceY);

  const rSquared = r * r;

  const adjustedRSquared =
    1 -
    ((1 - rSquared) * (n - 1)) /
      (n - 2);

  let residualSumSquares = 0;
  let totalSumSquares = 0;

  for (const point of points) {
    const predicted =
      intercept + slope * point.x;

    residualSumSquares +=
      Math.pow(point.y - predicted, 2);

    totalSumSquares +=
      Math.pow(point.y - meanY, 2);
  }

  const residualDegreesOfFreedom =
    n - 2;

  const residualStandardError =
    Math.sqrt(
      residualSumSquares /
        residualDegreesOfFreedom
    );

  const standardErrorSlope =
    residualStandardError /
    Math.sqrt(varianceX);

  const tStatistic =
    slope / standardErrorSlope;

  const pValue =
    studentTTwoSidedPValue(
      tStatistic,
      residualDegreesOfFreedom
    );

  const critical =
    studentTCritical95(
      residualDegreesOfFreedom
    );

  const confidenceLow =
    slope -
    critical * standardErrorSlope;

  const confidenceHigh =
    slope +
    critical * standardErrorSlope;

  return {
    slope,
    intercept,
    r,
    rSquared,
    adjustedRSquared,
    n,
    minX: Math.min(
      ...points.map((point) => point.x)
    ),
    maxX: Math.max(
      ...points.map((point) => point.x)
    ),
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

function rankWithTies(
  values: number[]
): number[] {
  const indexed = values
    .map((value, index) => ({
      value,
      index,
    }))
    .sort((a, b) => a.value - b.value);

  const ranks = new Array<number>(
    values.length
  );

  let i = 0;

  while (i < indexed.length) {
    let j = i;

    while (
      j + 1 < indexed.length &&
      indexed[j + 1].value ===
        indexed[i].value
    ) {
      j += 1;
    }

    const averageRank =
      (i + j + 2) / 2;

    for (let k = i; k <= j; k += 1) {
      ranks[indexed[k].index] =
        averageRank;
    }

    i = j + 1;
  }

  return ranks;
}

function calculateSpearman(
  points: Point[]
): SpearmanResult | null {
  const n = points.length;

  if (n < 3) {
    return null;
  }

  const xRanks = rankWithTies(
    points.map((point) => point.x)
  );

  const yRanks = rankWithTies(
    points.map((point) => point.y)
  );

  const meanX =
    xRanks.reduce(
      (sum, value) => sum + value,
      0
    ) / n;

  const meanY =
    yRanks.reduce(
      (sum, value) => sum + value,
      0
    ) / n;

  let numerator = 0;
  let denominatorX = 0;
  let denominatorY = 0;

  for (let i = 0; i < n; i += 1) {
    const dx = xRanks[i] - meanX;
    const dy = yRanks[i] - meanY;

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
        denominatorX * denominatorY
      ),
    n,
  };
}

function formatNumber(
  value: number,
  decimals = 2
): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  const absolute = Math.abs(value);

  if (
    absolute !== 0 &&
    (absolute >= 1e6 ||
      absolute < 1e-4)
  ) {
    return value.toExponential(3);
  }

  return value.toLocaleString(
    "en-US",
    {
      maximumFractionDigits: decimals,
    }
  );
}

function formatCoefficient(
  value: number
): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  const absolute = Math.abs(value);

  if (
    absolute !== 0 &&
    (absolute >= 1e6 ||
      absolute < 1e-4)
  ) {
    return value.toExponential(3);
  }

  return value.toLocaleString(
    "en-US",
    {
      maximumFractionDigits: 4,
    }
  );
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

function relationshipLabel(
  r: number
): string {
  const absolute = Math.abs(r);

  if (absolute < 0.2) {
    return "Very weak";
  }

  if (absolute < 0.4) {
    return "Weak";
  }

  if (absolute < 0.6) {
    return "Moderate";
  }

  if (absolute < 0.8) {
    return "Strong";
  }

  return "Very strong";
}

function significanceLabel(
  pValue: number
): string {
  if (pValue < 0.01) {
    return "Highly significant";
  }

  if (pValue < 0.05) {
    return "Statistically significant";
  }

  return "Not statistically significant";
}

function buildTimePoints(
  observations: Observation[],
  country: string,
  xIndicator: string,
  yIndicator: string
): Point[] {
  const xByYear = new Map<
    number,
    number
  >();

  const yByYear = new Map<
    number,
    number
  >();

  for (const observation of observations) {
    if (
      observation.country !== country
    ) {
      continue;
    }

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

  const years = Array.from(
    xByYear.keys()
  )
    .filter((year) =>
      yByYear.has(year)
    )
    .sort((a, b) => a - b);

  return years.map((year) => ({
    year,
    x: xByYear.get(year)!,
    y: yByYear.get(year)!,
  }));
}

function CorrelationOverTime() {
  const [countries, setCountries] =
    useState<Country[]>([]);

  const [indicators, setIndicators] =
    useState<Indicator[]>([]);

  const [observations, setObservations] =
    useState<Observation[]>([]);

  const [country, setCountry] =
    useState("");

  const [xIndicator, setXIndicator] =
    useState("");

  const [yIndicator, setYIndicator] =
    useState("");

  const [
    countrySearch,
    setCountrySearch,
  ] = useState("");

  const [
    xIndicatorSearch,
    setXIndicatorSearch,
  ] = useState("");

  const [
    yIndicatorSearch,
    setYIndicatorSearch,
  ] = useState("");

  const [
    openSelector,
    setOpenSelector,
  ] = useState<
    "country" | "x" | "y" | null
  >(null);

  const [
    loadingMetadata,
    setLoadingMetadata,
  ] = useState(true);

  const [
    loadingData,
    setLoadingData,
  ] = useState(false);

  const [error, setError] =
    useState("");

  const [startYear, setStartYear] =
    useState<number | null>(null);

  const [endYear, setEndYear] =
    useState<number | null>(null);

  const chartRef =
    useRef<HTMLDivElement>(null);

  const controlsRef =
    useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        setLoadingMetadata(true);
        setError("");

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

        const loadedCountries =
          Array.isArray(countriesData)
            ? countriesData
            : countriesData.data ??
              countriesData.countries ??
              [];

        const loadedIndicators =
          Array.isArray(indicatorsData)
            ? indicatorsData
            : indicatorsData.data ??
              indicatorsData.indicators ??
              [];

        setCountries(
          loadedCountries
        );

        setIndicators(
          loadedIndicators
        );

        const italy =
          loadedCountries.find(
            (item: Country) =>
              item.code === "ITA" ||
              item.iso3 === "ITA" ||
              item.name === "Italy" ||
              item.country_name === "Italy"
          );

        const defaultCountry =
          italy ??
          loadedCountries[0];

        const defaultCountryName =
          defaultCountry?.name ??
          defaultCountry?.country_name ??
          defaultCountry?.code ??
          defaultCountry?.iso3 ??
          "";

        setCountry(
          defaultCountryName
        );

        const gdp =
          loadedIndicators.find(
            (item: Indicator) =>
              item.code === "GDP"
          );

        const pop =
          loadedIndicators.find(
            (item: Indicator) =>
              item.code === "POP"
          );

        const firstIndicator =
          loadedIndicators[0];

        const secondIndicator =
          loadedIndicators[1];

        setXIndicator(
          gdp?.code ??
            firstIndicator?.code ??
            ""
        );

        setYIndicator(
          pop?.code ??
            secondIndicator?.code ??
            gdp?.code ??
            ""
        );
      } catch (loadError) {
        console.error(loadError);

        setError(
          "Unable to load countries and indicators."
        );
      } finally {
        setLoadingMetadata(false);
      }
    };

    loadMetadata();
  }, []);

  useEffect(() => {
    const handleOutsideClick = (
      event: MouseEvent
    ) => {
      if (
        controlsRef.current &&
        !controlsRef.current.contains(
          event.target as Node
        )
      ) {
        setOpenSelector(null);
      }
    };

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

  useEffect(() => {
    if (
      !country ||
      !xIndicator ||
      !yIndicator
    ) {
      return;
    }

    const loadData = async () => {
      try {
        setLoadingData(true);
        setError("");

        const [
          xResponse,
          yResponse,
        ] = await Promise.allSettled([
          fetch(
            `${API_BASE}/data/${encodeURIComponent(
              country
            )}/${encodeURIComponent(
              xIndicator
            )}`
          ),
          fetch(
            `${API_BASE}/data/${encodeURIComponent(
              country
            )}/${encodeURIComponent(
              yIndicator
            )}`
          ),
        ]);

        const loaded: Observation[] =
          [];

        if (
          xResponse.status ===
            "fulfilled" &&
          xResponse.value.ok
        ) {
          const data =
            await xResponse.value.json();

          const rows = Array.isArray(data)
            ? data
            : data.data ??
              data.observations ??
              [];

          for (const row of rows) {
            const year = Number(
              row.year
            );

            const value = Number(
              row.value
            );

            if (
              Number.isFinite(year) &&
              Number.isFinite(value)
            ) {
              loaded.push({
                country,
                indicator:
                  xIndicator,
                year,
                value,
              });
            }
          }
        }

        if (
          yResponse.status ===
            "fulfilled" &&
          yResponse.value.ok
        ) {
          const data =
            await yResponse.value.json();

          const rows = Array.isArray(data)
            ? data
            : data.data ??
              data.observations ??
              [];

          for (const row of rows) {
            const year = Number(
              row.year
            );

            const value = Number(
              row.value
            );

            if (
              Number.isFinite(year) &&
              Number.isFinite(value)
            ) {
              loaded.push({
                country,
                indicator:
                  yIndicator,
                year,
                value,
              });
            }
          }
        }

        setObservations(loaded);
      } catch (loadError) {
        console.error(loadError);

        setObservations([]);

        setError(
          "Unable to load the selected data."
        );
      } finally {
        setLoadingData(false);
      }
    };

    loadData();
  }, [
    country,
    xIndicator,
    yIndicator,
  ]);

  const rawPoints = useMemo(
    () =>
      buildTimePoints(
        observations,
        country,
        xIndicator,
        yIndicator
      ),
    [
      observations,
      country,
      xIndicator,
      yIndicator,
    ]
  );

  const availableYears = useMemo(
    () =>
      rawPoints.map(
        (point) => point.year
      ),
    [rawPoints]
  );

  useEffect(() => {
    if (!availableYears.length) {
      setStartYear(null);
      setEndYear(null);
      return;
    }

    const first =
      availableYears[0];

    const last =
      availableYears[
        availableYears.length - 1
      ];

    setStartYear((current) => {
      if (
        current !== null &&
        availableYears.includes(current)
      ) {
        return current;
      }

      return first;
    });

    setEndYear((current) => {
      if (
        current !== null &&
        availableYears.includes(current)
      ) {
        return current;
      }

      return last;
    });
  }, [availableYears]);

  const timePoints = useMemo(() => {
    if (
      startYear === null ||
      endYear === null
    ) {
      return [];
    }

    return rawPoints.filter(
      (point) =>
        point.year >= startYear &&
        point.year <= endYear
    );
  }, [
    rawPoints,
    startYear,
    endYear,
  ]);

  const regression = useMemo(
    () =>
      calculateRegression(
        timePoints
      ),
    [timePoints]
  );

  const spearman = useMemo(
    () =>
      calculateSpearman(
        timePoints
      ),
    [timePoints]
  );

  const regressionLine = useMemo(() => {
    if (!regression) {
      return [];
    }

    return [
      {
        x: regression.minX,
        y:
          regression.intercept +
          regression.slope *
            regression.minX,
      },
      {
        x: regression.maxX,
        y:
          regression.intercept +
          regression.slope *
            regression.maxX,
      },
    ];
  }, [regression]);

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
        (item) => {
          const label =
            item.name ??
            item.country_name ??
            item.code ??
            item.iso3 ??
            "";

          return label
            .toLowerCase()
            .includes(query);
        }
      );
    }, [
      countries,
      countrySearch,
    ]);

  const filteredXIndicators =
    useMemo(() => {
      const query =
        xIndicatorSearch
          .trim()
          .toLowerCase();

      if (!query) {
        return indicators;
      }

      return indicators.filter(
        (item) =>
          item.code
            .toLowerCase()
            .includes(query) ||
          (
            item.name ?? ""
          )
            .toLowerCase()
            .includes(query)
      );
    }, [
      indicators,
      xIndicatorSearch,
    ]);

  const filteredYIndicators =
    useMemo(() => {
      const query =
        yIndicatorSearch
          .trim()
          .toLowerCase();

      if (!query) {
        return indicators;
      }

      return indicators.filter(
        (item) =>
          item.code
            .toLowerCase()
            .includes(query) ||
          (
            item.name ?? ""
          )
            .toLowerCase()
            .includes(query)
      );
    }, [
      indicators,
      yIndicatorSearch,
    ]);

  const getCountryLabel = (
    item: Country
  ) =>
    item.name ??
    item.country_name ??
    item.code ??
    item.iso3 ??
    "";

  const getIndicatorLabel = (
    item: Indicator
  ) => item.name ?? item.code;

  const selectedXIndicator =
    indicators.find(
      (item) =>
        item.code === xIndicator
    );

  const selectedYIndicator =
    indicators.find(
      (item) =>
        item.code === yIndicator
    );

  const downloadChart = async () => {
    if (!chartRef.current) {
      return;
    }

    try {
      const image =
        await toPng(
          chartRef.current,
          {
            pixelRatio: 2,
            backgroundColor:
              "#ffffff",
          }
        );

      const link =
        document.createElement(
          "a"
        );

      link.download = `worlddata-correlation-${country}-${xIndicator}-${yIndicator}.png`;

      link.href = image;

      link.click();
    } catch (downloadError) {
      console.error(
        downloadError
      );
    }
  };

  const renderCountrySelector =
    () => (
      <div className="correlation-over-time-control">
        <label>COUNTRY</label>

        <div className="correlation-over-time-selector-wrapper">
          <button
            type="button"
            className="correlation-over-time-selector-button"
            onClick={() =>
              setOpenSelector(
                openSelector ===
                  "country"
                  ? null
                  : "country"
              )
            }
          >
            <span>
              {country ||
                "Select country"}
            </span>

            <ChevronDown
              size={16}
            />
          </button>

          {openSelector ===
            "country" && (
            <div className="correlation-over-time-selector-panel">
              <div className="correlation-over-time-selector-search">
                <Search
                  size={15}
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

                {countrySearch && (
                  <button
                    type="button"
                    className="correlation-over-time-search-clear"
                    onClick={() =>
                      setCountrySearch(
                        ""
                      )
                    }
                  >
                    <X
                      size={14}
                    />
                  </button>
                )}
              </div>

              <div className="correlation-over-time-selector-list">
                {filteredCountries.map(
                  (item) => {
                    const label =
                      getCountryLabel(
                        item
                      );

                    const isSelected =
                      label ===
                      country;

                    return (
                      <button
                        key={`${item.code}-${label}`}
                        type="button"
                        className={`correlation-over-time-selector-option ${
                          isSelected
                            ? "selected"
                            : ""
                        }`}
                        onClick={() => {
                          setCountry(
                            label
                          );
                          setOpenSelector(
                            null
                          );
                          setCountrySearch(
                            ""
                          );
                        }}
                      >
                        <span>
                          {label}
                        </span>

                        {isSelected && (
                          <Check
                            size={15}
                          />
                        )}
                      </button>
                    );
                  }
                )}

                {!filteredCountries.length && (
                  <div className="correlation-over-time-selector-empty">
                    No countries found.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );

  const renderIndicatorSelector =
    (
      type: "x" | "y",
      value: string,
      search: string,
      setSearch: (
        value: string
      ) => void,
      filtered: Indicator[]
    ) => {
      const isOpen =
        openSelector === type;

      const selected =
        indicators.find(
          (item) =>
            item.code === value
        );

      return (
        <div className="correlation-over-time-control">
          <label>
            {type === "x"
              ? "X AXIS"
              : "Y AXIS"}
          </label>

          <div className="correlation-over-time-selector-wrapper">
            <button
              type="button"
              className="correlation-over-time-selector-button"
              onClick={() =>
                setOpenSelector(
                  isOpen ? null : type
                )
              }
            >
              <span>
                {selected
                  ? getIndicatorLabel(
                      selected
                    )
                  : "Select indicator"}
              </span>

              <ChevronDown
                size={16}
              />
            </button>

            {isOpen && (
              <div className="correlation-over-time-selector-panel">
                <div className="correlation-over-time-selector-search">
                  <Search
                    size={15}
                  />

                  <input
                    value={search}
                    onChange={(
                      event
                    ) =>
                      setSearch(
                        event.target
                          .value
                      )
                    }
                    placeholder="Search indicators..."
                    autoFocus
                  />

                  {search && (
                    <button
                      type="button"
                      className="correlation-over-time-search-clear"
                      onClick={() =>
                        setSearch("")
                      }
                    >
                      <X
                        size={14}
                      />
                    </button>
                  )}
                </div>

                <div className="correlation-over-time-selector-list">
                  {filtered.map(
                    (item) => {
                      const isSelected =
                        item.code ===
                        value;

                      return (
                        <button
                          key={
                            item.code
                          }
                          type="button"
                          className={`correlation-over-time-selector-option ${
                            isSelected
                              ? "selected"
                              : ""
                          }`}
                          onClick={() => {
                            if (
                              type ===
                              "x"
                            ) {
                              setXIndicator(
                                item.code
                              );
                            } else {
                              setYIndicator(
                                item.code
                              );
                            }

                            setSearch(
                              ""
                            );

                            setOpenSelector(
                              null
                            );
                          }}
                        >
                          <div>
                            <strong>
                              {
                                item.code
                              }
                            </strong>

                            {item.name && (
                              <small>
                                {
                                  item.name
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
                  )}

                  {!filtered.length && (
                    <div className="correlation-over-time-selector-empty">
                      No indicators
                      found.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    };

  return (
    <main className="correlation-over-time-page">
      <header className="correlation-over-time-page-header">
        <div>
          <div className="correlation-over-time-section-eyebrow">
            TIME SERIES ANALYSIS
          </div>

          <h1>
            Correlation Over Time
          </h1>

          <p>
            Examine the relationship
            between two economic
            indicators within one
            country across a selected
            period.
          </p>
        </div>
      </header>

      <section
        className="correlation-over-time-controls"
        ref={controlsRef}
      >
        {renderCountrySelector()}

        {renderIndicatorSelector(
          "x",
          xIndicator,
          xIndicatorSearch,
          setXIndicatorSearch,
          filteredXIndicators
        )}

        {renderIndicatorSelector(
          "y",
          yIndicator,
          yIndicatorSearch,
          setYIndicatorSearch,
          filteredYIndicators
        )}

        <div className="correlation-over-time-control">
          <label>YEAR RANGE</label>

          <div className="correlation-over-time-year-row">
            <select
              className="correlation-over-time-select"
              value={
                startYear ?? ""
              }
              onChange={(event) =>
                setStartYear(
                  Number(
                    event.target
                      .value
                  )
                )
              }
              disabled={
                !availableYears.length
              }
            >
              {availableYears.map(
                (year) => (
                  <option
                    key={year}
                    value={year}
                  >
                    {year}
                  </option>
                )
              )}
            </select>

            <span>to</span>

            <select
              className="correlation-over-time-select"
              value={
                endYear ?? ""
              }
              onChange={(event) =>
                setEndYear(
                  Number(
                    event.target
                      .value
                  )
                )
              }
              disabled={
                !availableYears.length
              }
            >
              {availableYears.map(
                (year) => (
                  <option
                    key={year}
                    value={year}
                  >
                    {year}
                  </option>
                )
              )}
            </select>
          </div>
        </div>
      </section>

      {error && (
        <div className="correlation-over-time-error">
          {error}
        </div>
      )}

      {(loadingMetadata ||
        loadingData) && (
        <div className="correlation-over-time-placeholder">
          <Loader2
            size={20}
            className="spin"
          />

          <span>
            {loadingMetadata
              ? "Loading WorldData..."
              : "Loading selected data..."}
          </span>
        </div>
      )}

      {!loadingMetadata &&
        !loadingData &&
        country &&
        xIndicator &&
        yIndicator && (
          <>
            <section
              className="correlation-over-time-chart-panel"
              ref={chartRef}
            >
              <div className="correlation-over-time-chart-header">
                <div>
                  <div className="correlation-over-time-chart-eyebrow">
                    CORRELATION
                  </div>

                  <h2>
                    {xIndicator} ×{" "}
                    {yIndicator}
                  </h2>

                  <p>
                    Each point represents
                    one year for{" "}
                    <strong>
                      {country}
                    </strong>
                    . The line shows the
                    OLS regression across
                    the selected period.
                  </p>
                </div>

                <div className="correlation-over-time-chart-header-right">
                  {regression && (
                    <div className="correlation-over-time-r2-summary">
                      <span>
                        PEARSON r
                      </span>

                      <strong>
                        {regression.r.toFixed(
                          3
                        )}
                      </strong>
                    </div>
                  )}

                  <button
                    type="button"
                    className="correlation-over-time-download-button"
                    onClick={
                      downloadChart
                    }
                    title="Download chart"
                  >
                    <Download
                      size={16}
                    />

                    <span>
                      Download
                    </span>
                  </button>
                </div>
              </div>

              <div className="correlation-over-time-chart">
                {timePoints.length <
                2 ? (
                  <div className="correlation-over-time-chart-state">
                    <strong>
                      Not enough
                      observations
                    </strong>

                    <span>
                      Select a wider
                      time range or
                      another pair of
                      indicators.
                    </span>
                  </div>
                ) : (
                  <ResponsiveContainer
                    width="100%"
                    height={500}
                  >
                    <ComposedChart
                      data={timePoints}
                      margin={{
                        top: 20,
                        right: 30,
                        left: 20,
                        bottom: 30,
                      }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#e5e7eb"
                      />

                      <XAxis
                        type="number"
                        dataKey="x"
                        name={xIndicator}
                        tick={{
                          fontSize: 11,
                          fill: "#6b7280",
                        }}
                        tickFormatter={(
                          value
                        ) =>
                          formatNumber(
                            Number(
                              value
                            ),
                            1
                          )
                        }
                        label={{
                          value:
                            xIndicator,
                          position:
                            "insideBottom",
                          offset:
                            -15,
                          style: {
                            fill: "#4b5563",
                            fontSize: 12,
                            fontWeight: 600,
                          },
                        }}
                      />

                      <YAxis
                        type="number"
                        dataKey="y"
                        name={yIndicator}
                        tick={{
                          fontSize: 11,
                          fill: "#6b7280",
                        }}
                        tickFormatter={(
                          value
                        ) =>
                          formatNumber(
                            Number(
                              value
                            ),
                            1
                          )
                        }
                        width={90}
                        label={{
                          value:
                            yIndicator,
                          angle:
                            -90,
                          position:
                            "insideLeft",
                          style: {
                            fill: "#4b5563",
                            fontSize: 12,
                            fontWeight: 600,
                            textAnchor:
                              "middle",
                          },
                        }}
                      />

                      <Tooltip
                        content={({
                          active,
                          payload,
                        }) => {
                          if (
                            !active ||
                            !payload?.length
                          ) {
                            return null;
                          }

                          const point =
                            payload.find(
                              (
                                item
                              ) =>
                                item.payload
                            )
                              ?.payload as
                              | Point
                              | undefined;

                          if (!point) {
                            return null;
                          }

                          return (
                            <div className="correlation-over-time-tooltip">
                              <strong>
                                {
                                  point.year
                                }
                              </strong>

                              <div>
                                <span>
                                  {
                                    xIndicator
                                  }
                                </span>

                                <b>
                                  {formatNumber(
                                    point.x
                                  )}
                                </b>
                              </div>

                              <div>
                                <span>
                                  {
                                    yIndicator
                                  }
                                </span>

                                <b>
                                  {formatNumber(
                                    point.y
                                  )}
                                </b>
                              </div>
                            </div>
                          );
                        }}
                      />

                      <Scatter
                        data={timePoints}
                        fill="#111827"
                        line={false}
                        shape="circle"
                      />

                      {regression && (
                        <Line
                          type="linear"
                          data={
                            regressionLine
                          }
                          dataKey="y"
                          stroke="#6b7280"
                          strokeWidth={
                            2
                          }
                          dot={false}
                          activeDot={false}
                          isAnimationActive={
                            false
                          }
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <section className="correlation-over-time-results-overview">
              <div className="correlation-over-time-overview-header">
                <div>
                  <div className="correlation-over-time-section-eyebrow">
                    TIME ANALYSIS
                  </div>

                  <h2>
                    Statistical relationship
                  </h2>

                  <p>
                    {country} ·{" "}
                    {xIndicator} ×{" "}
                    {yIndicator}
                  </p>
                </div>

                {startYear !==
                    null &&
                  endYear !==
                    null && (
                    <div className="correlation-over-time-overview-badge">
                      {startYear}–
                      {endYear}
                    </div>
                  )}
              </div>

              <div className="correlation-over-time-stat-grid">
                <div className="correlation-over-time-stat-card">
                  <span>
                    PEARSON r
                  </span>

                  <strong>
                    {regression
                      ? regression.r.toFixed(
                          3
                        )
                      : "—"}
                  </strong>

                  <small>
                    Linear association
                  </small>
                </div>

                <div className="correlation-over-time-stat-card">
                  <span>
                    SPEARMAN ρ
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

                <div className="correlation-over-time-stat-card">
                  <span>
                    R²
                  </span>

                  <strong>
                    {regression
                      ? regression.rSquared.toFixed(
                          3
                        )
                      : "—"}
                  </strong>

                  <small>
                    Explained variation
                  </small>
                </div>

                <div className="correlation-over-time-stat-card">
                  <span>
                    OLS SLOPE
                  </span>

                  <strong>
                    {regression
                      ? formatCoefficient(
                          regression.slope
                        )
                      : "—"}
                  </strong>

                  <small>
                    Estimated coefficient
                  </small>
                </div>

                <div className="correlation-over-time-stat-card">
                  <span>
                    P-VALUE
                  </span>

                  <strong>
                    {regression
                      ? formatPValue(
                          regression.pValue
                        )
                      : "—"}
                  </strong>

                  <small>
                    {regression
                      ? significanceLabel(
                          regression.pValue
                        )
                      : "—"}
                  </small>
                </div>

                <div className="correlation-over-time-stat-card">
                  <span>
                    RELATIONSHIP
                  </span>

                  <strong>
                    {regression
                      ? relationshipLabel(
                          regression.r
                        )
                      : "—"}
                  </strong>

                  <small>
                    Based on Pearson r
                  </small>
                </div>
              </div>
            </section>

            {regression && (
              <section className="correlation-over-time-analysis-section">
                <div className="correlation-over-time-section-heading">
                  <div>
                    <div className="correlation-over-time-section-eyebrow">
                      OLS ANALYSIS
                    </div>

                    <h3>
                      Regression across
                      years
                    </h3>

                    <p>
                      OLS estimates the
                      relationship between{" "}
                      <strong>
                        {xIndicator}
                      </strong>{" "}
                      and{" "}
                      <strong>
                        {yIndicator}
                      </strong>{" "}
                      using{" "}
                      <strong>
                        {regression.n}
                      </strong>{" "}
                      yearly observations
                      from{" "}
                      <strong>
                        {startYear}
                      </strong>{" "}
                      to{" "}
                      <strong>
                        {endYear}
                      </strong>{" "}
                      for{" "}
                      <strong>
                        {country}
                      </strong>
                      .
                    </p>
                  </div>
                </div>

                <div className="correlation-over-time-ols-layout">
                  <div className="correlation-over-time-equation-card">
                    <span>
                      OLS EQUATION
                    </span>

                    <strong>
                      {yIndicator} ={" "}
                      {formatCoefficient(
                        regression.intercept
                      )}{" "}
                      {regression.slope >=
                      0
                        ? "+"
                        : "−"}{" "}
                      {formatCoefficient(
                        Math.abs(
                          regression.slope
                        )
                      )}{" "}
                      × {xIndicator}
                    </strong>

                    <small>
                      Estimated linear
                      relationship across
                      the selected time
                      period.
                    </small>
                  </div>

                  <div className="correlation-over-time-ols-main-stat">
                    <span>
                      OLS COEFFICIENT
                    </span>

                    <strong>
                      {formatCoefficient(
                        regression.slope
                      )}
                    </strong>

                    <small>
                      Change in{" "}
                      {yIndicator} associated
                      with a one-unit
                      increase in{" "}
                      {xIndicator}.
                    </small>
                  </div>
                </div>

                <div className="correlation-over-time-ols-metrics">
                  <div className="correlation-over-time-ols-metric">
                    <span>
                      STANDARD ERROR
                    </span>

                    <strong>
                      {formatCoefficient(
                        regression.standardErrorSlope
                      )}
                    </strong>
                  </div>

                  <div className="correlation-over-time-ols-metric">
                    <span>
                      T-STATISTIC
                    </span>

                    <strong>
                      {regression.tStatistic.toFixed(
                        3
                      )}
                    </strong>
                  </div>

                  <div className="correlation-over-time-ols-metric">
                    <span>
                      P-VALUE
                    </span>

                    <strong>
                      {formatPValue(
                        regression.pValue
                      )}
                    </strong>

                    <small
                      className={
                        regression.pValue <
                        0.05
                          ? "correlation-over-time-ols-significant"
                          : ""
                      }
                    >
                      {significanceLabel(
                        regression.pValue
                      )}
                    </small>
                  </div>

                  <div className="correlation-over-time-ols-metric">
                    <span>
                      95% CONFIDENCE
                      INTERVAL
                    </span>

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
                  </div>

                  <div className="correlation-over-time-ols-metric">
                    <span>
                      R²
                    </span>

                    <strong>
                      {regression.rSquared.toFixed(
                        3
                      )}
                    </strong>

                    <small>
                      Explained variation
                    </small>
                  </div>

                  <div className="correlation-over-time-ols-metric">
                    <span>
                      OBSERVATIONS
                    </span>

                    <strong>
                      {regression.n}
                    </strong>

                    <small>
                      Complete yearly
                      pairs
                    </small>
                  </div>
                </div>

                <div className="correlation-over-time-ols-note">
                  <div className="correlation-over-time-ols-note-label">
                    INTERPRETATION
                  </div>

                  <p>
                    The estimated
                    coefficient indicates
                    how{" "}
                    <strong>
                      {yIndicator}
                    </strong>{" "}
                    changes, on average,
                    with a one-unit change
                    in{" "}
                    <strong>
                      {xIndicator}
                    </strong>{" "}
                    within the selected
                    country and period. The
                    confidence interval
                    describes the statistical
                    uncertainty around that
                    estimate.
                  </p>
                </div>
              </section>
            )}

            <section className="correlation-over-time-analysis-section">
              <div className="correlation-over-time-section-heading">
                <div>
                  <div className="correlation-over-time-section-eyebrow">
                    RESEARCH INTERPRETATION
                  </div>

                  <h3>
                    Reading the results
                  </h3>
                </div>
              </div>

              <div className="correlation-over-time-research-grid">
                <article className="correlation-over-time-research-card">
                  <div className="correlation-over-time-research-number">
                    01
                  </div>

                  <h4>
                    Same-country
                    association
                  </h4>

                  <p>
                    The analysis compares
                    yearly movements of{" "}
                    <strong>
                      {xIndicator}
                    </strong>{" "}
                    and{" "}
                    <strong>
                      {yIndicator}
                    </strong>{" "}
                    within{" "}
                    <strong>
                      {country}
                    </strong>
                    . Each year is one
                    observation in the
                    correlation calculation.
                  </p>
                </article>

                <article className="correlation-over-time-research-card">
                  <div className="correlation-over-time-research-number">
                    02
                  </div>

                  <h4>
                    Pearson vs
                    Spearman
                  </h4>

                  <p>
                    Pearson captures the
                    strength of a linear
                    relationship, while
                    Spearman evaluates whether
                    the relationship is
                    consistently monotonic
                    after replacing values
                    with their ranks.
                  </p>
                </article>

                <article className="correlation-over-time-research-card">
                  <div className="correlation-over-time-research-number">
                    03
                  </div>

                  <h4>
                    Time dimension
                  </h4>

                  <p>
                    Changing the selected
                    year range changes the
                    sample of yearly
                    observations and can
                    therefore change both the
                    correlation and regression
                    estimates.
                  </p>
                </article>

                <article className="correlation-over-time-research-card correlation-over-time-research-warning">
                  <div className="correlation-over-time-research-number">
                    04
                  </div>

                  <h4>
                    Correlation is not
                    causality
                  </h4>

                  <p>
                    A statistical association
                    between two indicators over
                    time does not by itself
                    establish that changes in
                    one variable caused changes
                    in the other.
                  </p>
                </article>
              </div>
            </section>
          </>
        )}
    </main>
  );
}

export default CorrelationOverTime;