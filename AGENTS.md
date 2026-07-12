# Repository Guidelines

## Project Structure & Module Organization

This repository is a static Dostoevsky reader built with Vite and TypeScript. Application logic lives in `src/main.ts`; it loads Markdown editions on demand, renders navigation and reading blocks, and remembers progress. Global presentation is in `src/style.css`, while `src/vite-env.d.ts` supplies Vite types. Reading material and source PDFs belong in `books/`; `scripts/extract_books.py` regenerates the extracted Markdown. `index.html` is the Vite entry point, and `.github/workflows/deploy.yml` builds and deploys `dist/` to GitHub Pages.

## Build, Test, and Development Commands

- `npm ci` installs the exact dependency versions from `package-lock.json`; use this in clean environments.
- `npm run dev` starts Vite on all interfaces for local development.
- `npm run build` runs strict TypeScript checking, then creates the production bundle in `dist/`.
- `npm run preview` serves the production bundle locally for a final browser check.

There is no separate automated test suite or lint command. Treat `npm run build` as the minimum required validation.

## Coding Style & Naming Conventions

Match the existing TypeScript style: two-space indentation, single quotes, no semicolons, trailing commas in multiline structures, and small focused functions. Use `camelCase` for functions and variables, `PascalCase` for types, and descriptive union variants such as `title`, `heading`, and `paragraph`. Keep CSS selectors in kebab-case (for example, `.chapter-heading`) and reuse custom properties from `:root`. Preserve strict typing and escape text before inserting it into HTML.

## Testing Guidelines

For every change, run `npm run build`. For layout or content changes, also run `npm run dev` or `npm run preview` and inspect chapter links, responsive widths, light/dark themes, and paragraph layout at multiple viewport sizes. If automated tests are introduced, place them near the related source or under `src/__tests__/` and name them `*.test.ts`.

## Commit & Pull Request Guidelines

Recent history uses short, imperative, sentence-case subjects such as `Refine single-page reading experience` and `Document GitHub Pages setup`. Keep each commit focused and avoid mixing content, styling, and infrastructure changes unnecessarily. Pull requests should summarize the user-visible result, list validation performed, and link relevant issues. Include before/after screenshots for visual changes and call out additions or replacements in `books/`, especially large PDFs.
