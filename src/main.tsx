
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import {
  smartFetch,
  isNativeMobile,
} from "./services/dataAdapter";

// Save the original fetch before installing the interceptor.
const originalFetch = window.fetch.bind(window);

// Route dashboard API requests through the local SQLite adapter on Android.
window.fetch = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  const isLocalDevelopmentApi =
    url.includes("127.0.0.1:8000");

  const isDashboardEndpoint =
    /\/(stats|indicators|categories)(?:\?|$)/.test(url);

  const isApiEndpoint =
    url.includes("/api");

  const isWorldDataApi =
    url.includes("worlddataapi-kf6d.onrender.com");

  if (
    isNativeMobile() &&
    (
      isLocalDevelopmentApi ||
      isDashboardEndpoint ||
      isApiEndpoint ||
      isWorldDataApi
    )
  ) {
    return smartFetch(url, init);
  }

  // Preserve the existing local development behavior.
  if (isLocalDevelopmentApi) {
    return smartFetch(url, init);
  }

  // All other requests use the original network fetch.
  return originalFetch(input, init);
};

// Register the service worker for PWA offline support.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log(
          "Service Worker registered with scope:",
          registration.scope
        );
      })
      .catch((error) => {
        console.error(
          "Service Worker registration failed:",
          error
        );
      });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
