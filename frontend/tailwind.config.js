/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0F2A3D', soft: '#2C4457', muted: '#5B7083', faint: '#8499AA' },
        brand: {
          50: '#EAF6F7', 100: '#D3EDEF', 200: '#A8DBDF', 300: '#78C5CB', 400: '#43AAB2',
          500: '#1B8F97', 600: '#0F7880', 700: '#0B6068', 800: '#094B52', 900: '#073A40',
        },
        surface: { DEFAULT: '#F4F8FA', raised: '#FFFFFF', sunken: '#EBF1F5' },
        line: { DEFAULT: '#DCE6EC', strong: '#C3D2DC' },
        ok: { DEFAULT: '#2E8B6B', soft: '#E6F4EE' },
        warn: { DEFAULT: '#A8650F', soft: '#FDF3E1' },
        danger: { DEFAULT: '#B83A2E', soft: '#FCEBE9' },
        info: { DEFAULT: '#2B6CB0', soft: '#E8F1FA' },
        lime: { DEFAULT: '#D4FF3A', soft: '#EEFFB0', deep: '#A9D400' },
        night: { DEFAULT: '#05070A', 2: '#0A0F14', 3: '#111922', line: 'rgba(255,255,255,0.08)' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,42,61,0.05), 0 1px 3px rgba(15,42,61,0.04)',
        pop: '0 8px 24px rgba(15,42,61,0.10)',
      },
      borderRadius: { xl2: '14px' },
    },
  },
  plugins: [],
};
