import './style.css'

type Book = {
  id: string
  title: string
  shortTitle: string
  year: string
  load: () => Promise<string>
}

type Block =
  | { type: 'heading'; level: 2 | 3 | 4; text: string; id: string }
  | { type: 'paragraph'; text: string; note: boolean }

const books: Book[] = [
  { id: 'underground', title: 'Notes from the Underground', shortTitle: 'Underground', year: '1864', load: async () => (await import('../books/notes-from-the-underground.md?raw')).default },
  { id: 'crime', title: 'Crime and Punishment', shortTitle: 'Crime & Punishment', year: '1866', load: async () => (await import('../books/crime_and_punishment.md?raw')).default },
  { id: 'idiot', title: 'The Idiot', shortTitle: 'The Idiot', year: '1869', load: async () => (await import('../books/the_idiot.md?raw')).default },
  { id: 'brothers', title: 'The Brothers Karamazov', shortTitle: 'The Brothers Karamazov', year: '1880', load: async () => (await import('../books/the_brothers_karamazov.md?raw')).default },
]

const app = document.querySelector<HTMLDivElement>('#app')!
let activeBook = getRequestedBook()

app.innerHTML = `
  <div class="progress" aria-hidden="true"><span></span></div>
  <header class="topbar">
    <button class="wordmark" type="button" aria-label="Choose a book">Dostoevsky</button>
    <p class="current-book" aria-live="polite"></p>
    <button class="contents-button" type="button" aria-expanded="false" aria-controls="contents">Contents</button>
  </header>
  <aside class="library" aria-hidden="true">
    <button class="scrim" type="button" aria-label="Close library"></button>
    <div class="library-panel">
      <p class="eyebrow">The novels</p>
      <nav aria-label="Books">${books.map(renderBookLink).join('')}</nav>
      <p class="library-note">Four works · English editions</p>
    </div>
  </aside>
  <aside class="contents" id="contents" aria-hidden="true">
    <button class="scrim" type="button" aria-label="Close contents"></button>
    <div class="contents-panel">
      <p class="eyebrow">Contents</p>
      <nav aria-label="Chapters"></nav>
    </div>
  </aside>
  <main class="reading-shell"><p class="loading">Opening the book…</p></main>
`

const library = document.querySelector<HTMLElement>('.library')!
const contents = document.querySelector<HTMLElement>('.contents')!
const shell = document.querySelector<HTMLElement>('.reading-shell')!
const progress = document.querySelector<HTMLElement>('.progress span')!

document.querySelector('.wordmark')!.addEventListener('click', () => togglePanel(library))
document.querySelector('.contents-button')!.addEventListener('click', () => togglePanel(contents))
document.querySelectorAll('.scrim').forEach((button) => button.addEventListener('click', closePanels))
document.querySelectorAll<HTMLButtonElement>('[data-book]').forEach((button) => {
  button.addEventListener('click', () => selectBook(button.dataset.book!))
})
document.addEventListener('keydown', (event) => event.key === 'Escape' && closePanels())
window.addEventListener('scroll', updateProgress, { passive: true })

void openBook(activeBook)

async function openBook(book: Book) {
  activeBook = book
  shell.innerHTML = '<p class="loading">Opening the book…</p>'
  closePanels()
  const markdown = await book.load()
  const { author, blocks } = parseMarkdown(markdown)
  const headings = blocks.filter((block): block is Extract<Block, { type: 'heading' }> => block.type === 'heading')

  document.title = `${book.title} — Dostoevsky`
  document.querySelector('.current-book')!.textContent = book.shortTitle
  document.querySelector('.contents nav')!.innerHTML = headings.map(renderContentsLink).join('')
  shell.innerHTML = `
    <article class="book">
      <header class="book-header">
        <p class="book-year">${book.year}</p>
        <h1>${escapeHtml(book.title)}</h1>
        <p class="byline">${escapeHtml(author)}</p>
        <span class="opening-rule" aria-hidden="true"></span>
      </header>
      <div class="book-body">${blocks.map(renderBlock).join('')}</div>
      <footer class="book-end"><span>End</span></footer>
    </article>`

  document.querySelectorAll<HTMLAnchorElement>('.contents a').forEach((link) => link.addEventListener('click', closePanels))
  document.querySelectorAll('[data-book]').forEach((item) => item.classList.toggle('is-active', (item as HTMLElement).dataset.book === book.id))
  history.replaceState(null, '', `#${book.id}`)
  requestAnimationFrame(() => restorePosition(book.id))
}

function parseMarkdown(markdown: string) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  const ids = new Map<string, number>()
  let author = 'Fyodor Dostoevsky'
  let paragraph: string[] = []
  let note = false

  const flush = () => {
    const text = paragraph.join(' ').replace(/\s+/g, ' ').trim()
    if (text && !/^Source:/i.test(text)) blocks.push({ type: 'paragraph', text: stripMarkdown(text), note })
    paragraph = []
    note = false
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    if (/^#\s/.test(line)) { flush(); continue }
    if (/^\*By\s.+\*$/.test(line)) { author = stripMarkdown(line).replace(/^By\s+/i, ''); continue }
    const heading = line.match(/^(#{2,4})\s+(.+)$/)
    if (heading) {
      flush()
      const text = stripMarkdown(heading[2])
      blocks.push({ type: 'heading', level: heading[1].length as 2 | 3 | 4, text, id: uniqueId(text, ids) })
      continue
    }
    const isNote = line.startsWith('>')
    if (paragraph.length && note !== isNote) flush()
    note = isNote
    paragraph.push(line.replace(/^>\s?/, ''))
  }
  flush()
  return { author, blocks }
}

function renderBookLink(book: Book) {
  return `<button type="button" data-book="${book.id}"><span>${escapeHtml(book.title)}</span><small>${book.year}</small></button>`
}

function renderContentsLink(block: Extract<Block, { type: 'heading' }>) {
  return `<a class="level-${block.level}" href="#${block.id}">${escapeHtml(block.text)}</a>`
}

function renderBlock(block: Block) {
  if (block.type === 'paragraph') return `<p class="${block.note ? 'note' : ''}">${escapeHtml(block.text)}</p>`
  return `<h${block.level} id="${block.id}">${escapeHtml(block.text)}</h${block.level}>`
}

function selectBook(id: string) {
  const book = books.find((item) => item.id === id)
  if (book && book !== activeBook) void openBook(book)
}

function togglePanel(panel: HTMLElement) {
  const shouldOpen = panel.getAttribute('aria-hidden') === 'true'
  closePanels()
  if (shouldOpen) {
    panel.setAttribute('aria-hidden', 'false')
    document.body.classList.add('panel-open')
    if (panel === contents) document.querySelector('.contents-button')!.setAttribute('aria-expanded', 'true')
  }
}

function closePanels() {
  library.setAttribute('aria-hidden', 'true')
  contents.setAttribute('aria-hidden', 'true')
  document.body.classList.remove('panel-open')
  document.querySelector('.contents-button')?.setAttribute('aria-expanded', 'false')
}

function updateProgress() {
  const available = document.documentElement.scrollHeight - innerHeight
  const ratio = available > 0 ? scrollY / available : 0
  progress.style.transform = `scaleX(${ratio})`
  localStorage.setItem(`position:${activeBook.id}`, String(ratio))
}

function restorePosition(id: string) {
  const ratio = Number(localStorage.getItem(`position:${id}`) ?? 0)
  const available = document.documentElement.scrollHeight - innerHeight
  scrollTo({ top: Math.max(0, ratio * available) })
  updateProgress()
}

function getRequestedBook() {
  return books.find((book) => book.id === location.hash.slice(1)) ?? books[0]
}

function stripMarkdown(value: string) {
  return value.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').replace(/_(.*?)_/g, '$1').replace(/\[(.*?)\]\(.*?\)/g, '$1').trim()
}

function uniqueId(value: string, counts: Map<string, number>) {
  const base = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'section'
  const count = counts.get(base) ?? 0
  counts.set(base, count + 1)
  return count ? `${base}-${count + 1}` : base
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}
