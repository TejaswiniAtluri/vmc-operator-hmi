import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: "https://vmc-operator-hmi-u45x.onrender.com",
        changeOrigin: true,
      },
      "/stage": {
        target: "https://vmc-operator-hmi-u45x.onrender.com",
        changeOrigin: true,
      },
      "/operation": {
        target: "https://vmc-operator-hmi-u45x.onrender.com",
        changeOrigin: true,
      },
    },
      allowedHosts: ["vmc-operator-hmi-u45x.onrender.com"],
      
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
  },
});
