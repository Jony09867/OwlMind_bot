/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#f54d1c',
          50: '#fef3ee',
          100: '#fde2d4',
          200: '#fbc5a9',
          300: '#f89e76',
          400: '#f5734a',
          500: '#f54d1c',
          600: '#e03d0f',
          700: '#b9300b',
          800: '#93280c',
          900: '#78250e',
        },
        neutralt: {
          DEFAULT: '#c8c8c8',
          100: '#f5f5f5',
          200: '#e8e8e8',
          300: '#d8d8d8',
          400: '#c8c8c8',
          500: '#a8a8a8',
          600: '#888888',
          700: '#6a6a6a',
          800: '#4a4a4a',
          900: '#2a2a2a',
        },
        ink: '#1A1A1A',
        tahoe: {
          50: '#2a2a2e',
          100: '#262629',
          200: '#222225',
          300: '#1f1f22',
          400: '#1c1c1e',
          500: '#18181a',
          600: '#141416',
          700: '#101012',
          800: '#0c0c0e',
          900: '#08080a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.12)',
        'glass-sm': '0 4px 16px 0 rgba(0, 0, 0, 0.08)',
        'glass-lg': '0 16px 48px 0 rgba(0, 0, 0, 0.16)',
        glow: '0 0 24px rgba(245, 77, 28, 0.35)',
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
        shimmer: 'shimmer 2.5s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 24px rgba(245, 77, 28, 0.35)' },
          '50%': { boxShadow: '0 0 40px rgba(245, 77, 28, 0.6)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
