import { layout, prepare } from '@chenglou/pretext'
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
const paragraphBlocks = readingBlocks.filter((block): block is Extract<Block, { type: 'paragraph' }> => block.type === 'paragraph')
const preparedTextCache = new Map<string, ReturnType<typeof prepare>>()
let layoutFrame = 0

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
        ${renderReadingBlocks(readingBlocks)}
      </div>
    </article>
  </main>
`

applyPretextLayout()
window.addEventListener('resize', schedulePretextLayout)

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

function renderReadingBlocks(blocks: Block[]) {
  let paragraphIndex = 0
  return blocks
    .map((block) => {
      if (block.type === 'paragraph') {
        return renderParagraph(block, paragraphIndex++)
      }
      return renderHeading(block)
    })
    .join('')
}

function renderHeading(block: Block) {
  if (block.type !== 'heading') return ''
  return block.level === 2
    ? `<h2 class="part-heading" id="${escapeHtml(block.id)}">${escapeHtml(block.text)}</h2>`
    : `<h3 class="chapter-heading" id="${escapeHtml(block.id)}">${escapeHtml(block.text)}</h3>`
}

function renderParagraph(block: Extract<Block, { type: 'paragraph' }>, index: number) {
  return `<p class="${block.note ? 'note' : 'body-copy'}" data-pretext="${index}">${escapeHtml(block.text)}</p>`
}

function renderNavigationItem(block: Extract<Block, { type: 'heading' }>) {
  const className = block.level === 2 ? 'part-link' : 'chapter-link'
  return `<li class="${className}"><a href="#${escapeHtml(block.id)}">${escapeHtml(block.text)}</a></li>`
}

function schedulePretextLayout() {
  window.cancelAnimationFrame(layoutFrame)
  layoutFrame = window.requestAnimationFrame(applyPretextLayout)
}

function applyPretextLayout() {
  document.querySelectorAll<HTMLElement>('[data-pretext]').forEach((element) => {
    const paragraph = paragraphBlocks[Number(element.dataset.pretext)]
    if (!paragraph) return

    const styles = window.getComputedStyle(element)
    const font = getCanvasFont(styles)
    const lineHeight = getLineHeight(styles)
    const width = getContentWidth(element, styles)
    if (width <= 0) return

    const key = `${font}\n${paragraph.text}`
    let prepared = preparedTextCache.get(key)
    if (!prepared) {
      prepared = prepare(paragraph.text, font)
      preparedTextCache.set(key, prepared)
    }

    const measured = layout(prepared, width, lineHeight)
    element.style.minHeight = `${Math.ceil(measured.height)}px`
  })
}

function getContentWidth(element: HTMLElement, styles: CSSStyleDeclaration) {
  const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0
  const paddingRight = Number.parseFloat(styles.paddingRight) || 0
  return element.clientWidth - paddingLeft - paddingRight
}

function getCanvasFont(styles: CSSStyleDeclaration) {
  const fontStyle = styles.fontStyle || 'normal'
  const fontVariant = styles.fontVariant || 'normal'
  const fontWeight = styles.fontWeight || '400'
  const fontSize = styles.fontSize || '20px'
  const fontFamily = styles.fontFamily || 'Georgia, "Times New Roman", serif'
  return `${fontStyle} ${fontVariant} ${fontWeight} ${fontSize} ${fontFamily}`
}

function getLineHeight(styles: CSSStyleDeclaration) {
  const parsed = Number.parseFloat(styles.lineHeight)
  if (Number.isFinite(parsed)) return parsed
  return Number.parseFloat(styles.fontSize) * 1.78
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
