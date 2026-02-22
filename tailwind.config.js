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
        accent: '#e9eef5',
        muted: '#94a3b8',
        'muted-dark': '#8fa4bf'
      },
      fontFamily: {
        display: ['"Sora"', 'sans-serif'],
        body: ['"Manrope"', 'sans-serif']
      },
      boxShadow: {
        'neon': '0 0 16px rgba(109, 214, 255, 0.3)',
        'neon-strong': '0 0 20px rgba(109, 214, 255, 0.45)'
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '18px',
        '3xl': '24px'
      }
    }
  },
  plugins: []
};
