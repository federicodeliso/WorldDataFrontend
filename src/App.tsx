import { useEffect, useState } from "react";
import {
  BarChart3,
  Database,
  Globe2,
  Layers3,
  Map as MapIcon,
  Menu,
  ScatterChart,
  Search,
  TrendingUp,
  X,
} from "lucide-react";

import Trends from "./pages/Trends";
import Ranking from "./pages/Ranking";
import Correlation from "./pages/Correlation";
import Composition from "./pages/Composition";
import Map from "./pages/Map";

import "./App.css";

const API = "https://worlddataapi-kf6d.onrender.com";

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

const navItems = [
  { label: "Overview", icon: Globe2 },
  { label: "Trends", icon: TrendingUp },
  { label: "Rankings", icon: BarChart3 },
  { label: "Correlation", icon: ScatterChart },
  { label: "Composition", icon: Layers3 },
  { label: "World Map", icon: MapIcon },
];

function App() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activePage, setActivePage] = useState("Overview");
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
          fetch(`${API}/indicators?limit=500`),
          fetch(`${API}/categories`),
        ]);

        if (!statsResponse.ok) {
          throw new Error("Could not load database statistics.");
        }

        if (!indicatorsResponse.ok) {
          throw new Error("Could not load indicators.");
        }

        if (!categoriesResponse.ok) {
          throw new Error("Could not load categories.");
        }

        const statsData: Stats =
          await statsResponse.json();

        const indicatorsData: Indicator[] =
          await indicatorsResponse.json();

        const categoriesData: Category[] =
          await categoriesResponse.json();

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

  const filteredIndicators = indicators
    .filter((indicator) => {
      const query = search.toLowerCase();

      return (
        indicator.code.toLowerCase().includes(query) ||
        indicator.name.toLowerCase().includes(query) ||
        (indicator.category ?? "")
          .toLowerCase()
          .includes(query)
      );
    })
    .slice(0, 12);

  function navigate(page: string) {
    setActivePage(page);
    setSidebarOpen(false);
  }

  return (
    <div className="app">
      <aside
        className={`sidebar ${
          sidebarOpen ? "sidebar-open" : ""
        }`}
      >
        <div className="sidebar-top">
          <div className="brand">
            <div className="brand-mark">W</div>

            <div>
              <div className="brand-name">
                WorldData
              </div>

              <div className="brand-subtitle">
                Economic Data Platform
              </div>
            </div>
          </div>

          <button
            className="mobile-close"
            onClick={() =>
              setSidebarOpen(false)
            }
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>

        <div className="nav-section">
          <div className="nav-label">
            Explore
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.label}
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
                  size={18}
                  strokeWidth={1.8}
                />

                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="nav-section">
          <div className="nav-label">
            Database
          </div>

          <button
            className="nav-item"
            onClick={() =>
              navigate("Overview")
            }
          >
            <Database
              size={18}
              strokeWidth={1.8}
            />

            <span>Indicators</span>
          </button>

          <button
            className="nav-item"
            onClick={() =>
              navigate("Overview")
            }
          >
            <Globe2
              size={18}
              strokeWidth={1.8}
            />

            <span>Countries</span>
          </button>
        </div>

        <div className="sidebar-footer">
          <div className="api-status">
            <span className="status-dot" />

            <div>
              <strong>API online</strong>
              <small>WorldData API</small>
            </div>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          className="sidebar-overlay"
          onClick={() =>
            setSidebarOpen(false)
          }
          aria-label="Close navigation"
        />
      )}

      <main className="main">
        <header className="topbar">
          <button
            className="mobile-menu"
            onClick={() =>
              setSidebarOpen(true)
            }
            aria-label="Open navigation"
          >
            <Menu size={21} />
          </button>

          <div className="breadcrumb">
            <span>WorldData</span>
            <span>/</span>
            <strong>{activePage}</strong>
          </div>

          <div className="topbar-right">
            <span className="version">
              v1.0
            </span>
          </div>
        </header>

        <div className="page">
          {loading && (
            <div className="loading-screen">
              <div className="loading-spinner" />
              <span>
                Loading WorldData...
              </span>
            </div>
          )}

          {!loading && error && (
            <div className="error-panel">
              <strong>
                Unable to load WorldData
              </strong>

              <p>{error}</p>

              <button
                onClick={() =>
                  window.location.reload()
                }
              >
                Try again
              </button>
            </div>
          )}

          {!loading &&
            !error &&
            activePage === "Overview" && (
              <>
                <section className="page-heading">
                  <div>
                    <div className="eyebrow">
                      WORLD ECONOMIC DATABASE
                    </div>

                    <h1>
                      Explore the world
                      <br />
                      through data.
                    </h1>

                    <p>
                      Economic, demographic and
                      fiscal indicators covering
                      countries, regions and
                      subnational entities across
                      decades of historical data.
                    </p>
                  </div>

                  <div className="coverage-card">
                    <span>
                      DATA COVERAGE
                    </span>

                    <strong>
                      {stats?.min_year ?? "—"} —{" "}
                      {stats?.max_year ?? "—"}
                    </strong>

                    <small>
                      Latest available observations
                    </small>
                  </div>
                </section>

                <section className="stat-grid">
                  <StatCard
                    label="Entities"
                    value={formatNumber(
                      stats?.entities ?? 0
                    )}
                    description="Countries, regions & entities"
                  />

                  <StatCard
                    label="Indicators"
                    value={formatNumber(
                      stats?.indicators ?? 0
                    )}
                    description="Economic & social measures"
                  />

                  <StatCard
                    label="Observations"
                    value={formatLargeNumber(
                      stats?.observations ?? 0
                    )}
                    description="Historical data points"
                  />

                  <StatCard
                    label="Coverage"
                    value={`${stats?.max_year ?? "—"}`}
                    description={`From ${
                      stats?.min_year ?? "—"
                    }`}
                  />
                </section>

                <section className="section">
                  <div className="section-heading">
                    <div>
                      <div className="eyebrow">
                        DATABASE
                      </div>

                      <h2>
                        Browse indicators
                      </h2>
                    </div>

                    <div className="search-box">
                      <Search size={16} />

                      <input
                        value={search}
                        onChange={(event) =>
                          setSearch(
                            event.target.value
                          )
                        }
                        placeholder="Search indicators..."
                      />
                    </div>
                  </div>

                  <div className="indicator-grid">
                    {filteredIndicators.map(
                      (indicator) => (
                        <IndicatorCard
                          key={
                            indicator.indicator_id
                          }
                          indicator={indicator}
                        />
                      )
                    )}
                  </div>
                </section>

                <section className="section two-column">
                  <div className="panel">
                    <div className="panel-heading">
                      <div>
                        <div className="eyebrow">
                          STRUCTURE
                        </div>

                        <h2>
                          Data categories
                        </h2>
                      </div>

                      <span className="panel-count">
                        {categories.length}
                      </span>
                    </div>

                    <div className="category-list">
                      {categories
                        .slice(0, 8)
                        .map((category) => (
                          <div
                            className="category-row"
                            key={
                              category.category
                            }
                          >
                            <span>
                              {category.category}
                            </span>

                            <strong>
                              {
                                category.indicator_count
                              }
                            </strong>
                          </div>
                        ))}
                    </div>
                  </div>

                  <div className="panel dark-panel">
                    <div className="eyebrow">
                      WORLD DATA API
                    </div>

                    <h2>
                      Built for exploration.
                    </h2>

                    <p>
                      WorldData separates the
                      data layer from the
                      interface, allowing the
                      same database to power
                      charts, analysis,
                      applications and future
                      public tools.
                    </p>

                    <div className="architecture">
                      <span>React</span>
                      <i>→</i>
                      <span>FastAPI</span>
                      <i>→</i>
                      <span>PostgreSQL</span>
                    </div>
                  </div>
                </section>
              </>
            )}

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
            activePage === "Correlation" && (
              <Correlation />
            )}

          {!loading &&
            !error &&
            activePage === "Composition" && (
              <Composition />
            )}

          {!loading &&
            !error &&
            activePage === "World Map" && (
              <Map />
            )}
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="stat-card-new">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{description}</small>
    </div>
  );
}

function IndicatorCard({
  indicator,
}: {
  indicator: Indicator;
}) {
  return (
    <button className="indicator-card">
      <div className="indicator-card-top">
        <span className="indicator-category">
          {indicator.category ?? "Other"}
        </span>

        <span className="indicator-arrow">
          ↗
        </span>
      </div>

      <strong>{indicator.code}</strong>

      <p>
        {indicator.description ??
          "Economic and social indicator."}
      </p>

      <div className="indicator-meta">
        <span>
          {indicator.frequency ?? "Annual"}
        </span>

        <span>
          {indicator.unit ?? "—"}
        </span>
      </div>
    </button>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(
    "en-US"
  ).format(value);
}

function formatLargeNumber(value: number) {
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