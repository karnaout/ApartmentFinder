import next from "eslint-config-next";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...next,
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "node_modules/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@next/next/no-img-element": "off",
    },
  },
];

export default config;
