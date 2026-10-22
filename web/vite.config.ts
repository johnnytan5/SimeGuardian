import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // PHONE_SHOW=true slides a phone mockup into the live pages, for links where nobody holds the real phone.
  // GUIDED_DEMO=true starts the guided demo on a visitor's first entry (once per browser session).
  define: {
    __PHONE_SHOW__: JSON.stringify(process.env.PHONE_SHOW === "true"),
    __GUIDED_DEMO__: JSON.stringify(process.env.GUIDED_DEMO === "true"),
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000",
      // Live phone demo engine (server/): resident/family phones and the guard console share it.
      "/live-api": { target: "http://127.0.0.1:4000", rewrite: (path) => path.replace(/^\/live-api/, "/api") },
    },
  },
});
