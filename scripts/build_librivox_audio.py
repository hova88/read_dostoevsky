"""Build chapter audio and sentence timelines from LibriVox ZIP downloads.

The script transcribes each chapter with word timestamps, aligns those words to
the repository's Garnett text, and writes compact Opus-in-MP4 tracks plus a JSON
timeline. Transcripts are cached under ``downloads/.audio-alignment`` but are
not published; timeline files contain timing facts only.

Usage:
    python3 scripts/build_librivox_audio.py crime downloads/crime_and_punishment_0902_librivox.zip
    python3 scripts/build_librivox_audio.py brothers downloads/brothers_karamazov_1002_librivox.zip
"""

import argparse
import json
import re
import subprocess
import tempfile
import zipfile
from bisect import bisect_left
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path

from faster_whisper import WhisperModel


ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class BookConfig:
    markdown: Path
    chapter_heading: re.Pattern[str]
    audio_pattern: re.Pattern[str]
    expected_tracks: int
    source: str
    catalog: str
    archive: str


BOOKS = {
    "crime": BookConfig(
        markdown=ROOT / "books" / "crime_and_punishment.md",
        chapter_heading=re.compile(r"^### Chapter "),
        audio_pattern=re.compile(r"crime_and_punishment_(\d{2})_64kb\.mp3$"),
        expected_tracks=40,
        source="LibriVox Crime and Punishment, read by LibriVox Volunteers",
        catalog="https://librivox.org/crime-and-punishment-by-fyodor-dostoyevsky/",
        archive="https://archive.org/details/crime_and_punishment_0902_librivox",
    ),
    "brothers": BookConfig(
        markdown=ROOT / "books" / "the_brothers_karamazov.md",
        chapter_heading=re.compile(r"^(?:#### Chapter|### Chapter) "),
        audio_pattern=re.compile(r"brotherskaramazov_(\d{2})_dostoyevsky_64kb\.mp3$"),
        expected_tracks=96,
        source="LibriVox The Brothers Karamazov, read by LibriVox Volunteers",
        catalog="https://librivox.org/the-brothers-karamazov-by-fyodor-dostoyevsky/",
        archive="https://archive.org/details/brothers_karamazov_1002_librivox",
    ),
}


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("book", choices=BOOKS)
    parser.add_argument("zip", type=Path)
    parser.add_argument("--model", default="small")
    parser.add_argument("--bitrate", default="20k")
    parser.add_argument("--output-root", type=Path, default=ROOT / "public" / "audio")
    parser.add_argument("--cache-root", type=Path, default=ROOT / "downloads" / ".audio-alignment")
    parser.add_argument("--limit", type=int, help="Process only the first N tracks for a pipeline check")
    parser.add_argument("--force-audio", action="store_true")
    return parser.parse_args()


def split_sentences(value: str):
    parts = re.split(r"([.!?]+[\"'”’)]*)\s+(?=[A-Z“‘\"'])", value)
    sentences = []
    for index in range(0, len(parts), 2):
        sentence = f"{parts[index] if index < len(parts) else ''}{parts[index + 1] if index + 1 < len(parts) else ''}".strip()
        if sentence:
            sentences.append(sentence)
    return sentences


def strip_markdown(value: str):
    value = re.sub(r"\*\*(.*?)\*\*", r"\1", value)
    value = re.sub(r"\*(.*?)\*", r"\1", value)
    value = re.sub(r"_(.*?)_", r"\1", value)
    return re.sub(r"\[(.*?)\]\(.*?\)", r"\1", value).strip()


def markdown_chapters(config: BookConfig):
    chapters: list[list[str]] = []
    paragraphs: list[list[str]] = []
    paragraph: list[str] = []

    def flush():
        value = " ".join(paragraph).strip()
        if value and paragraphs and not value.lower().startswith("source:"):
            value = strip_markdown(value)
            paragraphs[-1].append(re.sub(r"\s+", " ", value))
        paragraph.clear()

    for raw in config.markdown.read_text(encoding="utf-8").replace("\r\n", "\n").splitlines():
        line = raw.strip()
        if not line:
            flush()
        elif config.chapter_heading.match(line):
            flush()
            paragraphs.append([])
        elif line.startswith("#") or re.fullmatch(r"\*By\s.+\*", line):
            flush()
        elif paragraphs:
            paragraph.append(re.sub(r"^>\s?", "", line))
    flush()

    for chapter in paragraphs:
        sentences = []
        for value in chapter:
            sentences.extend(split_sentences(value))
        chapters.append(sentences)
    return chapters


def archive_tracks(path: Path, config: BookConfig):
    with zipfile.ZipFile(path) as archive:
        tracks = []
        for name in archive.namelist():
            if "__MACOSX" in Path(name).parts or Path(name).name.startswith("._"):
                continue
            match = config.audio_pattern.search(Path(name).name)
            if match:
                tracks.append((int(match.group(1)), name))
    tracks.sort()
    if len(tracks) != config.expected_tracks:
        raise ValueError(f"Expected {config.expected_tracks} audio tracks, found {len(tracks)}")
    return [name for _, name in tracks]


def normalize(value: str):
    value = value.lower().replace("’", "'").replace("—", " ")
    return re.findall(r"[a-z]+(?:'[a-z]+)?|\d+", value)


def transcribe(path: Path, model: WhisperModel):
    segments, _ = model.transcribe(
        str(path),
        language="en",
        beam_size=5,
        word_timestamps=True,
        vad_filter=True,
    )
    words: list[tuple[str, float]] = []
    for segment in segments:
        for word in segment.words or []:
            if word.start is None:
                continue
            words.extend((token, round(word.start, 3)) for token in normalize(word.word))
    if not words:
        raise ValueError(f"Transcription produced no timed words for {path.name}")
    return words


def align(sentences: list[str], transcript: list[tuple[str, float]], track: int, sentence_offset: int, duration: float):
    transcript_tokens = [word for word, _ in transcript]
    book_tokens: list[str] = []
    ranges = []
    for sentence in sentences:
        start = len(book_tokens)
        book_tokens.extend(normalize(sentence))
        ranges.append((start, len(book_tokens)))

    matcher = SequenceMatcher(None, book_tokens, transcript_tokens, autojunk=False)
    token_map: dict[int, int] = {}
    for block in matcher.get_matching_blocks():
        for offset in range(block.size):
            token_map[block.a + offset] = block.b + offset
    known = sorted(token_map)
    if not known:
        raise ValueError(f"Track {track + 1} has no words matching the book text")

    matches = []
    last_transcript = 0
    for index, (start, end) in enumerate(ranges):
        mapped = [token_map[position] for position in range(start, end) if position in token_map]
        if mapped:
            last_transcript = mapped[0]
        else:
            insertion = bisect_left(known, start)
            before = known[max(0, insertion - 1)]
            after = known[min(len(known) - 1, insertion)]
            if after == before:
                last_transcript = token_map[before]
            else:
                ratio = (start - before) / (after - before)
                last_transcript = round(token_map[before] + ratio * (token_map[after] - token_map[before]))
        score = len(mapped) / max(1, end - start)
        matches.append({
            "i": sentence_offset + index,
            "track": track,
            "start": round(transcript[last_transcript][1], 3),
            "score": round(score, 2),
        })

    for index, match in enumerate(matches):
        next_start = matches[index + 1]["start"] if index + 1 < len(matches) else min(duration, transcript[-1][1] + 1)
        match["end"] = round(min(duration, max(match["start"] + 0.4, next_start)), 3)
    return matches


def media_duration(path: Path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return round(float(json.loads(result.stdout)["format"]["duration"]), 3)


def compress_audio(source: Path, destination: Path, bitrate: str):
    if destination.exists():
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".tmp.mp4")
    subprocess.run([
        "ffmpeg", "-v", "error", "-y", "-i", str(source), "-vn", "-map_metadata", "-1",
        "-ac", "1", "-c:a", "libopus", "-application", "voip", "-b:a", bitrate,
        "-movflags", "+faststart", str(temporary),
    ], check=True)
    temporary.replace(destination)


def chapter_groups(book: str, chapter_count: int):
    if book == "crime":
        return [[index] for index in range(chapter_count - 2)] + [[chapter_count - 2, chapter_count - 1]]
    return [[index] for index in range(chapter_count)]


def main():
    args = parse_args()
    config = BOOKS[args.book]
    chapters = markdown_chapters(config)
    groups = chapter_groups(args.book, len(chapters))
    track_names = archive_tracks(args.zip, config)
    if len(groups) != len(track_names):
        raise ValueError(f"{len(chapters)} text chapters map to {len(groups)} groups, but archive has {len(track_names)} tracks")

    limit = min(args.limit or len(track_names), len(track_names))
    model = WhisperModel(args.model, device="cuda", compute_type="float16")
    cache_dir = args.cache_root / args.book / args.model
    cache_dir.mkdir(parents=True, exist_ok=True)
    output_dir = args.output_root / args.book
    output_dir.mkdir(parents=True, exist_ok=True)
    tracks = []
    timeline = []
    sentence_offset = 0

    with zipfile.ZipFile(args.zip) as archive, tempfile.TemporaryDirectory() as temporary_dir:
        temporary_dir = Path(temporary_dir)
        for track, name in enumerate(track_names[:limit]):
            source = Path(archive.extract(name, temporary_dir))
            duration = media_duration(source)
            destination = output_dir / f"{track + 1:02}.mp4"
            if args.force_audio and destination.exists():
                destination.unlink()
            compress_audio(source, destination, args.bitrate)

            cache = cache_dir / f"{track + 1:02}.json"
            if cache.exists():
                words = [(word, float(start)) for word, start in json.loads(cache.read_text(encoding="utf-8"))]
            else:
                words = transcribe(source, model)
                cache.write_text(json.dumps(words, separators=(",", ":")), encoding="utf-8")

            sentences = [sentence for chapter in groups[track] for sentence in chapters[chapter]]
            aligned = align(sentences, words, track, sentence_offset, duration)
            timeline.extend(aligned)
            sentence_offset += len(sentences)
            tracks.append({"file": f"./audio/{args.book}/{track + 1:02}.mp4", "duration": duration})
            strong = sum(item["score"] >= 0.75 for item in aligned)
            print(f"{track + 1:02}/{limit}: {len(sentences)} sentences, {strong / len(aligned):.1%} strong matches", flush=True)

    result = {
        "source": config.source,
        "catalog": config.catalog,
        "archive": config.archive,
        "alignment_model": args.model,
        "tracks": tracks,
        "sentences": timeline,
    }
    timeline_path = args.output_root / f"{args.book}.timeline.json"
    timeline_path.write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {timeline_path} with {len(timeline)} sentence timings")


if __name__ == "__main__":
    main()
