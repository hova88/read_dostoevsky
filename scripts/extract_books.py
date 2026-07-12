"""Extract the repository's public-domain PDFs into reader-friendly Markdown."""

import re
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
BOOKS = ROOT / "books"
SKIP_TITLES = {"About this book", "Table of Contents"}


def outline_entries(reader: PdfReader):
    entries: dict[int, list[tuple[int, str]]] = {}

    def walk(items, depth=0):
        for item in items:
            if isinstance(item, list):
                walk(item, depth + 1)
                continue
            title = item.title.strip()
            if title in SKIP_TITLES:
                continue
            page = reader.get_destination_page_number(item)
            entries.setdefault(page, []).append((depth, title))

    walk(reader.outline)
    return entries


def clean_page(text: str, title: str, page_number: int, total: int, heading_titles: set[str]):
    lines = []
    for raw in text.replace("\x00", "").splitlines():
        line = re.sub(r"\s+", " ", raw).strip()
        if not line:
            lines.append("")
            continue
        if line in {title, str(page_number), f"{page_number} of {total}"}:
            continue
        if line in heading_titles or line.startswith(title):
            continue
        if page_number == 1 and (line.startswith("Fyodor Dostoyevsky") or line.startswith("Translated by")):
            continue
        if re.fullmatch(r"(?:[ivxlcdm]+|\d+)", line, re.I):
            continue
        if "Downloaded from www.holybooks.com" in line:
            continue
        lines.append(line)

    text = "\n".join(lines)
    text = re.sub(r"(?<=\w)-\n(?=[a-z])", "", text)
    text = re.sub(r"(?<![.!?…:'\"”’])\n(?=\S)", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract(pdf: Path):
    reader = PdfReader(pdf)
    title = (reader.metadata.title or pdf.stem).strip()
    author = (reader.metadata.author or "Fyodor Dostoyevsky").strip()
    entries = outline_entries(reader)
    heading_titles = {title for headings in entries.values() for _, title in headings}
    start = min(
        page
        for page, headings in entries.items()
        if any(title.lower() in heading.lower() for _, heading in headings)
    )
    chunks = [f"# {title}\n\n*By {author}*\n"]

    for page_index in range(start, len(reader.pages)):
        headings = entries.get(page_index, [])
        for depth, heading in headings:
            if heading.lower() == title.lower():
                continue
            level = min(2 + max(depth - 1, 0), 4)
            chunks.append(f"{'#' * level} {heading}\n")
        page = clean_page(
            reader.pages[page_index].extract_text() or "",
            title,
            page_index + 1,
            len(reader.pages),
            heading_titles,
        )
        if page:
            chunks.append(page + "\n")

    output = BOOKS / f"{pdf.stem.lower().replace('-', '_')}.md"
    output.write_text("\n".join(chunks).strip() + "\n", encoding="utf-8")
    print(f"{pdf.name}: {len(reader.pages)} pages -> {output.name}")


if __name__ == "__main__":
    for source in sorted(BOOKS.glob("*.pdf")):
        if source.stem == "Notes-from-the-Underground":
            continue  # The hand-cleaned Markdown edition is better than this PDF.
        extract(source)
