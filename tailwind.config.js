/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#4f46e5',
        success: '#10b981',
        danger: '#f43f5e',
      }
    },
  },
  plugins: [],
}
