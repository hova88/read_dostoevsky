"""Validate generated LibriVox tracks and sentence timelines."""

import json
import subprocess
from pathlib import Path

from build_librivox_audio import BOOKS, markdown_chapters


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"


def media_duration(path: Path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(json.loads(result.stdout)["format"]["duration"])


def validate(book: str):
    data = json.loads((PUBLIC / "audio" / f"{book}.timeline.json").read_text(encoding="utf-8"))
    tracks = data["tracks"]
    sentences = data["sentences"]
    expected_sentences = sum(len(chapter) for chapter in markdown_chapters(BOOKS[book]))

    assert len(tracks) == BOOKS[book].expected_tracks
    assert len(sentences) == expected_sentences
    assert [item["i"] for item in sentences] == list(range(expected_sentences))
    assert {item["track"] for item in sentences} == set(range(len(tracks)))

    largest = 0
    longest_weak_run = 0
    for track_index, track in enumerate(tracks):
        path = PUBLIC / track["file"].removeprefix("./")
        assert path.is_file(), path
        largest = max(largest, path.stat().st_size)
        assert path.stat().st_size < 100 * 1024 * 1024, path
        actual_duration = media_duration(path)
        assert abs(actual_duration - track["duration"]) < 1, path

        timings = [item for item in sentences if item["track"] == track_index]
        assert timings
        assert all(0 <= item["start"] <= item["end"] <= track["duration"] for item in timings)
        assert all(left["start"] <= right["start"] for left, right in zip(timings, timings[1:]))
        weak_run = 0
        for timing in timings:
            weak_run = weak_run + 1 if timing["score"] < 0.25 else 0
            longest_weak_run = max(longest_weak_run, weak_run)

    assert longest_weak_run <= 10

    strong = sum(item["score"] >= 0.75 for item in sentences)
    print(
        f"{book}: {len(tracks)} tracks, {len(sentences)} sentences, "
        f"{strong / len(sentences):.1%} strong matches, longest weak run {longest_weak_run}, "
        f"largest file {largest / 1024 / 1024:.1f} MiB"
    )


if __name__ == "__main__":
    validate("crime")
    validate("brothers")
