import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextVitals,
  {
    ignores: ["node_modules/**", ".next/**", "dist/**"],
  },
  {
    rules: {
      "import/no-anonymous-default-export": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react/no-unescaped-entities": "off",
    },
  },
];

export default config;
