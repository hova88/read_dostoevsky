import './style.css'

type Book = {
  id: string
  title: string
  shortTitle: string
  year: string
  load: () => Promise<string>
  audio?: { file?: string; timeline: string; reader: string }
}

type Block =
  | { type: 'heading'; level: 2 | 3 | 4; text: string; id: string }
  | { type: 'paragraph'; text: string; note: boolean }

type Timing = { i: number; start: number; end: number; score: number; track?: number }
type AudioTrack = { file: string; duration: number }

const books: Book[] = [
  {
    id: 'underground',
    title: 'Notes from the Underground',
    shortTitle: 'Underground',
    year: '1864',
    load: async () => (await import('../books/notes-from-the-underground.md?raw')).default,
    audio: { file: './audio/underground.mp4', timeline: './audio/underground.timeline.json', reader: 'Bob Neufeld · LibriVox' },
  },
  {
    id: 'crime',
    title: 'Crime and Punishment',
    shortTitle: 'Crime & Punishment',
    year: '1866',
    load: async () => (await import('../books/crime_and_punishment.md?raw')).default,
    audio: { timeline: './audio/crime.timeline.json', reader: 'LibriVox Volunteers' },
  },
  { id: 'idiot', title: 'The Idiot', shortTitle: 'The Idiot', year: '1869', load: async () => (await import('../books/the_idiot.md?raw')).default },
  {
    id: 'brothers',
    title: 'The Brothers Karamazov',
    shortTitle: 'The Brothers Karamazov',
    year: '1880',
    load: async () => (await import('../books/the_brothers_karamazov.md?raw')).default,
    audio: { timeline: './audio/brothers.timeline.json', reader: 'LibriVox Volunteers' },
  },
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
  <div class="audio-player" aria-hidden="true">
    <audio preload="metadata"></audio>
    <button class="audio-toggle" type="button" aria-label="Play audiobook">
      <span class="audio-icon" aria-hidden="true"></span><span class="audio-action">Listen</span>
    </button>
    <span class="audio-reader"></span>
    <span class="audio-time">0:00</span>
  </div>
`

const library = document.querySelector<HTMLElement>('.library')!
const contents = document.querySelector<HTMLElement>('.contents')!
const shell = document.querySelector<HTMLElement>('.reading-shell')!
const progress = document.querySelector<HTMLElement>('.progress span')!
const player = document.querySelector<HTMLElement>('.audio-player')!
const audio = player.querySelector('audio')!
const audioToggle = player.querySelector<HTMLButtonElement>('.audio-toggle')!
const audioAction = player.querySelector<HTMLElement>('.audio-action')!
const audioTime = player.querySelector<HTMLElement>('.audio-time')!
let timeline: Timing[] = []
let trackTimelines: Timing[][] = []
let audioTracks: AudioTrack[] = []
let activeTrack = 0
let activeSentence: HTMLElement | null = null
let audioFrame = 0
let resumeAfterHover = false
let suppressFollowUntil = 0

document.querySelector('.wordmark')!.addEventListener('click', () => togglePanel(library))
document.querySelector('.contents-button')!.addEventListener('click', () => togglePanel(contents))
document.querySelectorAll('.scrim').forEach((button) => button.addEventListener('click', closePanels))
document.querySelectorAll<HTMLButtonElement>('[data-book]').forEach((button) => {
  button.addEventListener('click', () => selectBook(button.dataset.book!))
})
document.addEventListener('keydown', (event) => event.key === 'Escape' && closePanels())
window.addEventListener('scroll', updateProgress, { passive: true })
window.addEventListener('wheel', suspendAudioFollow, { passive: true })
window.addEventListener('touchstart', suspendAudioFollow, { passive: true })
audioToggle.addEventListener('click', toggleAudio)
audio.addEventListener('play', updateAudioState)
audio.addEventListener('pause', updateAudioState)
audio.addEventListener('ended', advanceAudioTrack)
audio.addEventListener('timeupdate', saveAudioPosition)

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
      <div class="book-body">${renderBlocks(blocks, Boolean(book.audio))}</div>
      <footer class="book-end"><span>End</span></footer>
    </article>`

  document.querySelectorAll<HTMLAnchorElement>('.contents a').forEach((link) => link.addEventListener('click', closePanels))
  document.querySelectorAll('[data-book]').forEach((item) => item.classList.toggle('is-active', (item as HTMLElement).dataset.book === book.id))
  history.replaceState(null, '', `#${book.id}`)
  await prepareAudio(book)
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

function renderBlocks(blocks: Block[], synchronized: boolean) {
  let sentenceIndex = 0
  return blocks.map((block) => {
    if (block.type !== 'paragraph') return `<h${block.level} id="${block.id}">${escapeHtml(block.text)}</h${block.level}>`
    const text = synchronized
      ? splitSentences(block.text).map((sentence) => `<span class="sentence" data-sentence="${sentenceIndex++}">${escapeHtml(sentence)}</span>`).join(' ')
      : escapeHtml(block.text)
    return `<p class="${block.note ? 'note' : ''}">${text}</p>`
  }).join('')
}

function splitSentences(value: string) {
  const parts = value.split(/([.!?]+["'”’)]*)\s+(?=[A-Z“‘"'])/)
  const sentences = []
  for (let index = 0; index < parts.length; index += 2) {
    const sentence = `${parts[index] ?? ''}${parts[index + 1] ?? ''}`.trim()
    if (sentence) sentences.push(sentence)
  }
  return sentences
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

async function prepareAudio(book: Book) {
  cancelAnimationFrame(audioFrame)
  audio.pause()
  audio.removeAttribute('src')
  audio.load()
  timeline = []
  trackTimelines = []
  audioTracks = []
  activeTrack = 0
  activeSentence = null
  player.setAttribute('aria-hidden', String(!book.audio))
  if (!book.audio) return

  player.querySelector('.audio-reader')!.textContent = book.audio.reader
  try {
    const response = await fetch(book.audio.timeline)
    if (!response.ok) throw new Error(`Timeline request failed: ${response.status}`)
    const data = await response.json() as { sentences: Timing[]; tracks?: AudioTrack[] }
    timeline = data.sentences
    audioTracks = data.tracks ?? (book.audio.file ? [{ file: book.audio.file, duration: 0 }] : [])
    if (!audioTracks.length) throw new Error('Timeline has no audio tracks')
    trackTimelines = audioTracks.map((_, track) => timeline.filter((timing) => (timing.track ?? 0) === track))
    bindSentenceInteraction()
    const saved = parseAudioPosition(localStorage.getItem(`audio:${book.id}`))
    loadAudioTrack(Math.min(saved.track, audioTracks.length - 1), saved.time)
  } catch (error) {
    console.error(error)
    player.setAttribute('aria-hidden', 'true')
  }
}

function bindSentenceInteraction() {
  document.querySelectorAll<HTMLElement>('[data-sentence]').forEach((sentence) => {
    sentence.addEventListener('click', () => {
      const timing = timeline[Number(sentence.dataset.sentence)]
      if (!timing) return
      const track = timing.track ?? 0
      if (track === activeTrack) {
        audio.currentTime = timing.start
        void audio.play()
      } else {
        loadAudioTrack(track, timing.start, true)
      }
    })
    sentence.addEventListener('pointerenter', () => {
      if (sentence !== activeSentence || audio.paused) return
      resumeAfterHover = true
      audio.pause()
    })
    sentence.addEventListener('pointerleave', () => {
      if (!resumeAfterHover) return
      resumeAfterHover = false
      void audio.play()
    })
  })
}

function toggleAudio() {
  if (audio.paused) void audio.play()
  else audio.pause()
}

function updateAudioState() {
  const playing = !audio.paused && !audio.ended
  player.classList.toggle('is-playing', playing)
  audioToggle.setAttribute('aria-label', playing ? 'Pause audiobook' : 'Play audiobook')
  audioAction.textContent = playing ? 'Pause' : audio.currentTime ? 'Resume' : 'Listen'
  cancelAnimationFrame(audioFrame)
  updateAudioPosition()
}

function updateAudioPosition() {
  const timings = trackTimelines[activeTrack] ?? []
  if (!timings.length) return
  if (audio.currentTime < timings[0].start) {
    activeSentence?.classList.remove('is-speaking')
    activeSentence = null
    updateAudioTime()
    if (!audio.paused) audioFrame = requestAnimationFrame(updateAudioPosition)
    return
  }
  const timing = timings[findTiming(audio.currentTime, timings)]
  const sentence = document.querySelector<HTMLElement>(`[data-sentence="${timing.i}"]`)
  const ratio = Math.max(0, Math.min(1, (audio.currentTime - timing.start) / (timing.end - timing.start)))

  if (sentence !== activeSentence) {
    activeSentence?.classList.remove('is-speaking')
    activeSentence?.style.removeProperty('--sentence-progress')
    activeSentence = sentence
    sentence?.classList.add('is-speaking')
    followSentence(sentence)
  }
  sentence?.style.setProperty('--sentence-progress', `${ratio * 100}%`)
  updateAudioTime()
  if (!audio.paused) audioFrame = requestAnimationFrame(updateAudioPosition)
}

function findTiming(time: number, timings: Timing[]) {
  let low = 0
  let high = timings.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (timings[middle].start <= time) low = middle
    else high = middle - 1
  }
  return low
}

function followSentence(sentence: HTMLElement | null) {
  if (!sentence || Date.now() < suppressFollowUntil) return
  const bounds = sentence.getBoundingClientRect()
  if (bounds.top < innerHeight * .22 || bounds.bottom > innerHeight * .78) {
    sentence.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

function suspendAudioFollow() {
  suppressFollowUntil = Date.now() + 8000
}

function saveAudioPosition() {
  if (activeBook.audio && Number.isFinite(audio.currentTime)) {
    localStorage.setItem(`audio:${activeBook.id}`, JSON.stringify({ track: activeTrack, time: audio.currentTime }))
  }
}

function loadAudioTrack(track: number, time = 0, autoplay = false) {
  const source = audioTracks[track]
  if (!source) return
  activeTrack = track
  audio.src = source.file
  audio.addEventListener('loadedmetadata', () => {
    audio.currentTime = Math.min(time, audio.duration || time)
    updateAudioState()
    if (autoplay) void audio.play()
  }, { once: true })
  audio.load()
}

function advanceAudioTrack() {
  if (activeTrack + 1 < audioTracks.length) loadAudioTrack(activeTrack + 1, 0, true)
  else updateAudioState()
}

function parseAudioPosition(value: string | null) {
  if (!value) return { track: 0, time: 0 }
  try {
    const saved = JSON.parse(value) as { track?: number; time?: number }
    return { track: Math.max(0, saved.track ?? 0), time: Math.max(0, saved.time ?? 0) }
  } catch {
    return { track: 0, time: Math.max(0, Number(value) || 0) }
  }
}

function updateAudioTime() {
  const elapsed = audioTracks.slice(0, activeTrack).reduce((sum, track) => sum + track.duration, 0) + audio.currentTime
  const duration = audioTracks.reduce((sum, track) => sum + track.duration, 0) || audio.duration
  audioTime.textContent = `${formatTime(elapsed)} / ${formatTime(duration)}`
}

function formatTime(value: number) {
  if (!Number.isFinite(value)) return '0:00'
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const seconds = Math.floor(value % 60)
  return `${hours ? `${hours}:` : ''}${hours ? String(minutes).padStart(2, '0') : minutes}:${String(seconds).padStart(2, '0')}`
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
