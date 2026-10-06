import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/*
 * Architectural boundary (see README): UI → src/client → /api/v1 → DataSource.
 * Pages, features, UI and the client never import server code or data files;
 * only the API route handlers (src/app/api) reach src/server.
 */
const serverAndData = {
  group: ["@/server", "@/server/*", "**/server/*", "**/data/*", "*.json"],
  message:
    "La interfaz no accede a src/server ni a data/: usa el cliente tipado (src/client) contra /api/v1.",
};

/** The server side never depends on screens or on the browser client. */
const uiFromServer = {
  group: ["@/ui", "@/ui/*", "@/features/*", "@/client", "@/client/*", "@/app/*"],
  message: "src/server sólo implementa el contrato; no importa interfaz ni cliente.",
};

const eslintConfig = [
  { ignores: [".next/**", "next-env.d.ts", "playwright-report/**", "test-results/**"] },
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    ignores: ["src/app/api/**", "src/server/**", "tests/api/**", "tests/data/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [serverAndData] }],
    },
  },
  {
    files: ["src/server/**/*.{ts,tsx}", "tests/data/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [uiFromServer] }],
    },
  },
];

export default eslintConfig;
