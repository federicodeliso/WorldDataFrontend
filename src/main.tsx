import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { smartFetch, loadLocalDatabaseFile, hasLocalDb } from "./services/dataAdapter";

// Intercept global fetch so App.tsx doesn't need to change at all!
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();
  if (url.includes("127.0.0.1:8000")) {
    return smartFetch(url, init);
  }
  return fetch(input, init);
};

// Register Service Worker for PWA offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('Service Worker registered with scope:', reg.scope))
      .catch((err) => console.error('Service Worker registration failed:', err));
  });
}

function Root() {
  const [dbLoaded, setDbLoaded] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  
  // Detect if we are running on mobile/production (where Python backend isn't present)
  const isMobileApp = window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1";

  if (isMobileApp && !dbLoaded && !hasLocalDb()) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", padding: "24px", fontFamily: "sans-serif" }}>
        <div style={{ width: "100%", maxWidth: "400px", padding: "32px", border: "1px solid #e2e8f0", borderRadius: "10px", background: "#fff", textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.05)" }}>
          <h2 style={{ fontSize: "20px", marginBottom: "8px", color: "#111" }}>Load WorldData Database</h2>
          <p style={{ fontSize: "13px", color: "#666", marginBottom: "20px" }}>
            Select your 1.6 GB <code>worlddata.db</code> file from your phone storage to run the app offline.
          </p>
          <input 
            type="file" 
            accept=".db,.sqlite" 
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setLoadingText("Loading 1.6 GB database into memory (please wait)...");
              await loadLocalDatabaseFile(file);
              setDbLoaded(true);
            }} 
            style={{ marginBottom: "15px" }}
          />
          <p style={{ fontSize: "12px", color: "#333", fontWeight: 500 }}>{loadingText}</p>
        </div>
      </div>
    );
  }

  return (
    <StrictMode>
      <App />
    </StrictMode>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);