module.exports = {
  content: [
    require('node:path').join(__dirname, 'src/**/*.{ts,tsx}'),
    require('node:path').join(__dirname, 'index.html'),
  ],
  theme: {
    extend: {
      colors: {
        sol: Object.fromEntries(
          [
            'bg',
            'bg-alt',
            'bg-highlight',
            'border',
            'text',
            'text-muted',
            'text-secondary',
            'text-dim',
            'green',
            'red',
            'yellow',
            'blue',
            'cyan',
          ].map((name) => [name, `var(--sol-${name})`]),
        ),
        ...Object.fromEntries(
          [
            'background',
            'foreground',
            'primary',
            'secondary',
            'muted',
            'accent',
            'destructive',
            'border',
            'input',
            'ring',
          ].map((name) => [
            name,
            { DEFAULT: `hsl(var(--${name}))`, foreground: `hsl(var(--${name}-foreground))` },
          ]),
        ),
      },
    },
  },
  plugins: [],
};
