# Read Dostoevsky

A quiet GitHub Pages library for four essential works by Fyodor Dostoevsky, built with Vite and TypeScript. Books are loaded on demand and reading progress is kept locally in the browser.

The public-domain source PDFs live in `books/`. Reader-ready Markdown editions sit beside them; run `python3 scripts/extract_books.py` (with `pypdf` installed) to regenerate the extracted novels. `notes-from-the-underground.md` is hand-cleaned and intentionally not overwritten by the script.

## Synchronized audio

*Notes from the Underground* includes a synchronized public-domain LibriVox recording read by Bob Neufeld. The compact MP4 audio is stored in `public/audio/`; sentence timings are derived from the matching caption track with `scripts/build_audio_timeline.py`. The interface keeps playback secondary to the text: the current sentence receives a fine moving underline, clicking a sentence seeks to it, and hovering the spoken sentence temporarily pauses playback.

The recording is sourced from [LibriVox](https://librivox.org/notes-from-the-underground-version-2-by-fyodor-dostoyevsky), whose recordings are public domain in the United States. Do not add recordings from third-party video platforms unless their redistribution license is explicit and documented.

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
