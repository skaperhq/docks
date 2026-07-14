import { resolve } from "node:path"
import { defineConfig } from "vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  define: {
    "process.env": JSON.stringify({ NODE_ENV: "production" }),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  resolve: {
    alias: [
      {
        find: "@tanstack/react-router",
        replacement: resolve(import.meta.dirname, "src/package-router-stub.ts"),
      },
      {
        find: "@",
        replacement: resolve(import.meta.dirname, "src"),
      },
    ],
  },
  plugins: [tailwindcss(), viteReact()],
  build: {
    outDir: "dist/ui",
    emptyOutDir: true,
    copyPublicDir: false,
    cssCodeSplit: false,
    lib: {
      entry: resolve(import.meta.dirname, "src/ui-entry.tsx"),
      formats: ["es"],
      fileName: "ui",
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) =>
          assetInfo.name?.endsWith(".css")
            ? "styles.css"
            : "assets/[name][extname]",
      },
    },
  },
})
