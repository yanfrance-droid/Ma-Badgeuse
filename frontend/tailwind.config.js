/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#0D2B52',
          primary: '#1E40AF',
          light: '#F0F9FF'
        }
      }
    },
  },
  plugins: [],
}
