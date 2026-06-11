import source from '../books/notes-from-the-underground.md?raw'
import './style.css'

type Block =
  | { type: 'title'; text: string }
  | { type: 'byline'; text: string }
  | { type: 'heading'; level: 2 | 3; text: string; id: string }
  | { type: 'paragraph'; text: string; note?: boolean }

const blocks = parseMarkdown(source)
const title = cleanTitle(blocks.find((block) => block.type === 'title')?.text ?? 'Notes from the Underground')
const byline = cleanByline(blocks.find((block) => block.type === 'byline')?.text ?? 'Fyodor Dostoyevsky')
const readingBlocks = blocks.filter((block) => block.type !== 'title' && block.type !== 'byline')
const navigationItems = readingBlocks.filter((block): block is Extract<Block, { type: 'heading' }> => block.type === 'heading')

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="reader">
    <nav class="chapter-nav" aria-label="Chapters">
      <p class="nav-title">Contents</p>
      <ol>
        ${navigationItems.map(renderNavigationItem).join('')}
      </ol>
    </nav>
    <article class="book" aria-labelledby="book-title">
      <header class="book-header">
        <h1 id="book-title">${escapeHtml(title)}</h1>
        <p class="byline">${escapeHtml(byline)}</p>
      </header>
      <div class="book-body">
        ${readingBlocks.map(renderBlock).join('')}
      </div>
    </article>
  </main>
`

function parseMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  const headingCounts = new Map<string, number>()
  let paragraph: string[] = []
  let currentQuote = false

  const flushParagraph = () => {
    const text = paragraph.join(' ').replace(/\s+/g, ' ').trim()
    if (text && !/^Source:/i.test(text)) {
      blocks.push({ type: 'paragraph', text: stripMarkdown(text), note: currentQuote })
    }
    paragraph = []
    currentQuote = false
  }

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph()
      continue
    }

    if (/^>\s*Source:/i.test(trimmed)) continue

    if (trimmed.startsWith('# ')) {
      flushParagraph()
      blocks.push({ type: 'title', text: stripMarkdown(trimmed.replace(/^#\s+/, '')) })
      continue
    }

    if (trimmed.startsWith('## ')) {
      flushParagraph()
      const text = stripMarkdown(trimmed.replace(/^##\s+/, ''))
      blocks.push({ type: 'heading', level: /^Part\b/i.test(text) ? 2 : 3, text, id: uniqueId(text, headingCounts) })
      continue
    }

    if (trimmed.startsWith('### ')) {
      flushParagraph()
      const text = stripMarkdown(trimmed.replace(/^###\s+/, ''))
      blocks.push({ type: 'heading', level: 3, text, id: uniqueId(text, headingCounts) })
      continue
    }

    if (/^\*By\s+.+\*$/.test(trimmed)) {
      flushParagraph()
      blocks.push({ type: 'byline', text: stripMarkdown(trimmed) })
      continue
    }

    const isQuote = trimmed.startsWith('>')
    if (paragraph.length > 0 && isQuote !== currentQuote) flushParagraph()
    currentQuote = isQuote
    paragraph.push(trimmed.replace(/^>\s?/, ''))
  }

  flushParagraph()
  return blocks
}

function renderBlock(block: Block) {
  switch (block.type) {
    case 'heading':
      return block.level === 2
        ? `<h2 class="part-heading" id="${escapeHtml(block.id)}">${escapeHtml(block.text)}</h2>`
        : `<h3 class="chapter-heading" id="${escapeHtml(block.id)}">${escapeHtml(block.text)}</h3>`
    case 'paragraph':
      return `<p class="${block.note ? 'note' : 'body-copy'}">${escapeHtml(block.text)}</p>`
    default:
      return ''
  }
}

function renderNavigationItem(block: Extract<Block, { type: 'heading' }>) {
  const className = block.level === 2 ? 'part-link' : 'chapter-link'
  return `<li class="${className}"><a href="#${escapeHtml(block.id)}">${escapeHtml(block.text)}</a></li>`
}

function stripMarkdown(value: string) {
  return value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\*/g, '')
    .trim()
}

function uniqueId(value: string, counts: Map<string, number>) {
  const base = slugify(value) || 'section'
  const count = counts.get(base) ?? 0
  counts.set(base, count + 1)
  return count === 0 ? base : `${base}-${count + 1}`
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function cleanTitle(value: string) {
  return value.replace(/\s+By\s+Fyodor Dostoyevsky$/i, '').trim()
}

function cleanByline(value: string) {
  return value.replace(/^By\s+/i, '').trim()
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return entities[char]
  })
}
