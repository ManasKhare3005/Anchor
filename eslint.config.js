// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.output/**",
      "**/.wxt/**",
      "fixtures/**",
      "**/test-results/**",
      "**/playwright-report/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // The matcher must stay pure: no browser globals, no extension APIs.
    files: ["packages/matcher/src/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "window", message: "matcher is pure: no DOM access" },
        { name: "document", message: "matcher is pure: no DOM access" },
        { name: "chrome", message: "matcher is pure: no extension APIs" },
        { name: "browser", message: "matcher is pure: no extension APIs" },
        { name: "localStorage", message: "matcher is pure: no storage" },
        { name: "fetch", message: "matcher is pure: no network" },
      ],
    },
  },
  prettier,
);
