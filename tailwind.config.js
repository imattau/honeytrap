/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b0d10',
        panel: '#11151b',
        line: '#1b222c',
        glow: '#6dd6ff',
        accent: '#e9eef5'
      },
      fontFamily: {
        display: ['"Sora"', 'sans-serif'],
        body: ['"Manrope"', 'sans-serif']
      }
    }
  },
  plugins: []
};
