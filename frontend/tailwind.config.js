/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        forest: {
          DEFAULT: "#315D4B",
          deep: "#184535",
          dark: "#0E2F23",
          wash: "#EAF1EC",
          light: "#E2EEE7",
          border: "#C5D8CD",
        },
        gold: {
          DEFAULT: "#D4AF37",
          light: "#F7E7A8",
          dark: "#B8860B",
          wash: "#FBF7EA",
          hover: "#C59B27",
        },
        canvas: "#F5F6F3",
        surface: {
          DEFAULT: "#FFFFFF",
          container: "#EDEEEB",
          high: "#E7E8E6",
          low: "#F3F4F1",
        },
        ink: {
          DEFAULT: "#202B28",
          light: "#3E4E45",
        },
        muted: "#65716B",
        border: "#DCE3DD",
        "critical-text": "#922D3C",
        "critical-bg": "#FAE9EB",
        "critical-border": "#F0CCD1",
        "positive-text": "#276442",
        "positive-bg": "#E8F3EB",
        "warning-text": "#875B15",
        "warning-bg": "#FFF4DD",
      },
      borderRadius: {
        panel: "10px",
        btn: "7px",
        input: "6px",
      },
      fontFamily: {
        sans: ["Manrope", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}
