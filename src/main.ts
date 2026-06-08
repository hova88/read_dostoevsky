import {
  layoutNextLineRange,
  materializeLineRange,
  prepareWithSegments,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'
import { createIcons, BookOpen, Columns3, Focus, Moon, Sun, Type } from 'lucide'
import source from '../books/notes-from-the-underground.md?raw'
import './style.css'

type Section = {
  id: string
  title: string
  kicker: string
  paragraphs: string[]
}

type ReaderState = {
  sectionIndex: number
  fontSize: number
  theme: 'paper' | 'night'
  mode: 'flow' | 'spread' | 'focus'
}

type PreparedParagraph = {
  prepared: PreparedTextWithSegments
  isLead: boolean
}

type Obstacle = {
  x: number
  y: number
  width: number
  height: number
  side: 'left' | 'right'
}

type LineBox = {
  text: string
  x: number
  y: number
  width: number
  isLead: boolean
}

const STORAGE_KEY = 'read-dostoevsky-state'
const LINE_HEIGHT_RATIO = 1.62
const MIN_LINE_WIDTH = 230

const sections = parseMarkdown(source)
const initialState: ReaderState = {
  sectionIndex: 0,
  fontSize: 19,
  theme: 'paper',
  mode: 'spread',
  ...readStoredState(),
}

let state = clampState(initialState)
let resizeFrame = 0

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="reader-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" data-lucide="book-open" aria-hidden="true"></span>
        <div>
          <h1>Read Dostoevsky</h1>
          <p>Fyodor Dostoevsky</p>
        </div>
      </div>
      <div class="toolbar" aria-label="Reader controls">
        <label class="select-wrap">
          <span>Chapter</span>
          <select id="sectionSelect"></select>
        </label>
        <div class="segmented" aria-label="Layout mode">
          <button type="button" data-mode="flow" aria-label="Flow layout"><span data-lucide="book-open"></span></button>
          <button type="button" data-mode="spread" aria-label="Dynamic spread"><span data-lucide="columns-3"></span></button>
          <button type="button" data-mode="focus" aria-label="Focus layout"><span data-lucide="focus"></span></button>
        </div>
        <label class="range-wrap" aria-label="Text size">
          <span data-lucide="type" aria-hidden="true"></span>
          <input id="fontSize" type="range" min="16" max="24" step="1" />
        </label>
        <button id="themeToggle" class="icon-button" type="button" aria-label="Toggle theme">
          <span data-lucide="moon" aria-hidden="true"></span>
        </button>
      </div>
    </header>

    <section class="reader-stage" id="stage">
      <aside class="stage-art" id="stageArt" aria-hidden="true">
        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Dostoevsky_1872.jpg/420px-Dostoevsky_1872.jpg" alt="" />
      </aside>
      <aside class="pull-note" id="pullNote" aria-hidden="true">
        <span>Underground</span>
        <strong>I am a sick man.</strong>
      </aside>
      <article class="page" id="page" aria-live="polite">
        <div class="chapter-heading">
          <p id="kicker"></p>
          <h2 id="title"></h2>
        </div>
        <div class="text-plane" id="textPlane"></div>
      </article>
    </section>
  </main>
`

const sectionSelect = document.querySelector<HTMLSelectElement>('#sectionSelect')!
const fontSizeInput = document.querySelector<HTMLInputElement>('#fontSize')!
const themeToggle = document.querySelector<HTMLButtonElement>('#themeToggle')!
const page = document.querySelector<HTMLElement>('#page')!
const textPlane = document.querySelector<HTMLElement>('#textPlane')!
const title = document.querySelector<HTMLElement>('#title')!
const kicker = document.querySelector<HTMLElement>('#kicker')!
const stageArt = document.querySelector<HTMLElement>('#stageArt')!
const pullNote = document.querySelector<HTMLElement>('#pullNote')!

sectionSelect.innerHTML = sections
  .map((section, index) => `<option value="${index}">${escapeHtml(section.kicker)} ${escapeHtml(section.title)}</option>`)
  .join('')

sectionSelect.addEventListener('change', () => {
  state.sectionIndex = Number(sectionSelect.value)
  persist()
  render()
})

fontSizeInput.addEventListener('input', () => {
  state.fontSize = Number(fontSizeInput.value)
  persist()
  render()
})

themeToggle.addEventListener('click', () => {
  state.theme = state.theme === 'paper' ? 'night' : 'paper'
  persist()
  render()
})

document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
  button.addEventListener('click', () => {
    state.mode = button.dataset.mode as ReaderState['mode']
    persist()
    render()
  })
})

window.addEventListener('resize', () => {
  window.cancelAnimationFrame(resizeFrame)
  resizeFrame = window.requestAnimationFrame(render)
})

createIcons({ icons: { BookOpen, Columns3, Focus, Moon, Sun, Type } })
render()

function render() {
  state = clampState(state)
  const section = sections[state.sectionIndex]
  const lineHeight = Math.round(state.fontSize * LINE_HEIGHT_RATIO)
  const font = `400 ${state.fontSize}px Georgia, "Times New Roman", serif`
  const prepared = section.paragraphs.map((paragraph, index) => ({
    prepared: prepareWithSegments(paragraph, font),
    isLead: index === 0,
  }))

  document.documentElement.dataset.theme = state.theme
  document.documentElement.style.setProperty('--reader-font-size', `${state.fontSize}px`)
  document.documentElement.style.setProperty('--reader-line-height', `${lineHeight}px`)
  document.documentElement.dataset.mode = state.mode
  sectionSelect.value = String(state.sectionIndex)
  fontSizeInput.value = String(state.fontSize)
  title.textContent = section.title
  kicker.textContent = section.kicker
  themeToggle.innerHTML = `<span data-lucide="${state.theme === 'paper' ? 'moon' : 'sun'}" aria-hidden="true"></span>`

  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
    button.dataset.active = String(button.dataset.mode === state.mode)
  })

  const pageWidth = page.clientWidth
  const headingHeight = document.querySelector<HTMLElement>('.chapter-heading')!.offsetHeight
  const horizontalPadding = pageWidth >= 960 ? 72 : pageWidth >= 720 ? 48 : 24
  const contentWidth = pageWidth - horizontalPadding * 2
  const startY = headingHeight + (pageWidth >= 720 ? 36 : 24)
  const obstacles = buildObstacles(pageWidth, horizontalPadding, startY, contentWidth)
  const lines = layoutParagraphs(prepared, obstacles, horizontalPadding, startY, contentWidth, lineHeight)

  stageArt.style.display = state.mode === 'spread' && pageWidth >= 720 ? 'block' : 'none'
  pullNote.style.display = state.mode === 'spread' && pageWidth >= 920 ? 'block' : 'none'
  positionObstacleElements(obstacles)
  paintLines(lines, startY, lineHeight)
  createIcons({ icons: { BookOpen, Columns3, Focus, Moon, Sun, Type } })
}

function parseMarkdown(markdown: string): Section[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const titleLine = lines.find((line) => line.startsWith('# '))?.replace(/^#\s+/, '').trim() ?? 'Dostoevsky'
  const parsed: Section[] = []
  let current: Section | null = null
  let buffer: string[] = []

  const flushParagraph = () => {
    if (!current || buffer.length === 0) return
    const paragraph = buffer.join(' ').replace(/\s+/g, ' ').trim()
    if (paragraph && !paragraph.startsWith('Source:')) current.paragraphs.push(stripMarkdown(paragraph))
    buffer = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('## ')) {
      flushParagraph()
      const heading = stripMarkdown(trimmed.replace(/^##\s+/, ''))
      const isPart = /^Part\b/i.test(heading)
      current = {
        id: slugify(heading),
        title: isPart ? 'Notes from the Underground' : heading,
        kicker: isPart ? heading : parsed.at(-1)?.kicker ?? 'Notes from the Underground',
        paragraphs: [],
      }
      parsed.push(current)
      continue
    }

    if (!current || trimmed.startsWith('# ') || /^>\s*Source:/.test(trimmed) || /^\*By /.test(trimmed)) continue
    if (trimmed === '') {
      flushParagraph()
      continue
    }
    buffer.push(trimmed.replace(/^>\s?/, ''))
  }
  flushParagraph()

  return parsed
    .filter((section) => section.paragraphs.length > 0)
    .map((section) => {
      const first = section.paragraphs[0]
      if (/^Part\b/i.test(section.kicker) && first && first.length < 42 && !/[.!?]/.test(first)) {
        return { ...section, title: first, paragraphs: section.paragraphs.slice(1) }
      }
      return section
    })
    .filter((section) => section.paragraphs.length > 0)
}

function stripMarkdown(value: string) {
  return value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .trim()
}

function buildObstacles(pageWidth: number, padding: number, startY: number, contentWidth: number): Obstacle[] {
  if (state.mode !== 'spread' || pageWidth < 720) return []

  const artWidth = Math.min(210, contentWidth * 0.34)
  const obstacles: Obstacle[] = [
    {
      x: padding + contentWidth - artWidth,
      y: startY + 18,
      width: artWidth,
      height: artWidth * 1.18,
      side: 'right',
    },
  ]

  if (pageWidth >= 920) {
    obstacles.push({
      x: padding,
      y: startY + artWidth * 1.28,
      width: Math.min(240, contentWidth * 0.36),
      height: 150,
      side: 'left',
    })
  }

  return obstacles
}

function layoutParagraphs(
  paragraphs: PreparedParagraph[],
  obstacles: Obstacle[],
  xStart: number,
  yStart: number,
  contentWidth: number,
  lineHeight: number,
) {
  const lines: LineBox[] = []
  let y = yStart

  for (const paragraph of paragraphs) {
    let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
    let firstLine = true

    while (true) {
      const lane = findLane(y, xStart, contentWidth, obstacles)
      const range = layoutNextLineRange(paragraph.prepared, cursor, lane.width - (firstLine ? 22 : 0))
      if (range === null) break
      const line = materializeLineRange(paragraph.prepared, range)
      lines.push({
        text: line.text,
        x: lane.x + (firstLine ? 22 : 0),
        y,
        width: line.width,
        isLead: paragraph.isLead,
      })
      cursor = range.end
      firstLine = false
      y += lineHeight
    }

    y += paragraph.isLead ? lineHeight * 0.9 : lineHeight * 0.7
  }

  return lines
}

function findLane(y: number, xStart: number, contentWidth: number, obstacles: Obstacle[]) {
  const overlapping = obstacles.filter((obstacle) => y + 10 >= obstacle.y && y <= obstacle.y + obstacle.height)
  if (state.mode === 'focus' || overlapping.length === 0) return { x: xStart, width: contentWidth }

  const right = overlapping.find((obstacle) => obstacle.side === 'right')
  const left = overlapping.find((obstacle) => obstacle.side === 'left')
  let x = xStart
  let width = contentWidth

  if (left) {
    const leftEdge = left.x + left.width + 30
    x = Math.max(x, leftEdge)
    width = xStart + contentWidth - x
  }
  if (right) {
    width = Math.min(width, right.x - x - 30)
  }

  if (width < MIN_LINE_WIDTH) return { x: xStart, width: contentWidth }
  return { x, width }
}

function positionObstacleElements(obstacles: Obstacle[]) {
  const art = obstacles.find((obstacle) => obstacle.side === 'right')
  const note = obstacles.find((obstacle) => obstacle.side === 'left')

  if (art) {
    Object.assign(stageArt.style, {
      left: `${art.x}px`,
      top: `${art.y}px`,
      width: `${art.width}px`,
      height: `${art.height}px`,
    })
  }

  if (note) {
    Object.assign(pullNote.style, {
      left: `${note.x}px`,
      top: `${note.y}px`,
      width: `${note.width}px`,
      height: `${note.height}px`,
    })
  }
}

function paintLines(lines: LineBox[], startY: number, lineHeight: number) {
  const fragment = document.createDocumentFragment()
  textPlane.replaceChildren()

  for (const line of lines) {
    const span = document.createElement('span')
    span.className = `text-line${line.isLead ? ' is-lead' : ''}`
    span.textContent = line.text
    span.style.transform = `translate(${line.x}px, ${line.y - startY}px)`
    span.style.width = `${Math.ceil(line.width + 2)}px`
    fragment.appendChild(span)
  }

  textPlane.appendChild(fragment)
  const lastLine = lines.at(-1)
  textPlane.style.height = `${lastLine ? lastLine.y - startY + lineHeight * 2 : 0}px`
}

function readStoredState(): Partial<ReaderState> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function clampState(next: ReaderState): ReaderState {
  return {
    sectionIndex: Math.min(Math.max(next.sectionIndex || 0, 0), sections.length - 1),
    fontSize: Math.min(Math.max(next.fontSize || 19, 16), 24),
    theme: next.theme === 'night' ? 'night' : 'paper',
    mode: ['flow', 'spread', 'focus'].includes(next.mode) ? next.mode : 'spread',
  }
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

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}
