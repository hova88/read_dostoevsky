# Read Dostoevsky

A quiet GitHub Pages library for four essential works by Fyodor Dostoevsky, built with Vite and TypeScript. Books are loaded on demand and reading progress is kept locally in the browser.

The public-domain source PDFs live in `books/`. Reader-ready Markdown editions sit beside them; run `python3 scripts/extract_books.py` (with `pypdf` installed) to regenerate the extracted novels. `notes-from-the-underground.md` is hand-cleaned and intentionally not overwritten by the script.

## Synchronized audio

*Notes from the Underground*, *Crime and Punishment*, and *The Brothers Karamazov* include synchronized public-domain LibriVox recordings. Compact MP4 audio is stored in `public/audio/`; sentence timings live beside it as JSON timing facts. The interface keeps playback secondary to the text: the current sentence receives a fine moving underline, clicking a sentence seeks to it, and hovering the spoken sentence temporarily pauses playback. Long recordings are split by chapter so seeking does not require downloading an entire novel.

The Underground timeline is derived from a matching caption track with `scripts/build_audio_timeline.py`. The two novels are reproducibly built from their LibriVox ZIP downloads with local Whisper word timestamps aligned against the exact Garnett text in `books/`:

```sh
python3 -m pip install -r requirements-align.txt
python3 scripts/build_librivox_audio.py crime downloads/crime_and_punishment_0902_librivox.zip
python3 scripts/build_librivox_audio.py brothers downloads/brothers_karamazov_1002_librivox.zip
```

The script caches unpublished transcripts in the ignored `downloads/.audio-alignment/` directory. Published timeline files contain only sentence indices, track numbers, timestamps, and match scores.

The recordings are sourced from LibriVox, whose recordings are public domain in the United States. Full catalog and archive provenance is documented in `public/audio/SOURCE.md`. Do not add recordings from third-party video platforms unless their redistribution license is explicit and documented.

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
