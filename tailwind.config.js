/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Atkinson Hyperlegible Next", "Atkinson Hyperlegible", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        ink: "#1d252c",
        paper: "#fbfaf7",
        pine: "#245247",
        coral: "#db6b53",
        skyglass: "#d8edf2",
        brass: "#d6a74d"
      }
    }
  },
  plugins: []
};
