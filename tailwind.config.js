/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'crrem-navy':  '#1e3a5f',
        'crrem-green': '#2d7a4f',
        'crrem-amber': '#d97706',
      },
    },
  },
  plugins: [],
}
