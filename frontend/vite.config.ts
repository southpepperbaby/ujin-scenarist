import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Адрес бэкенда для dev-прокси: по умолчанию локальный FastAPI, иначе VITE_BACKEND=http://host:port.
export default defineConfig(({ mode }) => {
  const backend = loadEnv(...) || "http://localhost:8000"
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        "/api": backend,
        "/ws": { target: backend.replace(/^http/, "ws"), ws: true },
      },
    },
  };
});
