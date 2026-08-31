import { useEffect, useMemo, useRef, useState } from "react";
import { feature } from "topojson-client";
import type {
  Feature,
  FeatureCollection,
  Geometry,
} from "geojson";
import type { Topology } from "topojson-specification";
import {
  geoNaturalEarth1,
  geoPath,
  type GeoProjection,
} from "d3-geo";
import {
  Download,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import countriesTopology from "world-atlas/countries-110m.json";
import "./Map.css";

const API = "https://worlddataapi-kf6d.onrender.com";

type MapLevel =
  | "grouped"
  | "standard"
  | "states"
  | "regions";

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

type MapProperties = {
  name?: string;
  NAME?: string;
  NAME_1?: string;
  NAME_2?: string;
  shapeName?: string;
  shapeISO?: string;
  shapeID?: string;
  id?: string;
  NUTS_ID?: string;
  NUTS_NAME?: string;
  na?: string;
  [key: string]: unknown;
};

type MapFeature = Feature<
  Geometry,
  MapProperties
>;

type MapFeatureCollection =
  FeatureCollection<
    Geometry,
    MapProperties
  >;

type RegionSource = {
  name: string;
  iso3: string;
  url: string;
};

const topology =
  countriesTopology as unknown as Topology;

const countryCollection =
  feature(
    topology,
    topology.objects.countries
  ) as unknown as MapFeatureCollection;

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

/*
 * geoBoundaries ADM1 sources.
 *
 * ADM1 gives the first administrative level:
 * USA -> states
 * CAN -> provinces/territories
 * CHN -> provinces/autonomous regions/municipalities
 * IND -> states/union territories
 *
 * geoBoundaries provides programmatic access to ADM1
 * GeoJSON layers.
 */
const STATE_SOURCES: RegionSource[] = [
  {
    name: "United States",
    iso3: "USA",
    url:
      "https://www.geoboundaries.org/api/current/gbOpen/USA/ADM1/",
  },
  {
    name: "Canada",
    iso3: "CAN",
    url:
      "https://www.geoboundaries.org/api/current/gbOpen/CAN/ADM1/",
  },
  {
    name: "China",
    iso3: "CHN",
    url:
      "https://www.geoboundaries.org/api/current/gbOpen/CHN/ADM1/",
  },
  {
    name: "India",
    iso3: "IND",
    url:
      "https://www.geoboundaries.org/api/current/gbOpen/IND/ADM1/",
  },
];

/*
 * Eurostat NUTS 2024, WGS84, 20M scale, NUTS2.
 *
 * NUTS2 is a good default for a WorldData-style map:
 * detailed enough to be useful without becoming extremely
 * heavy like NUTS3.
 */
const EU_REGIONS_URL =
  "https://raw.githubusercontent.com/eurostat/Nuts2json/master/pub/v2/2024/4326/20M/nutsrg_2.json";

/*
 * Country aliases.
 */
const COUNTRY_ALIASES: Record<
  string,
  string[]
> = {
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

function normalizeName(
  value: string
) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /&/g,
      "and"
    )
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .trim();
}

function countryNamesMatch(
  apiName: string,
  mapName: string
) {
  const api =
    normalizeName(apiName);

  const map =
    normalizeName(mapName);

  if (api === map) {
    return true;
  }

  const aliases =
    COUNTRY_ALIASES[api];

  if (
    aliases?.some(
      (alias) =>
        normalizeName(alias) ===
        map
    )
  ) {
    return true;
  }

  const reverseAliases =
    COUNTRY_ALIASES[map];

  if (
    reverseAliases?.some(
      (alias) =>
        normalizeName(alias) ===
        api
    )
  ) {
    return true;
  }

  return false;
}

function getFeatureName(
  mapFeature: MapFeature
) {
  const properties =
    mapFeature.properties ?? {};

  return (
    properties.name ??
    properties.NAME ??
    properties.shapeName ??
    properties.NUTS_NAME ??
    properties.na ??
    ""
  );
}

function getFeatureCode(
  mapFeature: MapFeature
) {
  const properties =
    mapFeature.properties ?? {};

  return (
    properties.NUTS_ID ??
    properties.shapeISO ??
    properties.shapeID ??
    properties.id ??
    ""
  );
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
      Math.floor(
        COLORS.length / 2
      )
    ];
  }

  const ratio =
    (value - minimum) /
    (maximum - minimum);

  const index =
    Math.max(
      0,
      Math.min(
        COLORS.length - 1,
        Math.floor(
          ratio *
            COLORS.length
        )
      )
    );

  return COLORS[index];
}

function getGeoJsonUrlFromBoundaryResponse(
  json: any
): string | null {
  if (!json) {
    return null;
  }

  if (
    typeof json ===
    "object"
  ) {
    if (
      typeof json.simplifiedGeometryGeoJSON ===
      "string"
    ) {
      return json.simplifiedGeometryGeoJSON;
    }

    if (
      typeof json.gjDownloadURL ===
      "string"
    ) {
      return json.gjDownloadURL;
    }

    if (
      typeof json.geojson ===
      "string"
    ) {
      return json.geojson;
    }
  }

  if (
    Array.isArray(json) &&
    json.length > 0
  ) {
    return (
      getGeoJsonUrlFromBoundaryResponse(
        json[0]
      )
    );
  }

  return null;
}

function getRegionNameFromObservation(
  value: string
) {
  return normalizeName(value);
}

function Map() {
  const [
    countries,
    setCountries,
  ] =
    useState<Country[]>([]);

  const [
    indicators,
    setIndicators,
  ] =
    useState<Indicator[]>([]);

  const [
    observations,
    setObservations,
  ] =
    useState<Observation[]>([]);

  const [
    selectedIndicator,
    setSelectedIndicator,
  ] =
    useState("");

  const [
    selectedYear,
    setSelectedYear,
  ] =
    useState(2024);

  const [
    mapLevel,
    setMapLevel,
  ] =
    useState<MapLevel>(
      "standard"
    );

  const [
    hoveredArea,
    setHoveredArea,
  ] =
    useState<string | null>(
      null
    );

  const [
    loadingMetadata,
    setLoadingMetadata,
  ] =
    useState(true);

  const [
    loadingData,
    setLoadingData,
  ] =
    useState(false);

  const [
    loadingGeometry,
    setLoadingGeometry,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    zoom,
    setZoom,
  ] =
    useState(1);

  const [
    pan,
    setPan,
  ] =
    useState({
      x: 0,
      y: 0,
    });

  const [
    isDragging,
    setIsDragging,
  ] =
    useState(false);

  const [
    subnationalFeatures,
    setSubnationalFeatures,
  ] =
    useState<
      MapFeature[]
    >([]);

  const dragStart =
    useRef({
      x: 0,
      y: 0,
      panX: 0,
      panY: 0,
    });

  const mapRef =
    useRef<HTMLDivElement>(
      null
    );

  /*
   * ---------------------------------------------------------
   * PROJECTION
   * ---------------------------------------------------------
   *
   * We continue using Natural Earth for the global country
   * map. Subnational layers use the same longitude/latitude
   * coordinate system and therefore can be projected by the
   * same d3 projection.
   */
  const projection =
    useMemo<GeoProjection>(() => {
      return geoNaturalEarth1().fitSize(
        [
          MAP_WIDTH,
          MAP_HEIGHT,
        ],
        countryCollection
      );
    }, []);

  const pathGenerator =
    useMemo(() => {
      return geoPath(
        projection
      );
    }, [projection]);

  /*
   * ---------------------------------------------------------
   * LOAD METADATA
   * ---------------------------------------------------------
   */
  useEffect(() => {
    let cancelled = false;

    async function loadMetadata() {
      try {
        setLoadingMetadata(
          true
        );

        setError("");

        const [
          countriesResponse,
          indicatorsResponse,
        ] =
          await Promise.all([
            fetch(
              `${API}/countries?limit=500`
            ),
            fetch(
              `${API}/indicators?limit=500`
            ),
          ]);

        if (
          !countriesResponse.ok
        ) {
          throw new Error(
            "Could not load countries."
          );
        }

        if (
          !indicatorsResponse.ok
        ) {
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

        const countryRows:
          Country[] =
          Array.isArray(
            countriesJson
          )
            ? countriesJson
            : countriesJson?.results ??
              countriesJson?.data ??
              [];

        const indicatorRows:
          Indicator[] =
          Array.isArray(
            indicatorsJson
          )
            ? indicatorsJson
            : indicatorsJson?.results ??
              indicatorsJson?.data ??
              [];

        setCountries(
          countryRows
        );

        setIndicators(
          indicatorRows
        );

        if (
          indicatorRows.length >
          0
        ) {
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
          setLoadingMetadata(
            false
          );
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
   * LOAD GEOMETRY
   * ---------------------------------------------------------
   */
  useEffect(() => {
    let cancelled = false;

    async function loadGeometry() {
      /*
       * Standard / grouped uses world countries.
       */
      if (
        mapLevel ===
          "standard" ||
        mapLevel ===
          "grouped"
      ) {
        setSubnationalFeatures(
          []
        );

        setLoadingGeometry(
          false
        );

        return;
      }

      try {
        setLoadingGeometry(
          true
        );

        setError("");

        /*
         * STATES
         *
         * Load the four requested ADM1 countries.
         */
        if (
          mapLevel ===
          "states"
        ) {
          const results =
            await Promise.all(
              STATE_SOURCES.map(
                async (
                  source
                ) => {
                  try {
                    const metadataResponse =
                      await fetch(
                        source.url
                      );

                    if (
                      !metadataResponse.ok
                    ) {
                      return [];
                    }

                    const metadata =
                      await metadataResponse.json();

                    const geoJsonUrl =
                      getGeoJsonUrlFromBoundaryResponse(
                        metadata
                      );

                    if (
                      !geoJsonUrl
                    ) {
                      return [];
                    }

                    const geoResponse =
                      await fetch(
                        geoJsonUrl
                      );

                    if (
                      !geoResponse.ok
                    ) {
                      return [];
                    }

                    const geoJson =
                      (await geoResponse.json()) as MapFeatureCollection;

                    return Array.isArray(
                      geoJson.features
                    )
                      ? geoJson.features
                      : [];
                  } catch {
                    return [];
                  }
                }
              )
            );

          if (
            cancelled
          ) {
            return;
          }

          setSubnationalFeatures(
            results.flat()
          );

          return;
        }

        /*
         * REGIONS
         *
         * NUTS2 covers European regions.
         */
        if (
          mapLevel ===
          "regions"
        ) {
          const response =
            await fetch(
              EU_REGIONS_URL
            );

          if (
            !response.ok
          ) {
            throw new Error(
              "Could not load European regional boundaries."
            );
          }

          const json =
            (await response.json()) as MapFeatureCollection;

          if (
            cancelled
          ) {
            return;
          }

          setSubnationalFeatures(
            Array.isArray(
              json.features
            )
              ? json.features
              : []
          );
        }
      } catch (err) {
        if (!cancelled) {
          setSubnationalFeatures(
            []
          );

          setError(
            err instanceof Error
              ? err.message
              : "Could not load regional boundaries."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingGeometry(
            false
          );
        }
      }
    }

    loadGeometry();

    return () => {
      cancelled = true;
    };
  }, [mapLevel]);

  /*
   * ---------------------------------------------------------
   * LOAD INDICATOR DATA
   * ---------------------------------------------------------
   */
  useEffect(() => {
    if (
      !selectedIndicator
    ) {
      setObservations([]);
      return;
    }

    let cancelled = false;

    async function loadIndicatorData() {
      try {
        setLoadingData(
          true
        );

        setError("");

        /*
         * ---------------------------------------------------
         * COUNTRY LEVEL
         * ---------------------------------------------------
         */
        if (
          mapLevel ===
            "standard" ||
          mapLevel ===
            "grouped"
        ) {
          const countryNames =
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
              countryNames.map(
                async (
                  country
                ) => {
                  try {
                    const response =
                      await fetch(
                        `${API}/data/${encodeURIComponent(
                          country
                        )}/${encodeURIComponent(
                          selectedIndicator
                        )}`
                      );

                    if (
                      !response.ok
                    ) {
                      return [];
                    }

                    const json =
                      await response.json();

                    return Array.isArray(
                      json
                    )
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

          if (
            cancelled
          ) {
            return;
          }

          const rows:
            Observation[] =
            [];

          countryNames.forEach(
            (
              country,
              index
            ) => {
              const result =
                responses[index];

              if (
                !Array.isArray(
                  result
                )
              ) {
                return;
              }

              result.forEach(
                (row: any) => {
                  const year =
                    Number(
                      row?.year
                    );

                  const value =
                    Number(
                      row?.value
                    );

                  if (
                    Number.isFinite(
                      year
                    ) &&
                    Number.isFinite(
                      value
                    )
                  ) {
                    rows.push({
                      country,
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

          setObservations(
            rows
          );

          const years =
            Array.from(
              new Set(
                rows.map(
                  (row) =>
                    row.year
                )
              )
            ).sort(
              (a, b) =>
                a - b
            );

          if (
            years.length >
            0
          ) {
            setSelectedYear(
              (current) =>
                years.includes(
                  current
                )
                  ? current
                  : years[
                      years.length -
                        1
                    ]
            );
          }

          return;
        }

        /*
         * ---------------------------------------------------
         * SUBNATIONAL LEVEL
         * ---------------------------------------------------
         *
         * We use the geometry names as the entities to query.
         *
         * This assumes your API stores the subnational
         * observations using the same or approximately the
         * same names.
         */
        const areaNames =
          Array.from(
            new Set(
              subnationalFeatures
                .map(
                  (
                    mapFeature
                  ) =>
                    getFeatureName(
                      mapFeature
                    )
                )
                .filter(Boolean)
            )
          );

        if (
          areaNames.length ===
          0
        ) {
          setObservations(
            []
          );
          return;
        }

        const responses =
          await Promise.all(
            areaNames.map(
              async (
                area
              ) => {
                try {
                  const response =
                    await fetch(
                      `${API}/data/${encodeURIComponent(
                        area
                      )}/${encodeURIComponent(
                        selectedIndicator
                      )}`
                    );

                  if (
                    !response.ok
                  ) {
                    return [];
                  }

                  const json =
                    await response.json();

                  return Array.isArray(
                    json
                  )
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

        if (
          cancelled
        ) {
          return;
        }

        const rows:
          Observation[] =
          [];

        areaNames.forEach(
          (
            area,
            index
          ) => {
            const result =
              responses[index];

            if (
              !Array.isArray(
                result
              )
            ) {
              return;
            }

            result.forEach(
              (row: any) => {
                const year =
                  Number(
                    row?.year
                  );

                const value =
                  Number(
                    row?.value
                  );

                if (
                  Number.isFinite(
                    year
                  ) &&
                  Number.isFinite(
                    value
                  )
                ) {
                  rows.push({
                    country: area,
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

        setObservations(
          rows
        );

        const years =
          Array.from(
            new Set(
              rows.map(
                (row) =>
                  row.year
              )
            )
          ).sort(
            (a, b) =>
              a - b
          );

        if (
          years.length >
          0
        ) {
          setSelectedYear(
            (current) =>
              years.includes(
                current
              )
                ? current
                : years[
                    years.length -
                      1
                  ]
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load map data."
          );

          setObservations(
            []
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingData(
            false
          );
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
    mapLevel,
    subnationalFeatures,
  ]);

  /*
   * ---------------------------------------------------------
   * AVAILABLE YEARS
   * ---------------------------------------------------------
   */
  const availableYears =
    useMemo(() => {
      return Array.from(
        new Set(
          observations.map(
            (
              observation
            ) =>
              observation.year
          )
        )
      ).sort(
        (a, b) =>
          a - b
      );
    }, [observations]);

  const indicator =
    indicators.find(
      (item) =>
        item.code ===
        selectedIndicator
    );

  const selectedYearObservations =
    useMemo(() => {
      return observations.filter(
        (
          observation
        ) =>
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
        (
          observation
        ) =>
          observation.value
      )
      .filter(
        (
          value
        ) =>
          Number.isFinite(
            value
          )
      );

  const minimum =
    values.length > 0
      ? Math.min(
          ...values
        )
      : 0;

  const maximum =
    values.length > 0
      ? Math.max(
          ...values
        )
      : 1;

  /*
   * ---------------------------------------------------------
   * VALUE LOOKUP
   * ---------------------------------------------------------
   */
  const areaValueMap =
    useMemo(() => {
      const lookup =
        new globalThis.Map<
          string,
          number
        >();

      selectedYearObservations.forEach(
        (
          observation
        ) => {
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

  function getAreaValue(
    areaName: string
  ) {
    const direct =
      areaValueMap.get(
        normalizeName(
          areaName
        )
      );

    if (
      direct !==
      undefined
    ) {
      return direct;
    }

    /*
     * Country aliases only matter for the world map.
     */
    if (
      mapLevel ===
        "standard" ||
      mapLevel ===
        "grouped"
    ) {
      const matchingObservation =
        selectedYearObservations.find(
          (
            observation
          ) =>
            countryNamesMatch(
              observation.country,
              areaName
            )
        );

      return (
        matchingObservation?.value ??
        null
      );
    }

    /*
     * For subnational maps we also allow a loose
     * normalized comparison.
     */
    const normalized =
      normalizeName(
        areaName
      );

    const matching =
      selectedYearObservations.find(
        (
          observation
        ) =>
          getRegionNameFromObservation(
            observation.country
          ) ===
          normalized
      );

    return (
      matching?.value ??
      null
    );
  }

  /*
   * ---------------------------------------------------------
   * COUNTRY PATHS
   * ---------------------------------------------------------
   */
  const countryPathData =
    useMemo(() => {
      return countryCollection.features
        .map(
          (
            mapFeature
          ) => {
            const name =
              getFeatureName(
                mapFeature
              );

            const path =
              pathGenerator(
                mapFeature
              ) ?? "";

            return {
              feature:
                mapFeature,
              name,
              code:
                getFeatureCode(
                  mapFeature
                ),
              path,
            };
          }
        )
        .filter(
          (
            item
          ) =>
            item.name &&
            item.path
        );
    }, [
      pathGenerator,
    ]);

  /*
   * ---------------------------------------------------------
   * SUBNATIONAL PATHS
   * ---------------------------------------------------------
   */
  const subnationalPathData =
    useMemo(() => {
      return subnationalFeatures
        .map(
          (
            mapFeature
          ) => {
            const name =
              getFeatureName(
                mapFeature
              );

            const code =
              getFeatureCode(
                mapFeature
              );

            const path =
              pathGenerator(
                mapFeature
              ) ?? "";

            return {
              feature:
                mapFeature,
              name,
              code,
              path,
            };
          }
        )
        .filter(
          (
            item
          ) =>
            item.name &&
            item.path
        );
    }, [
      subnationalFeatures,
      pathGenerator,
    ]);

  /*
   * ---------------------------------------------------------
   * MAP LABEL
   * ---------------------------------------------------------
   */
  const levelLabel =
    mapLevel ===
    "standard"
      ? "Countries"
      : mapLevel ===
        "grouped"
      ? "Grouped"
      : mapLevel ===
        "states"
      ? "States & provinces"
      : "European regions";

  /*
   * ---------------------------------------------------------
   * RESET / ZOOM
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
    setZoom(
      (current) =>
        Math.min(
          3,
          current + 0.25
        )
    );
  }

  function zoomOut() {
    setZoom(
      (current) =>
        Math.max(
          1,
          current - 0.25
        )
    );
  }

  /*
   * ---------------------------------------------------------
   * POINTER DRAG
   * ---------------------------------------------------------
   */
  function handlePointerDown(
    event: React.PointerEvent<HTMLDivElement>
  ) {
    if (
      event.button !==
      0
    ) {
      return;
    }

    setIsDragging(
      true
    );

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
    if (
      !isDragging
    ) {
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
          dragStart.current
            .panX + dx
        )
      ),

      y: Math.max(
        -maxPanY,
        Math.min(
          maxPanY,
          dragStart.current
            .panY + dy
        )
      ),
    });
  }

  function handlePointerUp(
    event: React.PointerEvent<HTMLDivElement>
  ) {
    setIsDragging(
      false
    );

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

  /*
   * ---------------------------------------------------------
   * DOWNLOAD
   * ---------------------------------------------------------
   */
  async function downloadMap() {
    if (
      !mapRef.current
    ) {
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
            type:
              "image/svg+xml",
          }
        );

      const url =
        URL.createObjectURL(
          blob
        );

      const link =
        document.createElement(
          "a"
        );

      link.href = url;

      link.download =
        `worlddata-${mapLevel}-${selectedIndicator}-${selectedYear}.svg`;

      document.body.appendChild(
        link
      );

      link.click();

      link.remove();

      URL.revokeObjectURL(
        url
      );
    } catch (err) {
      console.error(
        "Could not download map",
        err
      );
    }
  }

  /*
   * ---------------------------------------------------------
   * LOADING
   * ---------------------------------------------------------
   */
  if (
    loadingMetadata
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
            World map
          </h1>

          <p>
            Compare countries,
            states and regions
            across the world.
          </p>
        </div>
      </div>

      {error && (
        <div className="map-error">
          <strong>
            Unable to load data
          </strong>

          <span>
            {error}
          </span>
        </div>
      )}

      <div className="map-controls">

        {/* INDICATOR */}
        <div className="map-control map-indicator-control">
          <label>
            INDICATOR
          </label>

          <select
            value={
              selectedIndicator
            }
            onChange={(
              event
            ) =>
              setSelectedIndicator(
                event.target.value
              )
            }
          >
            {indicators.map(
              (
                item
              ) => (
                <option
                  key={
                    item.code
                  }
                  value={
                    item.code
                  }
                >
                  {item.name ??
                    item.code}
                </option>
              )
            )}
          </select>
        </div>

        {/* YEAR */}
        <div className="map-control">
          <label>
            YEAR
          </label>

          <select
            value={
              selectedYear
            }
            onChange={(
              event
            ) =>
              setSelectedYear(
                Number(
                  event.target.value
                )
              )
            }
          >
            {availableYears.map(
              (
                year
              ) => (
                <option
                  key={
                    year
                  }
                  value={
                    year
                  }
                >
                  {year}
                </option>
              )
            )}
          </select>
        </div>

        {/* LEVEL */}
        <div className="map-control map-level-control">
          <label>
            GEOGRAPHY
          </label>

          <div className="map-level-toggle">
            <button
              type="button"
              className={
                mapLevel ===
                "grouped"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setMapLevel(
                  "grouped"
                )
              }
            >
              Grouped
            </button>

            <button
              type="button"
              className={
                mapLevel ===
                "standard"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setMapLevel(
                  "standard"
                )
              }
            >
              Standard
            </button>

            <button
              type="button"
              className={
                mapLevel ===
                "states"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setMapLevel(
                  "states"
                )
              }
            >
              States
            </button>

            <button
              type="button"
              className={
                mapLevel ===
                "regions"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setMapLevel(
                  "regions"
                )
              }
            >
              Regions
            </button>
          </div>
        </div>

        {/* DATA COUNT */}
        <div className="map-control-info">
          <label>
            {mapLevel ===
            "standard"
              ? "COUNTRIES WITH DATA"
              : "AREAS WITH DATA"}
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
              {" · "}
              {levelLabel}
            </div>

            <h2>
              {indicator?.name ??
                selectedIndicator}
            </h2>

            <p>
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
                onClick={
                  zoomOut
                }
                disabled={
                  zoom <= 1
                }
                title="Zoom out"
              >
                <Minus
                  size={15}
                />
              </button>

              <span className="map-zoom-value">
                {Math.round(
                  zoom * 100
                )}
                %
              </span>

              <button
                className="map-action-button"
                onClick={
                  zoomIn
                }
                disabled={
                  zoom >= 3
                }
                title="Zoom in"
              >
                <Plus
                  size={15}
                />
              </button>

              <button
                className="map-action-button"
                onClick={
                  resetMap
                }
                title="Reset map"
              >
                <RotateCcw
                  size={14}
                />
              </button>

              <button
                className="map-download-button"
                onClick={
                  downloadMap
                }
                title="Download map"
              >
                <Download
                  size={14}
                />

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

          {loadingData ||
          loadingGeometry ? (
            <div className="map-loading">
              Loading map...
            </div>
          ) : (
            <svg
              className="world-map"
              viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={`WorldData map showing ${
                indicator?.name ??
                selectedIndicator
              } in ${selectedYear}`}
            >

              <rect
                width={
                  MAP_WIDTH
                }
                height={
                  MAP_HEIGHT
                }
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

                {/* WORLD COUNTRY BACKGROUND */}
                {(mapLevel ===
                  "standard" ||
                  mapLevel ===
                    "grouped" ||
                  mapLevel ===
                    "states" ||
                  mapLevel ===
                    "regions") &&
                  countryPathData.map(
                    ({
                      name,
                      path,
                    }) => {
                      const showCountry =
                        mapLevel ===
                          "standard" ||
                        mapLevel ===
                          "grouped";

                      const value =
                        showCountry
                          ? getAreaValue(
                              name
                            )
                          : null;

                      return (
                        <path
                          key={`country-${name}`}
                          d={path}
                          fill={
                            showCountry
                              ? getColor(
                                  value,
                                  minimum,
                                  maximum
                                )
                              : "#f8fafc"
                          }
                          stroke="#ffffff"
                          strokeWidth={
                            showCountry
                              ? 0.55
                              : 0.35
                          }
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                          className={
                            showCountry
                              ? value ===
                                null
                                ? "map-country no-data"
                                : "map-country"
                              : "map-country-background"
                          }
                          onMouseEnter={() =>
                            showCountry &&
                            setHoveredArea(
                              name
                            )
                          }
                          onMouseLeave={() =>
                            showCountry &&
                            setHoveredArea(
                              null
                            )
                          }
                        />
                      );
                    }
                  )}

                {/* STATES / PROVINCES */}
                {mapLevel ===
                  "states" &&
                  subnationalPathData.map(
                    ({
                      name,
                      code,
                      path,
                    }) => {
                      const value =
                        getAreaValue(
                          name
                        );

                      const isHovered =
                        hoveredArea ===
                        name;

                      return (
                        <path
                          key={`state-${code}-${name}`}
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
                              : 0.7
                          }
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                          className={
                            value ===
                            null
                              ? "map-region no-data"
                              : "map-region"
                          }
                          onMouseEnter={() =>
                            setHoveredArea(
                              name
                            )
                          }
                          onMouseLeave={() =>
                            setHoveredArea(
                              null
                            )
                          }
                        />
                      );
                    }
                  )}

                {/* EUROPEAN REGIONS */}
                {mapLevel ===
                  "regions" &&
                  subnationalPathData.map(
                    ({
                      name,
                      code,
                      path,
                    }) => {
                      const value =
                        getAreaValue(
                          name
                        );

                      const isHovered =
                        hoveredArea ===
                        name;

                      return (
                        <path
                          key={`region-${code}-${name}`}
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
                              : 0.65
                          }
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                          className={
                            value ===
                            null
                              ? "map-region no-data"
                              : "map-region"
                          }
                          onMouseEnter={() =>
                            setHoveredArea(
                              name
                            )
                          }
                          onMouseLeave={() =>
                            setHoveredArea(
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

          {hoveredArea && (
            <div className="map-tooltip">
              <strong>
                {hoveredArea}
              </strong>

              <span>
                {formatValue(
                  getAreaValue(
                    hoveredArea
                  )
                )}
              </span>
            </div>
          )}

          {!loadingData &&
            !loadingGeometry && (
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
                (
                  color
                ) => (
                  <span
                    key={
                      color
                    }
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

        <div className="map-source">
          Administrative boundaries:
          geoBoundaries Database ·
          European regions:
          Eurostat NUTS
        </div>
      </div>

      <div className="map-country-summary">

        <div>
          <span>
            GEOGRAPHY
          </span>

          <strong>
            {levelLabel}
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
            {mapLevel ===
              "standard" ||
            mapLevel ===
              "grouped"
              ? countries.length
              : subnationalFeatures.length}
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