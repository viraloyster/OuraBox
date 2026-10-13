// Lint: only rules that catch real mistakes TypeScript lets through (a
// promise nobody waits for or whose error is lost, an `await` on something
// that isn't a promise, an expression that does nothing…). No style rules:
// the code keeps its own style.
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "src-tauri/**", "node_modules/**", "playwright-report/**", "test-results/**"] },
  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      // The browser preview of the core (storage.ts) answers with `async`
      // functions that don't wait for anything, to behave like the real core.
      "@typescript-eslint/require-await": "off",
      // `{ empty: _, ...rest }` is how a field is left out of a copy.
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true, varsIgnorePattern: "^_", argsIgnorePattern: "^_" }],
    },
  },
);
