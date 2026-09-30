import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    globals: false,
    restoreMocks: true,
    testTimeout: 15_000,
    hookTimeout: 30_000
  }
});
