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

The repository includes a GitHub Pages workflow at `.github/workflows/deploy.yml`.

1. Push to `main`.
2. Open the repository on GitHub.
3. Go to **Settings** -> **Pages**.
4. Set **Source** to **GitHub Actions**.
5. Re-run the **Deploy to GitHub Pages** workflow if the first deploy failed before Pages was enabled.

After Pages is enabled, the site will be published at:

```text
https://hova88.github.io/read_dostoevsky/
```
