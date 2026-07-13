# Audio provenance

## Notes from the Underground

- Recording: *Notes From The Underground (version 2)*
- Reader: Bob Neufeld
- Translator: Constance Garnett
- Catalog: https://librivox.org/notes-from-the-underground-version-2-by-fyodor-dostoyevsky
- Archive item: https://archive.org/details/notesfromunderground_bn_librivox
- YouTube reference used to identify the matching recording: https://www.youtube.com/watch?v=8a8xw4YO6AA
- Status: LibriVox public-domain recording in the United States

`underground.mp4` concatenates the six LibriVox source sections and transcodes them to mono Opus at 20 kbit/s in an MP4 container. No audio or video owned by the YouTube channel is redistributed.

`underground.timeline.json` contains sentence indices and timing facts only. It is generated from the matching English automatic-caption track:

```sh
yt-dlp --skip-download --write-auto-subs --sub-langs en-orig --sub-format vtt \
  -o '/tmp/underground.%(ext)s' 'https://www.youtube.com/watch?v=8a8xw4YO6AA'
python3 scripts/build_audio_timeline.py \
  /tmp/underground.en-orig.vtt public/audio/underground.timeline.json
```
