/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
      colors: {
        canvas: "#080B12",
        panel: "#0E1420",
        line: "#202B3B",
        accent: "#8B7CFF",
      },
      boxShadow: {
        glow: "0 0 35px rgba(139,124,255,.14)",
      },
    },
  },
  plugins: [],
};
