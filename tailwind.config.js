/** @type {import('tailwindcss').Config} */
export default {
  content: ['./public/**/*.{html,js}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eef6ff', 100: '#d9eaff', 600: '#0b5cad', 700: '#084a8f', 800: '#0a3a6e', 900: '#0b2a4a' },
        alta: { DEFAULT: '#b3261e', bg: '#fde8e6' },
        media: { DEFAULT: '#8a4b00', bg: '#fff0c9' },
        atendido: { DEFAULT: '#075985', bg: '#dff1fb' },
        baixa: { DEFAULT: '#17612f', bg: '#def4e5' },
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
    },
  },
  plugins: [],
};
