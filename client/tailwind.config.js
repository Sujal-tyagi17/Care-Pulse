/** @type {import('tailwindcss').Config} */
const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Clinical Teal tokens (see src/index.css)
        background: c('bg'),
        fg: c('fg'),
        muted: c('muted'),
        subtle: c('subtle'),
        line: c('line'),
        'line-strong': c('line-strong'),
        'primary-hover': c('primary-hover'),
        'primary-soft': c('primary-soft'),
        'on-primary-soft': c('on-primary-soft'),
        success: { DEFAULT: c('success'), soft: c('success-soft') },
        warning: { DEFAULT: c('warning'), soft: c('warning-soft') },
        danger: { DEFAULT: c('danger'), soft: c('danger-soft') },
        info: { DEFAULT: c('info'), soft: c('info-soft') },

        // Names used across the existing screens, mapped onto the new palette
        'on-background': c('fg'),
        surface: c('surface'),
        'surface-dim': c('surface-container'),
        'surface-bright': c('surface'),
        'surface-container-lowest': c('surface-lowest'),
        'surface-container-low': c('surface-low'),
        'surface-container': c('surface-container'),
        'surface-container-high': c('surface-high'),
        'surface-container-highest': c('surface-highest'),
        'surface-variant': c('surface-high'),
        'on-surface': c('fg'),
        'on-surface-variant': c('muted'),
        outline: c('outline'),
        'outline-variant': c('line'),
        primary: c('primary'),
        'primary-container': c('primary-soft'),
        'on-primary': c('on-primary'),
        'on-primary-container': c('on-primary-soft'),
        // Secondary used to be a purple "AI" accent; it now stays in the teal family (one accent color).
        secondary: c('primary'),
        'secondary-container': c('primary-soft'),
        'on-secondary': c('on-primary'),
        'on-secondary-container': c('on-primary-soft'),
        // Tertiary was used for completed / verified states, so it maps to success green.
        tertiary: c('success'),
        'tertiary-container': c('success-soft'),
        'on-tertiary': c('on-primary'),
        'on-tertiary-container': c('success'),
        error: c('danger'),
        'error-container': c('danger-soft')
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        heading: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      fontSize: {
        // Small text bumped from 12px to 13px for readability; body is 14px.
        xs: ['0.8125rem', { lineHeight: '1.25rem' }]
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
        // Neon glows from the old theme are neutralised rather than hunted down one by one.
        'neon-cyan': 'none',
        'neon-ai': 'none',
        glass: 'var(--shadow-card)'
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem'
      }
    }
  },
  plugins: []
};
