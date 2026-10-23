import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Browser calls /api/* on the Vite host; Vite forwards to the Node API
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8091",
        changeOrigin: true,
      },
    },
  },
});
