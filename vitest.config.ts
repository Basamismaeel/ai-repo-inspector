import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only run the TypeScript sources. Without this, `npm run build` leaves
    // compiled copies in dist/test and every test runs a second time.
    include: ["test/**/*.test.ts"],
  },
});
