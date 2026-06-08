# Read Dostoevsky

A GitHub Pages reader for Fyodor Dostoevsky texts, built with Vite, TypeScript, and `@chenglou/pretext`.

The main reading surface uses Pretext's dynamic layout APIs (`prepareWithSegments`, `layoutNextLineRange`, and `materializeLineRange`) to lay out each line manually. In the default `spread` mode, line widths change as the text flows around a portrait and pull quote, similar to the Pretext dynamic-layout demo.

## Run locally

```sh
npm ci
npm run dev
```

## Build

```sh
npm run build
```

## Deploy

The repository includes a GitHub Pages workflow at `.github/workflows/deploy.yml`. Push to `main`, then enable GitHub Pages with **GitHub Actions** as the source in the repository settings.
