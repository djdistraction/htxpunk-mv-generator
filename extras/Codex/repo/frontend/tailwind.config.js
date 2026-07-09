/** @type {import("tailwindcss").Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        voodoo: {
          black: "#0a0a0a",
          dark: "#111111",
          purple: "#7c3aed",
          pink: "#ec4899",
          gold: "#f59e0b"
        }
      }
    }
  },
  plugins: []
}
