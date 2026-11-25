import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  base: "/sm2027/",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        stresstest: resolve(__dirname, "stresstest.html"),
        besiktning: resolve(__dirname, "besiktning/index.html"),
      },
    },
  },
});
