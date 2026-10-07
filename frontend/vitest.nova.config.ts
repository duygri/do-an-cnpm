import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["test/nova.test.ts"],
    environmentOptions: { jsdom: { url: "http://localhost:5173" } },
  },
});
