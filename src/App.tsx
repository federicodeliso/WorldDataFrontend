import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import {
  BarChart3,
  Calculator,
  Database,
  FileBarChart,
  Globe2,
  Layers3,
  Map as MapIcon,
  Menu,
  ScatterChart,
  Search,
  Sigma,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import Trends from "./pages/Trends";
import Ranking from "./pages/Ranking";
import Composition from "./pages/Composition";
import Map from "./pages/Map";

import DescriptiveStatistics from "./pages/DescriptiveStatistics";
import Correlation from "./pages/Correlation";
import CorrelationOverTime from "./pages/CorrelationOverTime";

import Regression from "./pages/Regression";
import TimeSeries from "./pages/TimeSeries";
import Forecasting from "./pages/Forecasting";
import PanelData from "./pages/PanelData";

import SalaryTax from "./pages/SalaryTax";

import "./App.css";

const API = "http://127.0.0.1:8000";

// Temporary password — change this later.
const SITE_PASSWORD = "W7mQ2xL9pR4k";

/* =========================================================
   TYPES
   ========================================================= */

type Stats = {
  entities: number;
  indicators: number;
  observations: number;
  min_year: number;
  max_year: number;
};

type Indicator = {
  indicator_id: number;
  code: string;
  name: string;
  description: string | null;
  unit: string | null;
  frequency: string | null;
  category: string | null;
};

type Category = {
  category: string;
  indicator_count: number;
};

type NavItem = {
  label: string;
  icon: LucideIcon;
};

/* =========================================================
   NAVIGATION
   ========================================================= */

const exploreItems: NavItem[] = [
  {
    label: "Overview",
    icon: Globe2,
  },
  {
    label: "Trends",
    icon: TrendingUp,
  },
  {
    label: "Rankings",
    icon: BarChart3,
  },
  {
    label: "Composition",
    icon: Layers3,
  },
  {
    label: "World Map",
    icon: MapIcon,
  },
];

const statisticsItems: NavItem[] = [
  {
    label: "Descriptive Statistics",
    icon: FileBarChart,
  },
  {
    label: "Correlation",
    icon: ScatterChart,
  },
  {
    label: "Correlation Over Time",
    icon: TrendingUp,
  },
];

const econometricsItems: NavItem[] = [
  { label: "Regression", icon: Sigma },
  { label: "Time Series", icon: TrendingUp },
  { label: "Forecasting", icon: TrendingUp },
  { label: "Panel Data", icon: Database },
];

/* =========================================================
   APP
   ========================================================= */

function App() {
  const [authenticated, setAuthenticated] =
    useState<boolean>(() => {
      return (
        sessionStorage.getItem(
          "worlddata_authenticated"
        ) === "true"
      );
    });

  const [password, setPassword] =
    useState<string>("");

  const [passwordError, setPasswordError] =
    useState<string>("");

  const [stats, setStats] =
    useState<Stats | null>(null);

  const [indicators, setIndicators] =
    useState<Indicator[]>([]);

  const [categories, setCategories] =
    useState<Category[]>([]);

  const [activePage, setActivePage] =
    useState<string>("Overview");

  const [search, setSearch] =
    useState<string>("");

  const [sidebarOpen, setSidebarOpen] =
    useState<boolean>(false);

  const [loading, setLoading] =
    useState<boolean>(true);

  const [error, setError] =
    useState<string>("");

  /* =======================================================
     LOGIN
     ======================================================= */

  function handleLogin(event: FormEvent) {
    event.preventDefault();

    if (password === SITE_PASSWORD) {
      sessionStorage.setItem(
        "worlddata_authenticated",
        "true"
      );

      setAuthenticated(true);
      setPassword("");
      setPasswordError("");
    } else {
      setPasswordError(
        "Incorrect password."
      );
      setPassword("");
    }
  }

  /* =======================================================
     LOAD DATABASE INFORMATION
     ======================================================= */

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);
        setError("");

        const [
          statsResponse,
          indicatorsResponse,
          categoriesResponse,
        ] = await Promise.all([
          fetch(`${API}/stats`),
          fetch(
            `${API}/indicators?limit=500`
          ),
          fetch(`${API}/categories`),
        ]);

        if (!statsResponse.ok) {
          throw new Error(
            "Could not load database statistics."
          );
        }

        if (!indicatorsResponse.ok) {
          throw new Error(
            "Could not load indicators."
          );
        }

        if (!categoriesResponse.ok) {
          throw new Error(
            "Could not load categories."
          );
        }

        const statsData =
          (await statsResponse.json()) as Stats;

        const indicatorsData =
          (await indicatorsResponse.json()) as Indicator[];

        const categoriesData =
          (await categoriesResponse.json()) as Category[];

        setStats(statsData);
        setIndicators(indicatorsData);
        setCategories(categoriesData);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong while loading WorldData."
        );
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  /* =======================================================
     NAVIGATION
     ======================================================= */

  function navigate(page: string) {
    setActivePage(page);
    setSidebarOpen(false);
  }

  function renderNavItem(item: NavItem) {
    const Icon = item.icon;

    return (
      <button
        key={item.label}
        type="button"
        className={`nav-item ${
          activePage === item.label
            ? "active"
            : ""
        }`}
        onClick={() =>
          navigate(item.label)
        }
      >
        <Icon
          size={17}
          strokeWidth={1.8}
        />

        <span>{item.label}</span>
      </button>
    );
  }

  /* =======================================================
     FILTER INDICATORS
     ======================================================= */

  const filteredIndicators =
    indicators
      .filter((indicator) => {
        const query =
          search.trim().toLowerCase();

        if (!query) {
          return true;
        }

        return (
          indicator.code
            .toLowerCase()
            .includes(query) ||
          indicator.name
            .toLowerCase()
            .includes(query) ||
          (
            indicator.category ?? ""
          )
            .toLowerCase()
            .includes(query)
        );
      })
      .slice(0, 12);

  /* =======================================================
     LOGIN SCREEN
     ======================================================= */

  if (!authenticated) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          padding: "24px",
          fontFamily: "inherit",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "380px",
            padding: "32px",
            border: "1px solid #e2e8f0",
            borderRadius: "10px",
            background: "#ffffff",
            boxShadow:
              "0 10px 30px rgba(15, 23, 42, 0.06)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "28px",
            }}
          >
            <div
              style={{
                width: "38px",
                height: "38px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "8px",
                background: "#0f172a",
                color: "#ffffff",
                fontSize: "18px",
                fontWeight: 700,
              }}
            >
              W
            </div>

            <div>
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "#111827",
                }}
              >
                WorldData
              </div>

              <div
                style={{
                  marginTop: "2px",
                  fontSize: "11px",
                  color: "#64748b",
                }}
              >
                Economic Data Platform
              </div>
            </div>
          </div>

          <div
            style={{
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                marginBottom: "6px",
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#64748b",
              }}
            >
              PRIVATE ACCESS
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: "24px",
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: "#111827",
              }}
            >
              Welcome to WorldData
            </h1>

            <p
              style={{
                margin: "8px 0 0",
                fontSize: "13px",
                lineHeight: 1.5,
                color: "#64748b",
              }}
            >
              Enter the password to access
              the platform.
            </p>
          </div>

          <form onSubmit={handleLogin}>
            <label
              style={{
                display: "block",
                marginBottom: "7px",
                fontSize: "11px",
                fontWeight: 600,
                color: "#475569",
              }}
            >
              PASSWORD
            </label>

            <input
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value
                )
              }
              autoFocus
              placeholder="Enter password"
              style={{
                width: "100%",
                height: "42px",
                boxSizing: "border-box",
                padding: "0 12px",
                border:
                  "1px solid #dfe4ea",
                borderRadius: "7px",
                background: "#ffffff",
                color: "#111827",
                fontFamily: "inherit",
                fontSize: "13px",
                outline: "none",
              }}
            />

            {passwordError && (
              <div
                style={{
                  marginTop: "8px",
                  fontSize: "12px",
                  color: "#b91c1c",
                }}
              >
                {passwordError}
              </div>
            )}

            <button
              type="submit"
              style={{
                width: "100%",
                height: "42px",
                marginTop: "14px",
                border: "none",
                borderRadius: "7px",
                background: "#0f172a",
                color: "#ffffff",
                fontFamily: "inherit",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Enter WorldData
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* =======================================================
     MAIN APPLICATION
     ======================================================= */

  return (
    <div className="app">
      {/* =================================================
          SIDEBAR
      ================================================= */}

      <aside
        className={`sidebar ${
          sidebarOpen ? "open" : ""
        }`}
      >
        <div className="brand">
          <div className="brand-title">
            WorldData
          </div>

          <div className="brand-subtitle">
            Economic Data Platform
          </div>
        </div>

        <nav className="nav">
          {/* EXPLORE */}

          <div className="nav-section">
            <div className="nav-label">
              Explore
            </div>

            {exploreItems.map(
              renderNavItem
            )}
          </div>

          {/* STATISTICS */}

          <div className="nav-section">
            <div className="nav-label">
              Statistics
            </div>

            {statisticsItems.map(
              renderNavItem
            )}
          </div>

          {/* ECONOMETRICS */}

          <div className="nav-section">
            <div className="nav-label">
              Econometrics
            </div>

            {econometricsItems.map(
              renderNavItem
            )}
          </div>

          {/* TOOLS */}

          <div className="nav-section">
            <div className="nav-label">
              Tools
            </div>

            {renderNavItem({
              label: "Salary & Tax",
              icon: Calculator,
            })}

            {renderNavItem({
              label: "Growth Calculator",
              icon: TrendingUp,
            })}
          </div>

          {/* DATABASE */}

          <div className="nav-section">
            <div className="nav-label">
              Database
            </div>

            {renderNavItem({
              label: "Indicators",
              icon: Database,
            })}

            {renderNavItem({
              label: "Countries",
              icon: Globe2,
            })}
          </div>
        </nav>

        <div className="sidebar-footer">
          WorldData
        </div>
      </aside>

      {/* =================================================
          MOBILE OVERLAY
      ================================================= */}

      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-overlay"
          onClick={() =>
            setSidebarOpen(false)
          }
          aria-label="Close navigation"
        />
      )}

      {/* =================================================
          MAIN
      ================================================= */}

      <main className="main">
        {/* TOPBAR */}

        <header className="topbar">
          <button
            type="button"
            className="mobile-menu-button"
            onClick={() =>
              setSidebarOpen(true)
            }
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>

          <div className="breadcrumb">
            <span>WorldData</span>

            <span>/</span>

            <span className="breadcrumb-current">
              {activePage}
            </span>
          </div>
        </header>

        {/* PAGE CONTENT */}

        <div className="page">
          {/* LOADING */}

          {loading && (
            <div className="loading">
              Loading WorldData...
            </div>
          )}

          {/* ERROR */}

          {!loading && error && (
            <div className="error">
              {error}
            </div>
          )}

          {/* =================================================
              OVERVIEW
          ================================================= */}

          {!loading &&
            !error &&
            activePage === "Overview" && (
              <>
                <div className="page-header">
                  <div>
                    <h1 className="page-title">
                      WorldData
                    </h1>

                    <p className="page-description">
                      Explore economic,
                      demographic and
                      fiscal data across
                      countries and over
                      time.
                    </p>
                  </div>
                </div>

                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-label">
                      Entities
                    </div>

                    <div className="stat-value">
                      {formatNumber(
                        stats?.entities ?? 0
                      )}
                    </div>

                    <div className="stat-subtitle">
                      Countries and
                      entities
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-label">
                      Indicators
                    </div>

                    <div className="stat-value">
                      {formatNumber(
                        stats?.indicators ?? 0
                      )}
                    </div>

                    <div className="stat-subtitle">
                      Economic and
                      social measures
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-label">
                      Observations
                    </div>

                    <div className="stat-value">
                      {formatLargeNumber(
                        stats?.observations ?? 0
                      )}
                    </div>

                    <div className="stat-subtitle">
                      Historical data
                      points
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-label">
                      Coverage
                    </div>

                    <div className="stat-value">
                      {stats?.max_year ??
                        "—"}
                    </div>

                    <div className="stat-subtitle">
                      From{" "}
                      {stats?.min_year ??
                        "—"}
                    </div>
                  </div>
                </div>

                <section className="section">
                  <div className="section-header">
                    <div>
                      <h2 className="section-title">
                        Browse indicators
                      </h2>

                      <p className="section-description">
                        Search the WorldData
                        indicator database.
                      </p>
                    </div>

                    <div
                      className="search-box"
                      style={{
                        width: "300px",
                      }}
                    >
                      <Search />

                      <input
                        value={search}
                        onChange={(event) =>
                          setSearch(
                            event.target
                              .value
                          )
                        }
                        placeholder="Search indicators..."
                      />
                    </div>
                  </div>

                  <div className="indicator-list">
                    {filteredIndicators.map(
                      (indicator) => (
                        <div
                          className="indicator-card"
                          key={
                            indicator.indicator_id
                          }
                        >
                          <div className="indicator-code">
                            {indicator.code}
                          </div>

                          <div className="indicator-name">
                            {indicator.name}
                          </div>

                          <div className="indicator-meta">
                            {indicator.category && (
                              <span>
                                {
                                  indicator.category
                                }
                              </span>
                            )}

                            {indicator.unit && (
                              <span>
                                {
                                  indicator.unit
                                }
                              </span>
                            )}

                            {indicator.frequency && (
                              <span>
                                {
                                  indicator.frequency
                                }
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </section>

                <section className="section">
                  <div className="section-header">
                    <div>
                      <h2 className="section-title">
                        Categories
                      </h2>
                    </div>
                  </div>

                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>
                            Category
                          </th>

                          <th>
                            Indicators
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {categories.map(
                          (category) => (
                            <tr
                              key={
                                category.category
                              }
                            >
                              <td>
                                {
                                  category.category
                                }
                              </td>

                              <td>
                                {
                                  category.indicator_count
                                }
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}

          {/* =================================================
              EXPLORE
          ================================================= */}

          {!loading &&
            !error &&
            activePage === "Trends" && (
              <Trends />
            )}

          {!loading &&
            !error &&
            activePage === "Rankings" && (
              <Ranking />
            )}

          {!loading &&
            !error &&
            activePage ===
              "Composition" && (
              <Composition />
            )}

          {!loading &&
            !error &&
            activePage ===
              "World Map" && <Map />}

          {/* =================================================
              STATISTICS
          ================================================= */}

          {!loading &&
            !error &&
            activePage ===
              "Descriptive Statistics" && (
              <DescriptiveStatistics />
            )}

          {!loading &&
            !error &&
            activePage ===
              "Correlation" && (
              <Correlation />
            )}

          {!loading &&
            !error &&
            activePage ===
              "Correlation Over Time" && (
              <CorrelationOverTime />
            )}

          {/* =================================================
              ECONOMETRICS
          ================================================= */}

          {!loading &&
            !error &&
            activePage ===
              "Regression" && (
              <Regression />
            )}


          {!loading && 
            !error && 
            activePage === "Time Series" && ( 
              <TimeSeries /> 
            )}

          {!loading && 
            !error && 
            activePage === "Forecasting" && (
              <Forecasting />
          )}

          {!loading &&
            !error &&
            activePage === "Panel Data" && (
              <PanelData />
          )}

          {/* =================================================
              TOOLS
          ================================================= */}

          {!loading &&
            !error &&
            activePage ===
              "Salary & Tax" && (
              <SalaryTax />
            )}

          {/* Growth Calculator is intentionally
              not rendered yet because the page
              does not exist. */}

        </div>
      </main>
    </div>
  );
}

/* =========================================================
   HELPERS
   ========================================================= */

function formatNumber(
  value: number
): string {
  return new Intl.NumberFormat(
    "en-US"
  ).format(value);
}

function formatLargeNumber(
  value: number
): string {
  if (value >= 1_000_000) {
    return `${(
      value / 1_000_000
    ).toFixed(1)}M`;
  }

  if (value >= 1_000) {
    return `${(
      value / 1_000
    ).toFixed(1)}K`;
  }

  return formatNumber(value);
}

export default App;