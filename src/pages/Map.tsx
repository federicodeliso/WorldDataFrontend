import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Minus, Plus, RotateCcw } from "lucide-react";
import { geoNaturalEarth1, geoPath, type GeoProjection } from "d3-geo";
import type {
  Feature,
  FeatureCollection,
  Geometry,
  GeoJsonProperties,
} from "geojson";
import "./Map.css";

const API = "https://worlddataapi-kf6d.onrender.com";
const GEOJSON_URL = "/Combinedwitheuregions.geojson";

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 520;

const COLORS = [
  "#f1f5f9",
  "#dbeafe",
  "#bfdbfe",
  "#93c5fd",
  "#60a5fa",
  "#3b82f6",
  "#2563eb",
  "#1d4ed8",
  "#1e40af",
  "#172554",
];

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

type RegionLevel =
  | "countries"
  | "us_states"
  | "canada_provinces"
  | "china_regions"
  | "india_states"
  | "eu_regions";

type MapFeatureProperties = GeoJsonProperties & {
  name?: string;
  NAME?: string;
  NAME_LATN?: string;
  NUTS_ID?: string;
  NUTS_NAME?: string;
  st_nm?: string;
  STATE?: string;
  abbrev?: string;
  postal?: string;
  iso_a2?: string;
  iso_a3?: string;
  adm0_a3?: string;
  admin?: string;
  sovereign?: string;
  shapeName?: string;
  shapeISO?: string;
  shapeGroup?: string;
};

type MapFeature = Feature<
  Geometry | null,
  MapFeatureProperties
>;

type MapCollection = FeatureCollection<
  Geometry | null,
  MapFeatureProperties
>;

const COUNTRY_ALIASES: Record<string, string[]> = {
  "united states": [
    "united states of america",
    "usa",
    "us",
  ],

  "united kingdom": [
    "uk",
    "great britain",
  ],

  russia: [
    "russian federation",
  ],

  "south korea": [
    "republic of korea",
    "korea republic of",
    "korea south",
  ],

  "north korea": [
    "democratic peoples republic of korea",
    "korea north",
  ],

  iran: [
    "iran islamic republic of",
    "islamic republic of iran",
  ],

  venezuela: [
    "venezuela bolivarian republic of",
  ],

  bolivia: [
    "bolivia plurinational state of",
  ],

  tanzania: [
    "united republic of tanzania",
  ],

  moldova: [
    "republic of moldova",
  ],

  vietnam: [
    "viet nam",
  ],

  laos: [
    "lao peoples democratic republic",
    "lao pdr",
  ],

  syria: [
    "syrian arab republic",
  ],

  brunei: [
    "brunei darussalam",
  ],

  czechia: [
    "czech republic",
  ],

  eswatini: [
    "swaziland",
  ],

  myanmar: [
    "burma",
  ],

  "cape verde": [
    "cabo verde",
  ],

  "ivory coast": [
    "cote divoire",
    "cote d ivoire",
  ],

  "democratic republic of the congo": [
    "democratic republic of congo",
    "dr congo",
    "drc",
  ],

  congo: [
    "republic of the congo",
    "congo republic",
  ],

  "north macedonia": [
    "macedonia",
    "former yugoslav republic of macedonia",
  ],
};

const US_STATES = new Set([
  "alabama",
  "alaska",
  "arizona",
  "arkansas",
  "california",
  "colorado",
  "connecticut",
  "delaware",
  "district of columbia",
  "florida",
  "georgia",
  "hawaii",
  "idaho",
  "illinois",
  "indiana",
  "iowa",
  "kansas",
  "kentucky",
  "louisiana",
  "maine",
  "maryland",
  "massachusetts",
  "michigan",
  "minnesota",
  "mississippi",
  "missouri",
  "montana",
  "nebraska",
  "nevada",
  "new hampshire",
  "new jersey",
  "new mexico",
  "new york",
  "north carolina",
  "north dakota",
  "ohio",
  "oklahoma",
  "oregon",
  "pennsylvania",
  "rhode island",
  "south carolina",
  "south dakota",
  "tennessee",
  "texas",
  "utah",
  "vermont",
  "virginia",
  "washington",
  "west virginia",
  "wisconsin",
  "wyoming",
]);

const CANADA_PROVINCES = new Set([
  "alberta",
  "british columbia",
  "manitoba",
  "new brunswick",
  "newfoundland and labrador",
  "northwest territories",
  "nova scotia",
  "nunavut",
  "ontario",
  "prince edward island",
  "quebec",
  "saskatchewan",
  "yukon",
]);

const CHINA_REGIONS = new Set([
  "anhui",
  "beijing",
  "chongqing",
  "fujian",
  "gansu",
  "guangdong",
  "guangxi",
  "guizhou",
  "hainan",
  "hebei",
  "heilongjiang",
  "henan",
  "hubei",
  "hunan",
  "inner mongolia",
  "jiangsu",
  "jiangxi",
  "jilin",
  "liaoning",
  "ningxia",
  "qinghai",
  "shaanxi",
  "shandong",
  "shanghai",
  "shanxi",
  "sichuan",
  "tianjin",
  "tibet",
  "xinjiang",
  "yunnan",
  "zhejiang",
]);

const INDIA_STATES = new Set([
  "andaman and nicobar islands",
  "andhra pradesh",
  "arunachal pradesh",
  "assam",
  "bihar",
  "chandigarh",
  "chhattisgarh",
  "delhi",
  "goa",
  "gujarat",
  "haryana",
  "himachal pradesh",
  "jammu and kashmir",
  "jharkhand",
  "karnataka",
  "kerala",
  "madhya pradesh",
  "maharashtra",
  "manipu",
  "manipur",
  "meghalaya",
  "mizoram",
  "nagaland",
  "odisha",
  "puducherry",
  "punjab",
  "rajasthan",
  "sikkim",
  "tamil nadu",
  "telangana",
  "tripura",
  "uttar pradesh",
  "uttarakhand",
  "west bengal",
]);

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function countryNamesMatch(
  apiName: string,
  mapName: string
) {
  const api = normalizeName(apiName);
  const map = normalizeName(mapName);

  if (api === map) {
    return true;
  }

  const aliases = COUNTRY_ALIASES[api];

  if (
    aliases?.some(
      (alias) =>
        normalizeName(alias) === map
    )
  ) {
    return true;
  }

  const reverseAliases = COUNTRY_ALIASES[map];

  if (
    reverseAliases?.some(
      (alias) =>
        normalizeName(alias) === api
    )
  ) {
    return true;
  }

  return false;
}

function getFeatureName(
  feature: MapFeature
) {
  const properties = feature.properties ?? {};

  return (
    properties.NUTS_NAME ??
    properties.NAME_LATN ??
    properties.NUTS_ID ??
    properties.NAME ??
    properties.st_nm ??
    properties.STATE ??
    properties.shapeName ??
    properties.name ??
    properties.admin ??
    ""
  );
}

function getFeatureCountry(
  feature: MapFeature
) {
  const properties = feature.properties ?? {};

  return (
    properties.admin ??
    properties.sovereign ??
    properties.shapeGroup ??
    properties.adm0_a3 ??
    ""
  );
}

function classifyFeature(
  feature: MapFeature
): RegionLevel | null {
  const name = normalizeName(
    getFeatureName(feature)
  );

  const properties = feature.properties ?? {};

  const nutsId = normalizeName(
    properties.NUTS_ID ?? ""
  );

  if (US_STATES.has(name)) {
    return "us_states";
  }

  if (CANADA_PROVINCES.has(name)) {
    return "canada_provinces";
  }

  if (CHINA_REGIONS.has(name)) {
    return "china_regions";
  }

  if (INDIA_STATES.has(name)) {
    return "india_states";
  }

  if (
    properties.NUTS_ID ||
    properties.NUTS_NAME ||
    nutsId.startsWith("eu")
  ) {
    return "eu_regions";
  }

  return "countries";
}

function formatValue(
  value: number | null
) {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "No data";
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

function getColor(
  value: number | null,
  minimum: number,
  maximum: number
) {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return "#f1f5f9";
  }

  if (maximum <= minimum) {
    return COLORS[
      Math.floor(COLORS.length / 2)
    ];
  }

  const ratio =
    (value - minimum) /
    (maximum - minimum);

  const index = Math.max(
    0,
    Math.min(
      COLORS.length - 1,
      Math.floor(
        ratio * COLORS.length
      )
    )
  );

  return COLORS[index];
}

const REGION_LABELS: Record<
  RegionLevel,
  string
> = {
  countries: "Countries",
  us_states: "US states",
  canada_provinces: "Canadian provinces",
  china_regions: "Chinese regions",
  india_states: "Indian states",
  eu_regions: "EU regions",
};

function Map() {
  const [mapCollection, setMapCollection] =
    useState<MapCollection | null>(null);

  const [countries, setCountries] =
    useState<Country[]>([]);

  const [indicators, setIndicators] =
    useState<Indicator[]>([]);

  const [observations, setObservations] =
    useState<Observation[]>([]);

  const [selectedIndicator, setSelectedIndicator] =
    useState("");

  const [selectedYear, setSelectedYear] =
    useState(2024);

  const [regionLevel, setRegionLevel] =
    useState<RegionLevel>("countries");

  const [hoveredFeature, setHoveredFeature] =
    useState<string | null>(null);

  const [loadingMetadata, setLoadingMetadata] =
    useState(true);

  const [loadingMap, setLoadingMap] =
    useState(true);

  const [loadingData, setLoadingData] =
    useState(false);

  const [error, setError] =
    useState("");

  const [zoom, setZoom] =
    useState(1);

  const [pan, setPan] =
    useState({
      x: 0,
      y: 0,
    });

  const [isDragging, setIsDragging] =
    useState(false);

  const dragStart = useRef({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });

  const mapRef =
    useRef<HTMLDivElement>(null);

  /*
   * ---------------------------------------------------------
   * LOAD THE COMBINED GEOJSON
   * ---------------------------------------------------------
   *
   * IMPORTANT:
   * The GeoJSON is in /public, so we DO NOT import it.
   *
   * The browser requests:
   *
   * /Combinedwitheuregions.geojson
   *
   * Vite/React serves files inside public directly.
   */
  useEffect(() => {
    let cancelled = false;

    async function loadGeoJson() {
      try {
        setLoadingMap(true);

        const response =
          await fetch(GEOJSON_URL);

        if (!response.ok) {
          throw new Error(
            `Could not load ${GEOJSON_URL}.`
          );
        }

        const json =
          (await response.json()) as MapCollection;

        if (cancelled) {
          return;
        }

        if (
          json.type !==
            "FeatureCollection" ||
          !Array.isArray(json.features)
        ) {
          throw new Error(
            "The GeoJSON file is not a valid FeatureCollection."
          );
        }

        setMapCollection(json);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load map geometry."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingMap(false);
        }
      }
    }

    loadGeoJson();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadMetadata() {
      try {
        setLoadingMetadata(true);
        setError("");

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
          setSelectedIndicator(
            indicatorRows[0].code
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load map metadata."
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
   * ---------------------------------------------------------
   * LOAD INDICATOR DATA
   * ---------------------------------------------------------
   *
   * We intentionally use the names returned by /countries.
   *
   * This is why California can exist in GDP_COM even though
   * the endpoint /data/California/GDP_COM may not exist.
   *
   * The map is therefore not assuming that every observation
   * has a country-level API endpoint.
   */
  useEffect(() => {
    if (!selectedIndicator) {
      setObservations([]);
      return;
    }

    let cancelled = false;

    async function loadIndicatorData() {
      try {
        setLoadingData(true);
        setError("");

        const geographicNames =
          countries
            .map(
              (country) =>
                country.name ??
                country.country_name ??
                country.code ??
                country.iso3 ??
                ""
            )
            .filter(Boolean);

        const responses =
          await Promise.all(
            geographicNames.map(
              async (geographicName) => {
                try {
                  const response =
                    await fetch(
                      `${API}/data/${encodeURIComponent(
                        geographicName
                      )}/${encodeURIComponent(
                        selectedIndicator
                      )}`
                    );

                  if (!response.ok) {
                    return [];
                  }

                  const json =
                    await response.json();

                  return Array.isArray(json)
                    ? json
                    : json?.results ??
                      json?.data ??
                      [];
                } catch {
                  return [];
                }
              }
            )
          );

        if (cancelled) {
          return;
        }

        const rows: Observation[] = [];

        geographicNames.forEach(
          (geographicName, index) => {
            const result =
              responses[index];

            if (!Array.isArray(result)) {
              return;
            }

            result.forEach(
              (row: any) => {
                const year =
                  Number(row?.year);

                const value =
                  Number(row?.value);

                if (
                  Number.isFinite(year) &&
                  Number.isFinite(value)
                ) {
                  rows.push({
                    country:
                      geographicName,
                    indicator:
                      selectedIndicator,
                    year,
                    value,
                  });
                }
              }
            );
          }
        );

        setObservations(rows);

        const years = Array.from(
          new Set(
            rows.map(
              (row) => row.year
            )
          )
        ).sort(
          (a, b) => a - b
        );

        if (years.length > 0) {
          setSelectedYear(
            (current) =>
              years.includes(current)
                ? current
                : years[years.length - 1]
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load map data."
          );

          setObservations([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingData(false);
        }
      }
    }

    loadIndicatorData();

    return () => {
      cancelled = true;
    };
  }, [
    countries,
    selectedIndicator,
  ]);

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

  const indicator =
    indicators.find(
      (item) =>
        item.code ===
        selectedIndicator
    );

  /*
   * ---------------------------------------------------------
   * FILTER GEOJSON FEATURES
   * ---------------------------------------------------------
   */
  const visibleFeatures =
    useMemo(() => {
      if (!mapCollection) {
        return [];
      }

      return mapCollection.features.filter(
        (mapFeature) =>
          classifyFeature(
            mapFeature
          ) === regionLevel
      );
    }, [
      mapCollection,
      regionLevel,
    ]);

  /*
   * Fit the projection to the selected geography.
   *
   * Countries -> entire world
   * US states -> USA
   * Canadian provinces -> Canada
   * Chinese regions -> China
   * Indian states -> India
   * EU regions -> Europe
   */
  const projection =
    useMemo<GeoProjection | null>(() => {
      if (
        !mapCollection ||
        visibleFeatures.length === 0
      ) {
        return null;
      }

      const collection: MapCollection = {
        type: "FeatureCollection",
        features: visibleFeatures,
      };

      return geoNaturalEarth1().fitSize(
        [MAP_WIDTH, MAP_HEIGHT],
        collection
      );
    }, [
      mapCollection,
      visibleFeatures,
    ]);

  const pathGenerator =
    useMemo(() => {
      if (!projection) {
        return null;
      }

      return geoPath(projection);
    }, [projection]);

  const selectedYearObservations =
    useMemo(() => {
      return observations.filter(
        (observation) =>
          observation.year ===
          selectedYear
      );
    }, [
      observations,
      selectedYear,
    ]);

  const values =
    selectedYearObservations
      .map(
        (observation) =>
          observation.value
      )
      .filter(
        (value) =>
          Number.isFinite(value)
      );

  const minimum =
    values.length > 0
      ? Math.min(...values)
      : 0;

  const maximum =
    values.length > 0
      ? Math.max(...values)
      : 1;

  const valueLookup =
    useMemo(() => {
      const lookup =
        new globalThis.Map<
          string,
          number
        >();

      selectedYearObservations.forEach(
        (observation) => {
          lookup.set(
            normalizeName(
              observation.country
            ),
            observation.value
          );
        }
      );

      return lookup;
    }, [
      selectedYearObservations,
    ]);

  function getFeatureValue(
    mapFeature: MapFeature
  ) {
    const featureName =
      getFeatureName(mapFeature);

    /*
     * For country maps, match directly against
     * the feature's country name.
     */
    const direct =
      valueLookup.get(
        normalizeName(featureName)
      );

    if (direct !== undefined) {
      return direct;
    }

    /*
     * For regional maps the observation name itself
     * is what we want.
     */
    const matchingObservation =
      selectedYearObservations.find(
        (observation) =>
          countryNamesMatch(
            observation.country,
            featureName
          )
      );

    if (matchingObservation) {
      return matchingObservation.value;
    }

    return null;
  }

  const mapPathData =
    useMemo(() => {
      if (!pathGenerator) {
        return [];
      }

      return visibleFeatures
        .map((mapFeature) => {
          const name =
            getFeatureName(
              mapFeature
            );

          const path =
            pathGenerator(
              mapFeature
            ) ?? "";

          return {
            feature: mapFeature,
            name,
            path,
          };
        })
        .filter(
          (item) =>
            item.name &&
            item.path
        );
    }, [
      pathGenerator,
      visibleFeatures,
    ]);

  /*
   * ---------------------------------------------------------
   * MAP CONTROLS
   * ---------------------------------------------------------
   */

  function resetMap() {
    setZoom(1);

    setPan({
      x: 0,
      y: 0,
    });
  }

  function zoomIn() {
    setZoom((current) =>
      Math.min(
        3,
        current + 0.25
      )
    );
  }

  function zoomOut() {
    setZoom((current) =>
      Math.max(
        1,
        current - 0.25
      )
    );
  }

  /*
   * Reset zoom when changing geography level.
   */
  useEffect(() => {
    resetMap();
  }, [regionLevel]);

  function handlePointerDown(
    event: React.PointerEvent<HTMLDivElement>
  ) {
    if (event.button !== 0) {
      return;
    }

    setIsDragging(true);

    dragStart.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };

    event.currentTarget.setPointerCapture(
      event.pointerId
    );
  }

  function handlePointerMove(
    event: React.PointerEvent<HTMLDivElement>
  ) {
    if (!isDragging) {
      return;
    }

    const dx =
      event.clientX -
      dragStart.current.x;

    const dy =
      event.clientY -
      dragStart.current.y;

    const maxPanX =
      ((zoom - 1) *
        MAP_WIDTH) /
      2;

    const maxPanY =
      ((zoom - 1) *
        MAP_HEIGHT) /
      2;

    setPan({
      x: Math.max(
        -maxPanX,
        Math.min(
          maxPanX,
          dragStart.current.panX +
            dx
        )
      ),

      y: Math.max(
        -maxPanY,
        Math.min(
          maxPanY,
          dragStart.current.panY +
            dy
        )
      ),
    });
  }

  function handlePointerUp(
    event: React.PointerEvent<HTMLDivElement>
  ) {
    setIsDragging(false);

    if (
      event.currentTarget.hasPointerCapture(
        event.pointerId
      )
    ) {
      event.currentTarget.releasePointerCapture(
        event.pointerId
      );
    }
  }

  async function downloadMap() {
    if (!mapRef.current) {
      return;
    }

    try {
      const svg =
        mapRef.current.querySelector(
          "svg"
        );

      if (!svg) {
        return;
      }

      const serializer =
        new XMLSerializer();

      const source =
        serializer.serializeToString(
          svg
        );

      const blob =
        new Blob(
          [
            `<?xml version="1.0" encoding="UTF-8"?>${source}`,
          ],
          {
            type: "image/svg+xml",
          }
        );

      const url =
        URL.createObjectURL(blob);

      const link =
        document.createElement("a");

      link.href = url;

      link.download =
        `worlddata-${selectedIndicator}-${regionLevel}-${selectedYear}.svg`;

      document.body.appendChild(link);

      link.click();

      link.remove();

      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(
        "Could not download map",
        err
      );
    }
  }

  /*
   * ---------------------------------------------------------
   * LOADING STATE
   * ---------------------------------------------------------
   */

  if (
    loadingMetadata ||
    loadingMap
  ) {
    return (
      <section className="map-page">
        <div className="map-loading">
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
    <section className="map-page">
      <div className="map-heading">
        <div>
          <div className="map-eyebrow">
            WORLD DATA · MAP
          </div>

          <h1>
            Geographic map
          </h1>

          <p>
            Compare countries,
            states, provinces and
            regions across the world.
          </p>
        </div>
      </div>

      {error && (
        <div className="map-error">
          <strong>
            Unable to load data
          </strong>

          <span>{error}</span>
        </div>
      )}

      <div className="map-controls">
        <div className="map-control">
          <label>
            INDICATOR
          </label>

          <select
            value={selectedIndicator}
            onChange={(event) =>
              setSelectedIndicator(
                event.target.value
              )
            }
          >
            {indicators.map(
              (item) => (
                <option
                  key={item.code}
                  value={item.code}
                >
                  {item.name ??
                    item.code}
                </option>
              )
            )}
          </select>
        </div>

        <div className="map-control">
          <label>
            GEOGRAPHY
          </label>

          <select
            value={regionLevel}
            onChange={(event) =>
              setRegionLevel(
                event.target.value as RegionLevel
              )
            }
          >
            {(
              Object.keys(
                REGION_LABELS
              ) as RegionLevel[]
            ).map(
              (level) => (
                <option
                  key={level}
                  value={level}
                >
                  {
                    REGION_LABELS[
                      level
                    ]
                  }
                </option>
              )
            )}
          </select>
        </div>

        <div className="map-control">
          <label>
            YEAR
          </label>

          <select
            value={selectedYear}
            onChange={(event) =>
              setSelectedYear(
                Number(
                  event.target.value
                )
              )
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

        <div className="map-control-info">
          <label>
            AREAS WITH DATA
          </label>

          <strong>
            {
              selectedYearObservations.length
            }
          </strong>
        </div>
      </div>

      <div className="map-card">
        <div className="map-card-header">
          <div>
            <div className="map-card-eyebrow">
              {indicator?.category ??
                "INDICATOR"}
            </div>

            <h2>
              {indicator?.name ??
                selectedIndicator}
            </h2>

            <p>
              {
                REGION_LABELS[
                  regionLevel
                ]
              }
              {" · "}
              {selectedYear}

              {indicator?.unit
                ? ` · ${indicator.unit}`
                : ""}
            </p>
          </div>

          <div className="map-header-right">
            <div className="map-actions">
              <button
                className="map-action-button"
                onClick={zoomOut}
                disabled={zoom <= 1}
                title="Zoom out"
              >
                <Minus size={15} />
              </button>

              <span className="map-zoom-value">
                {Math.round(
                  zoom * 100
                )}
                %
              </span>

              <button
                className="map-action-button"
                onClick={zoomIn}
                disabled={zoom >= 3}
                title="Zoom in"
              >
                <Plus size={15} />
              </button>

              <button
                className="map-action-button"
                onClick={resetMap}
                title="Reset map"
              >
                <RotateCcw size={14} />
              </button>

              <button
                className="map-download-button"
                onClick={downloadMap}
                title="Download map"
              >
                <Download size={14} />

                <span>
                  Download
                </span>
              </button>
            </div>

            <div className="map-summary">
              <span>
                GLOBAL RANGE
              </span>

              <strong>
                {formatValue(
                  minimum
                )}
                {" — "}
                {formatValue(
                  maximum
                )}
              </strong>
            </div>
          </div>
        </div>

        <div
          className={`map-visual ${
            isDragging
              ? "is-dragging"
              : ""
          }`}
          ref={mapRef}
          onPointerDown={
            handlePointerDown
          }
          onPointerMove={
            handlePointerMove
          }
          onPointerUp={
            handlePointerUp
          }
          onPointerCancel={
            handlePointerUp
          }
        >
          {loadingData ? (
            <div className="map-loading">
              Loading map data...
            </div>
          ) : (
            <svg
              className="world-map"
              viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={`Map showing ${
                indicator?.name ??
                selectedIndicator
              } in ${selectedYear}`}
            >
              <rect
                width={MAP_WIDTH}
                height={MAP_HEIGHT}
                fill="#ffffff"
              />

              <g
                transform={`translate(${pan.x} ${pan.y}) translate(${
                  MAP_WIDTH / 2
                } ${
                  MAP_HEIGHT / 2
                }) scale(${zoom}) translate(-${
                  MAP_WIDTH / 2
                } -${
                  MAP_HEIGHT / 2
                })`}
              >
                {mapPathData.map(
                  ({
                    feature,
                    name,
                    path,
                  }) => {
                    const value =
                      getFeatureValue(
                        feature
                      );

                    const isHovered =
                      hoveredFeature ===
                      name;

                    return (
                      <path
                        key={`${regionLevel}-${name}`}
                        d={path}
                        fill={getColor(
                          value,
                          minimum,
                          maximum
                        )}
                        stroke={
                          isHovered
                            ? "#111827"
                            : "#ffffff"
                        }
                        strokeWidth={
                          isHovered
                            ? 1.5
                            : regionLevel ===
                              "countries"
                            ? 0.55
                            : 0.8
                        }
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                        className={
                          value === null
                            ? "map-country no-data"
                            : "map-country"
                        }
                        onMouseEnter={() =>
                          setHoveredFeature(
                            name
                          )
                        }
                        onMouseLeave={() =>
                          setHoveredFeature(
                            null
                          )
                        }
                      />
                    );
                  }
                )}
              </g>
            </svg>
          )}

          {hoveredFeature && (
            <div className="map-tooltip">
              <strong>
                {hoveredFeature}
              </strong>

              <span>
                {formatValue(
                  (() => {
                    const observation =
                      selectedYearObservations.find(
                        (item) =>
                          countryNamesMatch(
                            item.country,
                            hoveredFeature
                          )
                      );

                    return (
                      observation?.value ??
                      null
                    );
                  })()
                )}
              </span>
            </div>
          )}

          {!loadingData && (
            <div className="map-hint">
              Drag to move · + / − to zoom
            </div>
          )}
        </div>

        <div className="map-footer">
          <div className="map-legend">
            <span className="map-legend-label">
              LOW
            </span>

            <div className="map-legend-scale">
              {COLORS.map(
                (color) => (
                  <span
                    key={color}
                    style={{
                      backgroundColor:
                        color,
                    }}
                  />
                )
              )}
            </div>

            <span className="map-legend-label">
              HIGH
            </span>
          </div>

          <div className="map-legend-values">
            <span>
              {formatValue(
                minimum
              )}
            </span>

            <span>
              {formatValue(
                maximum
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="map-country-summary">
        <div>
          <span>
            GEOGRAPHY
          </span>

          <strong>
            {
              REGION_LABELS[
                regionLevel
              ]
            }
          </strong>
        </div>

        <div>
          <span>
            INDICATOR
          </span>

          <strong>
            {indicator?.name ??
              selectedIndicator}
          </strong>
        </div>

        <div>
          <span>
            YEAR
          </span>

          <strong>
            {selectedYear}
          </strong>
        </div>

        <div>
          <span>
            AREAS
          </span>

          <strong>
            {
              visibleFeatures.length
            }
          </strong>
        </div>

        <div>
          <span>
            OBSERVATIONS
          </span>

          <strong>
            {
              selectedYearObservations.length
            }
          </strong>
        </div>
      </div>
    </section>
  );
}

export default Map;