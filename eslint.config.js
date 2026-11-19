// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

/**
 * Hard Rule checks (MYCLAUDE.md). They apply to every file that ships in the extension.
 * Each entry is covered by packages/extension/test/hard-rules-lint.test.ts, so a rule can't
 * silently stop firing. An exception needs an eslint-disable line with a written reason.
 */
const NETWORK_GLOBALS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "importScripts",
].map((name) => ({ name, message: `Hard Rule 6: no network. '${name}' is banned.` }));

const HARD_RULE_SYNTAX = [
  // Rule 1: never clicks, submits or navigates for the person.
  {
    selector: "CallExpression[callee.property.name=/^(click|submit|requestSubmit)$/]",
    message: "Hard Rule 1: never click or submit for the person.",
  },
  {
    selector:
      "NewExpression[callee.name=/^(Mouse|Pointer|Keyboard|Input|Touch|Wheel|Drag|Focus)Event$/]",
    message: "Hard Rule 1: no synthetic mouse, keyboard or input events.",
  },
  {
    selector: "CallExpression[callee.property.name='dispatchEvent']",
    message: "Hard Rule 1: dispatching events on page elements is banned.",
  },
  {
    selector: "CallExpression[callee.object.name='window'][callee.property.name='open']",
    message: "Hard Rule 1: no programmatic navigation.",
  },
  {
    selector:
      "CallExpression[callee.object.name='location'][callee.property.name=/^(assign|replace|reload)$/]",
    message: "Hard Rule 1: no programmatic navigation.",
  },
  {
    selector:
      "CallExpression[callee.object.property.name='location'][callee.property.name=/^(assign|replace|reload)$/]",
    message: "Hard Rule 1: no programmatic navigation.",
  },
  {
    selector: "AssignmentExpression > Identifier.left[name='location']",
    message: "Hard Rule 1: no programmatic navigation.",
  },
  {
    selector: "AssignmentExpression > MemberExpression.left[property.name=/^(location|href)$/]",
    message: "Hard Rule 1: no programmatic navigation.",
  },
  {
    selector: "CallExpression[callee.property.name=/^(pushState|replaceState)$/]",
    message: "Hard Rule 1: no programmatic navigation.",
  },
  {
    selector:
      "CallExpression[callee.object.property.name='tabs'][callee.property.name=/^(update|create)$/]",
    message: "Hard Rule 1: no programmatic navigation of tabs.",
  },
  // Rule 6: no network.
  {
    selector:
      "MemberExpression[property.name=/^(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)$/]",
    message: "Hard Rule 6: no network.",
  },
  // Rule 7: never read what the person types.
  {
    selector: "MemberExpression[property.name='value']",
    message: "Hard Rule 7: never read .value. If this is not a page input, disable with a reason.",
  },
  {
    selector: "MemberExpression[computed=true][property.value='value']",
    message: "Hard Rule 7: never read .value.",
  },
  {
    selector: "ObjectPattern > Property[key.name='value']",
    message: "Hard Rule 7: never destructure value.",
  },
  {
    selector: "CallExpression[callee.property.name='getAttribute'][arguments.0.value='value']",
    message: "Hard Rule 7: never read the value attribute.",
  },
  {
    selector: "NewExpression[callee.name='FormData']",
    message: "Hard Rule 7: FormData reads typed values.",
  },
];

/** The matcher is pure: DOM comes in as a parameter. No globals, no extension APIs. */
const MATCHER_GLOBALS = [
  ...NETWORK_GLOBALS,
  ...["window", "document", "localStorage", "sessionStorage", "indexedDB"].map((name) => ({
    name,
    message: `matcher is pure: '${name}' is banned. Take the DOM root as a parameter.`,
  })),
  ...["chrome", "browser"].map((name) => ({
    name,
    message: "matcher is pure: no extension APIs.",
  })),
];

/**
 * no-restricted-globals only reports names ESLint knows are globals, so the banned ones are
 * declared here. TypeScript still does the real type checking.
 */
const BANNED_AS_GLOBALS = Object.fromEntries(
  [
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "EventSource",
    "importScripts",
    "open",
    "window",
    "document",
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "chrome",
    "browser",
  ].map((name) => [name, "readonly"]),
);

const SHIPPED = ["packages/*/src/**/*.ts", "packages/extension/entrypoints/**/*.ts"];

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
    files: SHIPPED,
    languageOptions: { globals: BANNED_AS_GLOBALS },
    rules: {
      "no-restricted-globals": [
        "error",
        ...NETWORK_GLOBALS,
        { name: "open", message: "Hard Rule 1: no programmatic navigation." },
      ],
      "no-restricted-syntax": ["error", ...HARD_RULE_SYNTAX],
    },
  },
  {
    files: ["packages/matcher/src/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...MATCHER_GLOBALS,
        { name: "open", message: "Hard Rule 1: no programmatic navigation." },
      ],
    },
  },
  prettier,
);
