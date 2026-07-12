# Read Dostoevsky

A quiet GitHub Pages library for four essential works by Fyodor Dostoevsky, built with Vite and TypeScript. Books are loaded on demand and reading progress is kept locally in the browser.

The public-domain source PDFs live in `books/`. Reader-ready Markdown editions sit beside them; run `python3 scripts/extract_books.py` (with `pypdf` installed) to regenerate the extracted novels. `notes-from-the-underground.md` is hand-cleaned and intentionally not overwritten by the script.

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
