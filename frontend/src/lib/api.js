import axios from "axios";

export function getBaseUrl() {
  let custom = localStorage.getItem("hera_server_url");
  if (custom && custom.trim()) {
    const trimmed = custom.trim().replace(/\/+$/, "");
    if (trimmed === "https://hera-gestionale-backend.onrender.com") {
      localStorage.removeItem("hera_server_url");
    } else {
      return trimmed;
    }
  }
  if (process.env.REACT_APP_BACKEND_URL && process.env.REACT_APP_BACKEND_URL.trim()) {
    return process.env.REACT_APP_BACKEND_URL.trim().replace(/\/+$/, "");
  }
  if (typeof window !== "undefined" && window.location?.hostname) {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host.startsWith("192.168.") || host.startsWith("10.")) {
      return `http://${host}:8001`;
    }
  }
  return "https://hera-gestionale-backend.onrender.com";
}

export function setBaseUrl(url) {
  if (url && url.trim()) {
    localStorage.setItem("hera_server_url", url.trim().replace(/\/+$/, ""));
  } else {
    localStorage.removeItem("hera_server_url");
  }
}

const api = axios.create();

api.interceptors.request.use((config) => {
  const base = getBaseUrl();
  config.baseURL = `${base}/api`;
  const token = localStorage.getItem("hera_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Bypass localtunnel (loca.lt) interstitial page
  if (base.includes("loca.lt") || base.includes("localtunnel")) {
    config.headers["bypass-tunnel-reminder"] = "true";
  }
  // Bypass ngrok interstitial page
  if (base.includes("ngrok")) {
    config.headers["ngrok-skip-browser-warning"] = "true";
  }
  // Cloudflare tunnels (trycloudflare.com) have no interstitial — no header needed
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && localStorage.getItem("hera_token")) {
      localStorage.removeItem("hera_token");
      if (window.location.pathname !== "/login") window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export function apiError(detail) {
  if (detail == null) return "Si è verificato un errore. Riprova.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => e?.msg || JSON.stringify(e)).join(" ");
  if (detail?.msg) return detail.msg;
  return String(detail);
}

export default api;
