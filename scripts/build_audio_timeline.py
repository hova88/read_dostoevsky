"""Align the Underground Markdown sentences with YouTube/LibriVox captions.

Usage:
    python3 scripts/build_audio_timeline.py captions.vtt public/audio/underground.timeline.json

The output contains timing facts only, not the caption transcript.
"""

import html
import json
import re
import sys
from bisect import bisect_left
from difflib import SequenceMatcher
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "books" / "notes-from-the-underground.md"
TIME = r"\d{2}:\d{2}:\d{2}\.\d{3}"


def seconds(value: str) -> float:
    match = re.fullmatch(r"(\d{2}):(\d{2}):(\d{2})\.(\d{3})", value)
    assert match
    hours, minutes, secs, millis = map(int, match.groups())
    return hours * 3600 + minutes * 60 + secs + millis / 1000


def caption_words(path: Path):
    words: list[tuple[str, float]] = []
    for block in path.read_text(encoding="utf-8").split("\n\n"):
        lines = block.splitlines()
        timing = next((line for line in lines if "-->" in line), None)
        tagged = next((line for line in reversed(lines) if "<c>" in line), None)
        if not timing or not tagged:
            continue
        cue_start = seconds(timing.split(" --> ")[0])
        tagged = html.unescape(tagged).replace("</c>", "")
        first = tagged.split("<", 1)[0].strip()
        if first:
            words.extend((word, cue_start) for word in normalize(first))
        for timestamp, text in re.findall(rf"<({TIME})><c>([^<]+)", tagged):
            words.extend((word, seconds(timestamp)) for word in normalize(text))
    return words


def markdown_sentences():
    text = SOURCE.read_text(encoding="utf-8").replace("\r\n", "\n")
    paragraphs: list[str] = []
    paragraph: list[str] = []

    def flush():
        value = " ".join(paragraph).strip()
        if value and not value.lower().startswith("source:"):
            value = re.sub(r"[*_]", "", value)
            paragraphs.append(re.sub(r"\s+", " ", value))
        paragraph.clear()

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            flush()
        elif line.startswith("#") or re.fullmatch(r"\*By\s.+\*", line):
            flush()
        else:
            paragraph.append(re.sub(r"^>\s?", "", line))
    flush()

    sentences = []
    for value in paragraphs:
        sentences.extend(re.split(r"(?<=[.!?])(?:[\"'”’)]*)\s+(?=[A-Z“‘\"'])", value))
    return [sentence.strip() for sentence in sentences if sentence.strip()]


def normalize(value: str):
    value = value.lower().replace("’", "'").replace("—", " ")
    return re.findall(r"[a-z]+(?:'[a-z]+)?|\d+", value)


def align(sentences: list[str], captions: list[tuple[str, float]]):
    caption_tokens = [word for word, _ in captions]
    book_tokens: list[str] = []
    ranges = []
    for sentence in sentences:
        start = len(book_tokens)
        book_tokens.extend(normalize(sentence))
        ranges.append((start, len(book_tokens)))

    matcher = SequenceMatcher(None, book_tokens, caption_tokens)
    token_map: dict[int, int] = {}
    for block in matcher.get_matching_blocks():
        for offset in range(block.size):
            token_map[block.a + offset] = block.b + offset
    known = sorted(token_map)

    matches = []
    last_caption = 0
    for index, (start, end) in enumerate(ranges):
        mapped = [token_map[position] for position in range(start, end) if position in token_map]
        if mapped:
            last_caption = mapped[0]
        elif known:
            insertion = bisect_left(known, start)
            before = known[max(0, insertion - 1)]
            after = known[min(len(known) - 1, insertion)]
            if after == before:
                last_caption = token_map[before]
            else:
                ratio = (start - before) / (after - before)
                last_caption = round(token_map[before] + ratio * (token_map[after] - token_map[before]))
        score = len(mapped) / max(1, end - start)
        matches.append({"i": index, "start": round(captions[last_caption][1], 3), "score": round(score, 2)})

    for index, match in enumerate(matches):
        next_start = matches[index + 1]["start"] if index + 1 < len(matches) else captions[-1][1] + 1
        match["end"] = round(max(match["start"] + 0.4, next_start), 3)
    return matches


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Expected input VTT and output JSON paths")
    sentences = markdown_sentences()
    captions = caption_words(Path(sys.argv[1]))
    timeline = align(sentences, captions)
    result = {
        "source": "LibriVox Notes from the Underground (version 2), read by Bob Neufeld",
        "youtube": "8a8xw4YO6AA",
        "sentences": timeline,
    }
    Path(sys.argv[2]).write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
    strong = sum(item["score"] >= 0.75 for item in timeline)
    print(f"{len(sentences)} sentences, {len(captions)} caption words, {strong / len(timeline):.1%} strong matches")


if __name__ == "__main__":
    main()
