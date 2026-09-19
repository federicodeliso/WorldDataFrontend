import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Calculator,
  CircleDollarSign,
  Landmark,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import "./SalaryTax.css";

const API = "http://127.0.0.1:8000";

type Country = {
  entity_id: number;
  name: string;
};

type PITBracket = {
  bracket: number;
  lower_bound: number | null;
  upper_bound: number | null;
  tax_rate: number;
};

type PITResponse = {
  country: string;
  year: number;
  currency: string;
  original_currency: string | null;
  bracket_count: number;
  brackets: PITBracket[];
};

type PCRContribution = {
  contributor: string;
  contribution_type: string;
  rate: number;
};

type PCRResponse = {
  country: string;
  year: number;
  contributor: string | null;
  count: number;
  contributions: PCRContribution[];
};

type DataPoint = {
  year?: number;
  Year?: number;
  value?: number | string | null;
  Value?: number | string | null;
};

type SalaryDataResponse = {
  data?: DataPoint[];
  values?: DataPoint[];
  observations?: DataPoint[];
};

type Currency =
  | "ORIGINAL"
  | "EUR"
  | "USD";

type SalaryMode =
  | "GROSS"
  | "NET"
  | "CORPORATE"
  | "AVERAGE"
  | "MEDIAN";

type WageDataset = {
  code: string;
  name: string;
};

type Calculation = {
  gross: number;
  employeeContribution: number;
  employeeRate: number;
  taxableIncome: number;
  incomeTax: number;
  net: number;
  employerContribution: number;
  employerRate: number;
  employerCost: number;
  effectiveTaxRate: number;
  effectiveEmployeeBurden: number;
  totalGovernmentBurden: number;
};

type OECDBreakdown = {
  country: string;
  employerContribution: number;
  employeeContribution: number;
  incomeTax: number;
  netSalary: number;
  corporateCost: number;
};

type ChartValueMode =
  | "CURRENCY"
  | "PERCENT";

const YEAR = 2024;

const currencySymbols: Record<
  Currency,
  string
> = {
  ORIGINAL: "",
  EUR: "€",
  USD: "$",
};

const currencyLabels: Record<
  Currency,
  string
> = {
  ORIGINAL: "Local",
  EUR: "EUR",
  USD: "USD",
};

const EURO_COUNTRIES = new Set([
  "Austria",
  "Belgium",
  "Croatia",
  "Cyprus",
  "Estonia",
  "Finland",
  "France",
  "Germany",
  "Greece",
  "Ireland",
  "Italy",
  "Latvia",
  "Lithuania",
  "Luxembourg",
  "Malta",
  "Netherlands",
  "Portugal",
  "Slovakia",
  "Slovenia",
  "Spain",
]);

/*
 * OECD members.
 */
const OECD_COUNTRIES = [
  "Australia",
  "Austria",
  "Belgium",
  "Canada",
  "Chile",
  "Colombia",
  "Costa Rica",
  "Czech Republic",
  "Denmark",
  "Estonia",
  "Finland",
  "France",
  "Germany",
  "Greece",
  "Hungary",
  "Iceland",
  "Ireland",
  "Israel",
  "Italy",
  "Japan",
  "Korea",
  "Latvia",
  "Lithuania",
  "Luxembourg",
  "Mexico",
  "Netherlands",
  "New Zealand",
  "Norway",
  "Poland",
  "Portugal",
  "Slovakia",
  "Slovenia",
  "Spain",
  "Sweden",
  "Switzerland",
  "Türkiye",
  "United Kingdom",
  "United States",
];

function parseNumber(
  value:
    | number
    | string
    | null
    | undefined
): number | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : null;
  }

  const cleaned = value
    .replace(/\s/g, "")
    .replace(/,/g, "");

  const parsed = Number(cleaned);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function getDataPoints(
  response:
    | SalaryDataResponse
    | DataPoint[]
): DataPoint[] {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response.data)) {
    return response.data;
  }

  if (Array.isArray(response.values)) {
    return response.values;
  }

  if (
    Array.isArray(
      response.observations
    )
  ) {
    return response.observations;
  }

  return [];
}

function extractPointValue(
  point: DataPoint
): number | null {
  return parseNumber(
    point.value ?? point.Value
  );
}

function extractPointYear(
  point: DataPoint
): number | null {
  const value =
    point.year ?? point.Year;

  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const year = Number(value);

  return Number.isFinite(year)
    ? year
    : null;
}

function selectWageObservation(
  points: DataPoint[]
): {
  value: number;
  year: number;
} | null {
  const cleaned = points
    .map((point) => ({
      value: extractPointValue(point),
      year: extractPointYear(point),
    }))
    .filter(
      (
        point
      ): point is {
        value: number;
        year: number;
      } =>
        point.value !== null &&
        point.year !== null &&
        point.year >= 2020 &&
        point.year <= YEAR
    )
    .sort(
      (a, b) =>
        b.year - a.year
    );

  if (!cleaned.length) {
    return null;
  }

  return cleaned[0];
}

function calculatePIT(
  taxableIncome: number,
  brackets: PITBracket[]
): number {
  if (
    taxableIncome <= 0 ||
    brackets.length === 0
  ) {
    return 0;
  }

  const sorted = [...brackets].sort(
    (a, b) =>
      a.lower_bound === null
        ? -1
        : b.lower_bound === null
        ? 1
        : a.lower_bound -
          b.lower_bound
  );

  let tax = 0;

  for (
    let i = 0;
    i < sorted.length;
    i += 1
  ) {
    const bracket = sorted[i];

    const lower =
      bracket.lower_bound ?? 0;

    const upper =
      bracket.upper_bound;

    if (taxableIncome <= lower) {
      continue;
    }

    const taxableAmount =
      upper === null
        ? taxableIncome - lower
        : Math.min(
            taxableIncome,
            upper
          ) - lower;

    if (taxableAmount > 0) {
      tax +=
        taxableAmount *
        bracket.tax_rate;
    }

    if (
      upper !== null &&
      taxableIncome <= upper
    ) {
      break;
    }
  }

  return Math.max(0, tax);
}

function calculateFromGross(
  gross: number,
  brackets: PITBracket[],
  employeeRate: number,
  employerRate: number
): Calculation {
  const employeeContribution =
    gross * employeeRate;

  const taxableIncome = Math.max(
    0,
    gross - employeeContribution
  );

  const incomeTax =
    calculatePIT(
      taxableIncome,
      brackets
    );

  const net =
    gross -
    employeeContribution -
    incomeTax;

  const employerContribution =
    gross * employerRate;

  const employerCost =
    gross + employerContribution;

  const effectiveTaxRate =
    gross > 0
      ? incomeTax / gross
      : 0;

  const effectiveEmployeeBurden =
    gross > 0
      ? (incomeTax +
          employeeContribution) /
        gross
      : 0;

  const totalGovernmentBurden =
    employerCost > 0
      ? (incomeTax +
          employeeContribution +
          employerContribution) /
        employerCost
      : 0;

  return {
    gross,
    employeeContribution,
    employeeRate,
    taxableIncome,
    incomeTax,
    net,
    employerContribution,
    employerRate,
    employerCost,
    effectiveTaxRate,
    effectiveEmployeeBurden,
    totalGovernmentBurden,
  };
}

function grossFromNet(
  targetNet: number,
  brackets: PITBracket[],
  employeeRate: number,
  employerRate: number
): Calculation {
  if (targetNet <= 0) {
    return calculateFromGross(
      0,
      brackets,
      employeeRate,
      employerRate
    );
  }

  let low = 0;

  let high = Math.max(
    targetNet * 2,
    1000
  );

  while (
    calculateFromGross(
      high,
      brackets,
      employeeRate,
      employerRate
    ).net < targetNet
  ) {
    high *= 2;

    if (high > 1e12) {
      break;
    }
  }

  for (
    let i = 0;
    i < 100;
    i += 1
  ) {
    const middle =
      (low + high) / 2;

    const result =
      calculateFromGross(
        middle,
        brackets,
        employeeRate,
        employerRate
      );

    if (result.net < targetNet) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return calculateFromGross(
    (low + high) / 2,
    brackets,
    employeeRate,
    employerRate
  );
}

function grossFromCorporateCost(
  corporateCost: number,
  brackets: PITBracket[],
  employeeRate: number,
  employerRate: number
): Calculation {
  const gross =
    corporateCost /
    (1 + employerRate);

  return calculateFromGross(
    gross,
    brackets,
    employeeRate,
    employerRate
  );
}

function formatMoney(
  value: number,
  _currency: Currency
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }
  ).format(
    Math.round(value)
  );
}

function formatPercent(
  value: number
) {
  return `${(
    value * 100
  ).toFixed(1)}%`;
}

function getWageDataset(
  country: string,
  currency: Currency,
  mode: SalaryMode
): WageDataset | null {
  if (
    mode !== "AVERAGE" &&
    mode !== "MEDIAN"
  ) {
    return null;
  }

  const isMedian =
    mode === "MEDIAN";

  const prefix = isMedian
    ? "MEDIAN_GROSS_ANNUAL_WAGE"
    : "AVG_ANNUAL_GROSS_WAGE";

  let suffix: string;

  if (currency === "USD") {
    suffix = "USD";
  } else if (currency === "EUR") {
    suffix = "EUR";
  } else {
    suffix =
      EURO_COUNTRIES.has(country)
        ? "EUR"
        : "OWNCURRENCY";
  }

  return {
    code: `${prefix}_${suffix}`,
    name:
      mode === "AVERAGE"
        ? "Average gross annual wage"
        : "Median gross annual wage",
  };
}

/*
 * Match OECD names against the names
 * actually returned by the database.
 */
function findCountryName(
  wanted: string,
  available: string[]
): string | null {
  const normalize = (
    value: string
  ) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  const aliases: Record<
    string,
    string[]
  > = {
    "czechrepublic": [
      "czech republic",
      "czechia",
    ],
    korea: [
      "korea",
      "south korea",
      "korea rep",
      "republic of korea",
    ],
    türkiye: [
      "türkiye",
      "turkey",
      "türkiye, republic of",
    ],
    slovakia: [
      "slovakia",
      "slovak republic",
    ],
  };

  const wantedNormalized =
    normalize(wanted);

  const direct =
    available.find(
      (name) =>
        normalize(name) ===
        wantedNormalized
    );

  if (direct) {
    return direct;
  }

  const possible =
    aliases[
      wanted.toLowerCase()
    ] ?? [];

  for (const alias of possible) {
    const match =
      available.find(
        (name) =>
          normalize(name) ===
          normalize(alias)
      );

    if (match) {
      return match;
    }
  }

  return null;
}

function getChartInputLabel(
  mode: SalaryMode
): string {
  switch (mode) {
    case "GROSS":
      return "Gross salary";
    case "NET":
      return "Net salary";
    case "CORPORATE":
      return "Corporate cost";
    case "AVERAGE":
      return "Average gross salary";
    case "MEDIAN":
      return "Median gross salary";
    default:
      return "Salary";
  }
}

function getChartModeDescription(
  mode: SalaryMode
): string {
  switch (mode) {
    case "GROSS":
      return "The same gross salary entered in the calculator is applied to every OECD country.";

    case "NET":
      return "The same target net salary entered in the calculator is applied to every OECD country.";

    case "CORPORATE":
      return "The same corporate labour cost entered in the calculator is applied to every OECD country.";

    case "AVERAGE":
      return "Each country uses its own average gross annual wage.";

    case "MEDIAN":
      return "Each country uses its own median gross annual wage.";

    default:
      return "";
  }
}

export default function SalaryTax() {
  const [countries, setCountries] =
    useState<Country[]>([]);

  const [country, setCountry] =
    useState("Italy");

  const [currency, setCurrency] =
    useState<Currency>("EUR");

  const [mode, setMode] =
    useState<SalaryMode>("GROSS");

  const [inputValue, setInputValue] =
    useState("50000");

  const [pit, setPit] =
    useState<PITResponse | null>(null);

  const [pcr, setPcr] =
    useState<PCRResponse | null>(null);

  const [
    wageObservation,
    setWageObservation,
  ] = useState<{
    value: number;
    year: number;
  } | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [
    wageLoading,
    setWageLoading,
  ] = useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [
    wageError,
    setWageError,
  ] = useState<string | null>(null);

  const [
    oecdData,
    setOecdData,
  ] = useState<OECDBreakdown[]>(
    []
  );

  const [
    oecdLoading,
    setOecdLoading,
  ] = useState(false);

  const [
    oecdError,
    setOecdError,
  ] = useState<string | null>(null);

  const [
    chartValueMode,
    setChartValueMode,
  ] = useState<ChartValueMode>(
    "CURRENCY"
  );

  /*
   * Series hidden through the chart legend.
   */
  const [
    hiddenSeries,
    setHiddenSeries,
  ] = useState<string[]>([]);

  /*
   * Clicking the same legend item again
   * brings that component back.
   */
  const handleLegendClick = (
    event: any
  ) => {
    const dataKey =
      String(event.dataKey);

    setHiddenSeries(
      (current) =>
        current.includes(dataKey)
          ? current.filter(
              (item) =>
                item !== dataKey
            )
          : [
              ...current,
              dataKey,
            ]
    );
  };

  /*
   * When the calculation mode changes,
   * start with all components visible.
   */
  useEffect(() => {
    setHiddenSeries([]);
  }, [mode]);

  useEffect(() => {
    fetch(`${API}/countries`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            "Failed to load countries"
          );
        }

        return response.json();
      })
      .then((data: Country[]) => {
        setCountries(data);

        if (
          data.some(
            (item) =>
              item.name === "Italy"
          )
        ) {
          setCountry("Italy");
        } else if (data.length) {
          setCountry(
            data[0].name
          );
        }
      })
      .catch(() => {
        setError(
          "Unable to load countries."
        );
      });
  }, []);

  /*
   * Load PIT and PCR for the selected
   * calculator country.
   */
  useEffect(() => {
    if (!country) {
      return;
    }

    setLoading(true);
    setError(null);

    Promise.all([
      fetch(
        `${API}/pit/${encodeURIComponent(
          country
        )}?currency=${currency}&year=${YEAR}`
      ).then((response) => {
        if (!response.ok) {
          throw new Error(
            "PIT data unavailable"
          );
        }

        return response.json() as Promise<PITResponse>;
      }),

      fetch(
        `${API}/pcr/${encodeURIComponent(
          country
        )}?year=${YEAR}`
      ).then((response) => {
        if (!response.ok) {
          throw new Error(
            "PCR data unavailable"
          );
        }

        return response.json() as Promise<PCRResponse>;
      }),
    ])
      .then(
        ([pitData, pcrData]) => {
          setPit(pitData);
          setPcr(pcrData);
        }
      )
      .catch(() => {
        setPit(null);
        setPcr(null);

        setError(
          "Unable to load salary tax data for this country."
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [country, currency]);

  /*
   * Load wage data only for the
   * Average / Median modes.
   */
  useEffect(() => {
    if (
      !country ||
      (mode !== "AVERAGE" &&
        mode !== "MEDIAN")
    ) {
      setWageObservation(null);
      setWageError(null);
      return;
    }

    const wageDataset =
      getWageDataset(
        country,
        currency,
        mode
      );

    if (!wageDataset) {
      return;
    }

    setWageLoading(true);
    setWageError(null);

    fetch(
      `${API}/data/${encodeURIComponent(
        country
      )}/${encodeURIComponent(
        wageDataset.code
      )}`
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            "Wage data unavailable"
          );
        }

        return response.json() as Promise<
          SalaryDataResponse
        >;
      })
      .then((response) => {
        const points =
          getDataPoints(response);

        const selected =
          selectWageObservation(
            points
          );

        setWageObservation(
          selected
        );
      })
      .catch(() => {
        setWageObservation(null);
        setWageError(
          "No data available."
        );
      })
      .finally(() => {
        setWageLoading(false);
      });
  }, [
    country,
    currency,
    mode,
  ]);

  const employeeRate =
    useMemo(() => {
      if (!pcr) {
        return 0;
      }

      return pcr.contributions
        .filter(
          (item) =>
            item.contributor
              .toLowerCase()
              .includes("employee")
        )
        .reduce(
          (sum, item) =>
            sum + item.rate,
          0
        );
    }, [pcr]);

  const employerRate =
    useMemo(() => {
      if (!pcr) {
        return 0;
      }

      return pcr.contributions
        .filter(
          (item) =>
            item.contributor
              .toLowerCase()
              .includes("employer")
        )
        .reduce(
          (sum, item) =>
            sum + item.rate,
          0
        );
    }, [pcr]);

  /*
   * Main calculator calculation.
   */
  const calculation =
    useMemo(() => {
      if (!pit) {
        return null;
      }

      let gross = 0;

      if (mode === "GROSS") {
        gross =
          Number(inputValue) || 0;
      }

      if (
        mode === "AVERAGE" ||
        mode === "MEDIAN"
      ) {
        gross =
          wageObservation?.value ?? 0;
      }

      if (mode === "NET") {
        return grossFromNet(
          Number(inputValue) || 0,
          pit.brackets,
          employeeRate,
          employerRate
        );
      }

      if (mode === "CORPORATE") {
        return grossFromCorporateCost(
          Number(inputValue) || 0,
          pit.brackets,
          employeeRate,
          employerRate
        );
      }

      return calculateFromGross(
        gross,
        pit.brackets,
        employeeRate,
        employerRate
      );
    }, [
      pit,
      mode,
      inputValue,
      wageObservation,
      employeeRate,
      employerRate,
    ]);

  /*
   * =====================================================
   * OECD COMPARISON
   *
   * IMPORTANT:
   * The OECD chart now follows the SAME salary
   * mode selected in the calculator above.
   *
   * GROSS:
   *     same gross input for every country
   *
   * NET:
   *     same net input for every country
   *
   * CORPORATE:
   *     same corporate cost for every country
   *
   * AVERAGE:
   *     each country gets its own average wage
   *
   * MEDIAN:
   *     each country gets its own median wage
   * =====================================================
   */
  useEffect(() => {
    let cancelled = false;

    async function loadOECDBreakdown() {
      setOecdLoading(true);
      setOecdError(null);

      try {
        const availableCountries =
          countries.map(
            (item) => item.name
          );

        const oecdCountries =
          OECD_COUNTRIES.map(
            (wanted) => ({
              wanted,
              actual:
                findCountryName(
                  wanted,
                  availableCountries
                ),
            })
          ).filter(
            (
              item
            ): item is {
              wanted: string;
              actual: string;
            } =>
              item.actual !== null
          );

        const results =
          await Promise.all(
            oecdCountries.map(
              async ({
                wanted,
                actual,
              }) => {
                try {
                  /*
                   * Load PIT.
                   */
                  const pitResponse =
                    await fetch(
                      `${API}/pit/${encodeURIComponent(
                        actual
                      )}?currency=${currency}&year=${YEAR}`
                    );

                  if (
                    !pitResponse.ok
                  ) {
                    return null;
                  }

                  const pitData =
                    (await pitResponse.json()) as PITResponse;

                  /*
                   * Load PCR.
                   */
                  const pcrResponse =
                    await fetch(
                      `${API}/pcr/${encodeURIComponent(
                        actual
                      )}?year=${YEAR}`
                    );

                  if (
                    !pcrResponse.ok
                  ) {
                    return null;
                  }

                  const pcrData =
                    (await pcrResponse.json()) as PCRResponse;

                  const countryEmployeeRate =
                    pcrData.contributions
                      .filter(
                        (item) =>
                          item.contributor
                            .toLowerCase()
                            .includes(
                              "employee"
                            )
                      )
                      .reduce(
                        (sum, item) =>
                          sum +
                          item.rate,
                        0
                      );

                  const countryEmployerRate =
                    pcrData.contributions
                      .filter(
                        (item) =>
                          item.contributor
                            .toLowerCase()
                            .includes(
                              "employer"
                            )
                      )
                      .reduce(
                        (sum, item) =>
                          sum +
                          item.rate,
                        0
                      );

                  /*
                   * -----------------------------------
                   * Determine what salary/cost to use.
                   * -----------------------------------
                   */

                  let countryCalculation:
                    | Calculation
                    | null = null;

                  /*
                   * AVERAGE / MEDIAN
                   *
                   * Each country gets its own wage.
                   */
                  if (
                    mode === "AVERAGE" ||
                    mode === "MEDIAN"
                  ) {
                    const wageDataset =
                      getWageDataset(
                        actual,
                        currency,
                        mode
                      );

                    if (
                      !wageDataset
                    ) {
                      return null;
                    }

                    const wageResponse =
                      await fetch(
                        `${API}/data/${encodeURIComponent(
                          actual
                        )}/${encodeURIComponent(
                          wageDataset.code
                        )}`
                      );

                    if (
                      !wageResponse.ok
                    ) {
                      return null;
                    }

                    const wageJson =
                      (await wageResponse.json()) as
                        | SalaryDataResponse
                        | DataPoint[];

                    const wage =
                      selectWageObservation(
                        getDataPoints(
                          wageJson
                        )
                      );

                    if (!wage) {
                      return null;
                    }

                    countryCalculation =
                      calculateFromGross(
                        wage.value,
                        pitData.brackets,
                        countryEmployeeRate,
                        countryEmployerRate
                      );
                  }

                  /*
                   * GROSS
                   *
                   * Same gross amount for every
                   * OECD country.
                   */
                  if (
                    mode === "GROSS"
                  ) {
                    countryCalculation =
                      calculateFromGross(
                        Number(
                          inputValue
                        ) || 0,
                        pitData.brackets,
                        countryEmployeeRate,
                        countryEmployerRate
                      );
                  }

                  /*
                   * NET
                   *
                   * Same target net amount for
                   * every OECD country.
                   */
                  if (
                    mode === "NET"
                  ) {
                    countryCalculation =
                      grossFromNet(
                        Number(
                          inputValue
                        ) || 0,
                        pitData.brackets,
                        countryEmployeeRate,
                        countryEmployerRate
                      );
                  }

                  /*
                   * CORPORATE
                   *
                   * Same corporate cost for
                   * every OECD country.
                   */
                  if (
                    mode ===
                    "CORPORATE"
                  ) {
                    countryCalculation =
                      grossFromCorporateCost(
                        Number(
                          inputValue
                        ) || 0,
                        pitData.brackets,
                        countryEmployeeRate,
                        countryEmployerRate
                      );
                  }

                  if (
                    !countryCalculation
                  ) {
                    return null;
                  }

                  return {
                    country: wanted,
                    employerContribution:
                      countryCalculation.employerContribution,
                    employeeContribution:
                      countryCalculation.employeeContribution,
                    incomeTax:
                      countryCalculation.incomeTax,
                    netSalary:
                      countryCalculation.net,
                    corporateCost:
                      countryCalculation.employerCost,
                  };
                } catch {
                  return null;
                }
              }
            )
          );

        if (!cancelled) {
          setOecdData(
            results.filter(
              (
                item
              ): item is OECDBreakdown =>
                item !== null
            )
          );
        }
      } catch {
        if (!cancelled) {
          setOecdData([]);
          setOecdError(
            "Unable to load OECD salary comparison."
          );
        }
      } finally {
        if (!cancelled) {
          setOecdLoading(false);
        }
      }
    }

    if (countries.length) {
      loadOECDBreakdown();
    }

    return () => {
      cancelled = true;
    };
  }, [
    countries,
    currency,
    mode,
    inputValue,
  ]);

  /*
   * Convert OECD calculation data into
   * Recharts data.
   */
  const oecdChartData =
    useMemo(() => {
      return [...oecdData]
        .sort(
          (a, b) =>
            b.corporateCost -
            a.corporateCost
        )
        .map((item) => {
          if (
            chartValueMode ===
            "PERCENT"
          ) {
            const total =
              item.corporateCost;

            return {
              country: item.country,

              "Employer contributions":
                total > 0
                  ? (item.employerContribution /
                      total) *
                    100
                  : 0,

              "Employee contributions":
                total > 0
                  ? (item.employeeContribution /
                      total) *
                    100
                  : 0,

              "Income tax":
                total > 0
                  ? (item.incomeTax /
                      total) *
                    100
                  : 0,

              "Net salary":
                total > 0
                  ? (item.netSalary /
                      total) *
                    100
                  : 0,

              corporateCost:
                total,
            };
          }

          return {
            country: item.country,

            "Employer contributions":
              item.employerContribution,

            "Employee contributions":
              item.employeeContribution,

            "Income tax":
              item.incomeTax,

            "Net salary":
              item.netSalary,

            corporateCost:
              item.corporateCost,
          };
        });
    }, [
      oecdData,
      chartValueMode,
    ]);

  const inputLabel =
    mode === "CORPORATE"
      ? "Corporate cost"
      : mode === "NET"
      ? "Target net salary"
      : "Gross salary";

  const wageMode =
    mode === "AVERAGE" ||
    mode === "MEDIAN";

  const hasWageData =
    !wageMode ||
    wageObservation !== null;

  const chartInputLabel =
    getChartInputLabel(mode);

  const chartModeDescription =
    getChartModeDescription(mode);

  /*
   * =====================================================
   * RENDER
   * =====================================================
   */

  return (
    <div className="salary-page">
      <div className="salary-header">
        <div>
          <div className="eyebrow">
            WORLD DATA · SALARY & TAX
          </div>

          <h1>
            Salary & Tax Calculator
          </h1>

          <p className="salary-header-note">
            <strong>
              Transparent salary calculation
            </strong>

            <span>
              Income tax, employee
              contributions, employer
              contributions and net pay.
            </span>
          </p>
        </div>
      </div>

      {error && (
        <div className="salary-error">
          {error}
        </div>
      )}

      <div className="salary-layout">
        <section className="salary-card">
          <div className="salary-card-header">
            <div>
              <h2>
                Calculator
              </h2>

              <p>
                Choose a country, currency
                and calculation method.
              </p>
            </div>

            <Calculator
              size={22}
              strokeWidth={1.8}
            />
          </div>

          <div className="salary-card-body">
            <div className="salary-field">
              <label className="salary-field-label">
                Country
              </label>

              <select
                className="salary-select"
                value={country}
                onChange={(event) =>
                  setCountry(
                    event.target.value
                  )
                }
              >
                {countries.map(
                  (item) => (
                    <option
                      key={
                        item.entity_id
                      }
                      value={item.name}
                    >
                      {item.name}
                    </option>
                  )
                )}
              </select>
            </div>

            <div className="salary-field">
              <label className="salary-field-label">
                Currency
              </label>

              <div className="currency-options">
                {(
                  Object.keys(
                    currencyLabels
                  ) as Currency[]
                ).map(
                  (item) => (
                    <button
                      key={item}
                      type="button"
                      className={`currency-button ${
                        currency === item
                          ? "selected"
                          : ""
                      }`}
                      onClick={() =>
                        setCurrency(item)
                      }
                    >
                      {currencySymbols[
                        item
                      ] && (
                        <span>
                          {
                            currencySymbols[
                              item
                            ]
                          }
                        </span>
                      )}

                      {
                        currencyLabels[
                          item
                        ]
                      }
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="salary-field">
              <label className="salary-field-label">
                Salary mode
              </label>

              <div className="salary-mode-grid">
                <button
                  type="button"
                  className={`salary-mode-button ${
                    mode === "CORPORATE"
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    setMode(
                      "CORPORATE"
                    )
                  }
                >
                  <Landmark
                    size={17}
                  />

                  <span>
                    Enter Corporate Cost
                  </span>
                </button>

                <button
                  type="button"
                  className={`salary-mode-button ${
                    mode === "GROSS"
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    setMode("GROSS")
                  }
                >
                  <Wallet
                    size={17}
                  />

                  <span>
                    Enter Gross
                  </span>
                </button>

                <button
                  type="button"
                  className={`salary-mode-button ${
                    mode === "AVERAGE"
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    setMode(
                      "AVERAGE"
                    )
                  }
                >
                  <CircleDollarSign
                    size={17}
                  />

                  <span>
                    Use Average Gross
                  </span>
                </button>

                <button
                  type="button"
                  className={`salary-mode-button ${
                    mode === "MEDIAN"
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    setMode(
                      "MEDIAN"
                    )
                  }
                >
                  <CircleDollarSign
                    size={17}
                  />

                  <span>
                    Use Median Gross
                  </span>
                </button>

                <button
                  type="button"
                  className={`salary-mode-button ${
                    mode === "NET"
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    setMode("NET")
                  }
                >
                  <ShieldCheck
                    size={17}
                  />

                  <span>
                    Enter Net
                  </span>
                </button>
              </div>
            </div>

            {!wageMode && (
              <div className="salary-field">
                <label className="salary-field-label">
                  {inputLabel}
                </label>

                <div className="salary-input-wrap">
                  <span>
                    {
                      currencySymbols[
                        currency
                      ]
                    }
                  </span>

                  <input
                    className="salary-input salary-number"
                    type="number"
                    min="0"
                    step="100"
                    value={
                      inputValue
                    }
                    onChange={(
                      event
                    ) =>
                      setInputValue(
                        event.target
                          .value
                      )
                    }
                  />
                </div>
              </div>
            )}

            {wageMode && (
              <div className="salary-source-card">
                <div>
                  <span className="eyebrow">
                    DATA SOURCE
                  </span>

                  <strong>
                    {mode ===
                    "AVERAGE"
                      ? "Average gross annual wage"
                      : "Median gross annual wage"}
                  </strong>

                  <span>
                    {wageLoading
                      ? "Loading wage data..."
                      : wageObservation
                      ? `Using ${wageObservation.year} wage data`
                      : wageError ??
                        "No data"}
                  </span>
                </div>

                {wageObservation && (
                  <strong>
                    {
                      currencySymbols[
                        currency
                      ]
                    }
                    {formatMoney(
                      wageObservation.value,
                      currency
                    )}
                  </strong>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="salary-result">
          <div className="salary-result-top">
            <div>
              <div className="eyebrow">
                ESTIMATED RESULT
              </div>

              <h2>
                {calculation &&
                hasWageData
                  ? `${
                      currencySymbols[
                        currency
                      ]
                    }${formatMoney(
                      calculation.net,
                      currency
                    )}`
                  : "No data"}
              </h2>

              <p>
                Estimated annual net salary
              </p>
            </div>
          </div>

          {calculation &&
            hasWageData && (
              <div className="salary-result-content">
                <div className="salary-stat-grid">
                  <div className="salary-stat">
                    <span>
                      Gross salary
                    </span>

                    <strong>
                      {
                        currencySymbols[
                          currency
                        ]
                      }
                      {formatMoney(
                        calculation.gross,
                        currency
                      )}
                    </strong>
                  </div>

                  <div className="salary-stat">
                    <span>
                      Employee contributions
                    </span>

                    <strong>
                      {
                        currencySymbols[
                          currency
                        ]
                      }
                      {formatMoney(
                        calculation.employeeContribution,
                        currency
                      )}
                    </strong>

                    <small>
                      {formatPercent(
                        calculation.employeeRate
                      )}
                    </small>
                  </div>

                  <div className="salary-stat">
                    <span>
                      Income tax
                    </span>

                    <strong>
                      {
                        currencySymbols[
                          currency
                        ]
                      }
                      {formatMoney(
                        calculation.incomeTax,
                        currency
                      )}
                    </strong>

                    <small>
                      {formatPercent(
                        calculation.effectiveTaxRate
                      )}
                    </small>
                  </div>

                  <div className="salary-stat">
                    <span>
                      Employer cost
                    </span>

                    <strong>
                      {
                        currencySymbols[
                          currency
                        ]
                      }
                      {formatMoney(
                        calculation.employerCost,
                        currency
                      )}
                    </strong>
                  </div>
                </div>

                <div className="salary-breakdown">
                  <div className="salary-breakdown-heading">
                    <strong>
                      Salary breakdown
                    </strong>

                    <span>
                      Annual calculation
                    </span>
                  </div>

                  <div className="salary-breakdown-row">
                    <div className="salary-breakdown-label">
                      <strong>
                        Gross salary
                      </strong>

                      <span>
                        Before deductions
                      </span>
                    </div>

                    <strong className="salary-breakdown-value">
                      {
                        currencySymbols[
                          currency
                        ]
                      }
                      {formatMoney(
                        calculation.gross,
                        currency
                      )}
                    </strong>
                  </div>

                  <div className="salary-breakdown-row">
                    <div className="salary-breakdown-label">
                      <strong>
                        Employee contributions
                      </strong>

                      <span>
                        Social contributions
                      </span>
                    </div>

                    <strong className="salary-breakdown-value">
                      −
                      {
                        currencySymbols[
                          currency
                        ]
                      }
                      {formatMoney(
                        calculation.employeeContribution,
                        currency
                      )}
                    </strong>
                  </div>

                  <div className="salary-breakdown-row">
                    <div className="salary-breakdown-label">
                      <strong>
                        Income tax
                      </strong>

                      <span>
                        Progressive PIT
                      </span>
                    </div>

                    <strong className="salary-breakdown-value">
                      −
                      {
                        currencySymbols[
                          currency
                        ]
                      }
                      {formatMoney(
                        calculation.incomeTax,
                        currency
                      )}
                    </strong>
                  </div>

                  <div className="salary-breakdown-row">
                    <div className="salary-breakdown-label">
                      <strong>
                        Net salary
                      </strong>

                      <span>
                        After employee deductions
                      </span>
                    </div>

                    <strong className="salary-breakdown-value">
                      {
                        currencySymbols[
                          currency
                        ]
                      }
                      {formatMoney(
                        calculation.net,
                        currency
                      )}
                    </strong>
                  </div>
                </div>

                <div className="salary-burden">
                  <div className="salary-burden-heading">
                    <ShieldCheck
                      size={18}
                    />

                    <strong>
                      Effective burden
                    </strong>
                  </div>

                  <div className="salary-burden-grid">
                    <div className="salary-burden-item">
                      <span>
                        Employee burden
                      </span>

                      <strong>
                        {formatPercent(
                          calculation.effectiveEmployeeBurden
                        )}
                      </strong>
                    </div>

                    <div className="salary-burden-item">
                      <span>
                        Total government burden
                      </span>

                      <strong>
                        {formatPercent(
                          calculation.totalGovernmentBurden
                        )}
                      </strong>
                    </div>

                    <div className="salary-burden-item">
                      <span>
                        Employer contribution
                      </span>

                      <strong>
                        {formatPercent(
                          calculation.employerRate
                        )}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="salary-note">
                  <strong>
                    Important
                  </strong>

                  <span>
                    This is a simplified calculation
                    based on the available national
                    income-tax brackets and social
                    contribution rates. It does not
                    include deductions, tax credits,
                    local taxes or contribution caps
                    unless represented in the source data.
                  </span>
                </div>
              </div>
            )}
        </section>
      </div>

      {pit && (
        <section className="salary-tax-section">
          <div className="salary-tax-section-heading">
            <div>
              <h2>
                Personal income tax brackets
              </h2>

              <p>
                {country} · {YEAR} ·{" "}
                {currency}
              </p>
            </div>

            <span>
              {pit.bracket_count} brackets
            </span>
          </div>

          <div className="salary-tax-table">
            <div className="salary-tax-table-header">
              <span>
                Bracket
              </span>

              <span>
                Lower bound
              </span>

              <span>
                Upper bound
              </span>

              <span>
                Tax rate
              </span>
            </div>

            {pit.brackets.map(
              (bracket) => (
                <div
                  className="salary-tax-table-row"
                  key={
                    bracket.bracket
                  }
                >
                  <span>
                    {bracket.bracket}
                  </span>

                  <span>
                    {bracket.lower_bound ===
                    null
                      ? "—"
                      : `${currencySymbols[
                          currency
                        ]}${formatMoney(
                          bracket.lower_bound,
                          currency
                        )}`}
                  </span>

                  <span>
                    {bracket.upper_bound ===
                    null
                      ? "∞"
                      : `${currencySymbols[
                          currency
                        ]}${formatMoney(
                          bracket.upper_bound,
                          currency
                        )}`}
                  </span>

                  <strong>
                    {(
                      bracket.tax_rate *
                      100
                    ).toFixed(1)}
                    %
                  </strong>
                </div>
              )
            )}
          </div>
        </section>
      )}

      {/* =====================================================
          OECD SALARY BREAKDOWN
          ===================================================== */}

      <section className="salary-oecd-section">
        <div className="salary-oecd-header">
          <div>
            <div className="eyebrow">
              OECD · {YEAR}
            </div>

            <h2>
              Salary breakdown across OECD countries
            </h2>

            <p>
              {chartInputLabel}.{" "}
              {chartModeDescription}
            </p>
          </div>

          <div className="salary-oecd-controls">
            <button
              type="button"
              className={`salary-chart-toggle ${
                chartValueMode ===
                "CURRENCY"
                  ? "selected"
                  : ""
              }`}
              onClick={() =>
                setChartValueMode(
                  "CURRENCY"
                )
              }
            >
              {currencySymbols[
                currency
              ] ||
                currencyLabels[
                  currency
                ]}
            </button>

            <button
              type="button"
              className={`salary-chart-toggle ${
                chartValueMode ===
                "PERCENT"
                  ? "selected"
                  : ""
              }`}
              onClick={() =>
                setChartValueMode(
                  "PERCENT"
                )
              }
            >
              % of corporate cost
            </button>
          </div>
        </div>

        {oecdLoading && (
          <div className="salary-oecd-loading">
            Updating OECD salary comparison…
          </div>
        )}

        {oecdError && (
          <div className="salary-error">
            {oecdError}
          </div>
        )}

        {!oecdLoading &&
          !oecdError &&
          oecdChartData.length > 0 && (
            <div className="salary-oecd-chart-card">
              <div className="salary-oecd-chart-meta">
                <div>
                  <strong>
                    {chartInputLabel} → salary breakdown
                  </strong>

                  <span>
                    Employer contributions,
                    employee contributions,
                    income tax and net salary.
                  </span>
                </div>

                <span>
                  {
                    oecdChartData.length
                  }{" "}
                  OECD countries
                </span>
              </div>

              <div className="salary-oecd-chart">
                <ResponsiveContainer
                  width="100%"
                  height={620}
                >
                  <BarChart
                    data={
                      oecdChartData
                    }
                    margin={{
                      top: 20,
                      right: 25,
                      left: 10,
                      bottom: 120,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                    />

                    <XAxis
                      dataKey="country"
                      interval={0}
                      angle={-45}
                      textAnchor="end"
                      height={120}
                      tick={{
                        fontSize: 11,
                      }}
                    />


                    <YAxis
                      domain={
                        chartValueMode === "PERCENT"
                          ? [0, 100]
                          : [0, "auto"]
                      }
                      tickFormatter={(value) => {
                        if (
                          chartValueMode === "PERCENT"
                        ) {
                          return `${Number(value).toFixed(0)}%`;
                        }

                        return `${
                          currencySymbols[currency]
                        }${new Intl.NumberFormat(
                          "en-US",
                          {
                            notation: "compact",
                            maximumFractionDigits: 1,
                          }
                        ).format(Number(value))}`;
                      }}
                    />


                    <Tooltip
                      formatter={(
                        value,
                        name
                      ) => [
                        chartValueMode ===
                        "PERCENT"
                          ? `${Number(
                              value
                            ).toFixed(
                              1
                            )}%`
                          : `${
                              currencySymbols[
                                currency
                              ]
                            }${formatMoney(
                              Number(
                                value
                              ),
                              currency
                            )}`,
                        String(name),
                      ]}
                      labelFormatter={(
                        label
                      ) =>
                        String(
                          label
                        )
                      }
                    />

                    <Legend
                      verticalAlign="bottom"
                      height={50}
                      wrapperStyle={{
                        cursor: "pointer",
                      }}
                      onClick={
                        handleLegendClick
                      }
                    />

                    <Bar
                      dataKey="Net salary"
                      stackId="salary"
                      name="Net salary"
                      fill="#10b981"
                      hide={hiddenSeries.includes(
                        "Net salary"
                      )}
                    />

                    <Bar
                      dataKey="Income tax"
                      stackId="salary"
                      name="Income tax"
                      fill="#ef4444"
                      hide={hiddenSeries.includes(
                        "Income tax"
                      )}
                    />

                    <Bar
                      dataKey="Employee contributions"
                      stackId="salary"
                      name="Employee contributions"
                      fill="#7c3aed"
                      hide={hiddenSeries.includes(
                        "Employee contributions"
                      )}
                    />

                    <Bar
                      dataKey="Employer contributions"
                      stackId="salary"
                      name="Employer contributions"
                      fill="#2563eb"
                      hide={hiddenSeries.includes(
                        "Employer contributions"
                      )}
                    />

                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="salary-oecd-footer">
                <span>
                  Total bar height represents
                  corporate cost: gross salary
                  plus employer contributions.
                </span>

                <span>
                  Click a legend item to hide or
                  show that component.
                </span>
              </div>
            </div>
          )}

        {!oecdLoading &&
          !oecdError &&
          oecdChartData.length === 0 && (
            <div className="salary-oecd-empty">
              No OECD salary data available.
            </div>
          )}
      </section>

      {loading && (
        <div className="salary-loading">
          Loading tax data…
        </div>
      )}
    </div>
  );
}