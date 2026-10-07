import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, BookOpen, ChevronLeft, ChevronRight, Download, Highlighter, Maximize2, MessageSquarePlus, Minus, Plus, Search, X } from 'lucide-react';
import { pdfjs } from '../lib/documents';
import { download } from '../lib/storage';
import type { Annotation, HighlightColor, Rect, Source, ViewMode } from '../types';

interface Selection { page: number; quote: string; rects: Rect[]; x: number; y: number }
interface Props {
  source?: Source; annotations: Annotation[]; page: number; setPage: (page: number) => void;
  onAnnotate: (annotation: Annotation) => void; onAsk: (quote: string, page: number) => void;
  onSelectAnnotation: (annotation: Annotation) => void; onUpload: () => void;
}

function PdfPage({ doc, number, width, onError }: { doc: pdfjs.PDFDocumentProxy; number: number; width: number; onError: (error: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null), text = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(792 / 612), [near, setNear] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) setNear(true); }, { rootMargin: '500px' });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!near) return;
    let disposed = false, render: pdfjs.RenderTask | undefined, layer: pdfjs.TextLayer | undefined;
    (async () => {
      const page = await doc.getPage(number);
      if (disposed || !canvas.current || !text.current) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      setAspect(viewport.height / viewport.width);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.current.width = Math.floor(viewport.width * ratio);
      canvas.current.height = Math.floor(viewport.height * ratio);
      canvas.current.style.width = `${viewport.width}px`; canvas.current.style.height = `${viewport.height}px`;
      render = page.render({ canvas: canvas.current, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      text.current.innerHTML = '';
      text.current.style.setProperty('--scale-factor', String(viewport.scale));
      text.current.style.setProperty('--total-scale-factor', String(viewport.scale));
      const content = await page.getTextContent();
      if (disposed) return;
      layer = new pdfjs.TextLayer({ textContentSource: content, container: text.current, viewport });
      await Promise.all([render.promise, layer.render()]);
    })().catch(error => { if (!disposed && !['RenderingCancelledException', 'AbortException'].includes(error.name)) onError('This page could not be rendered. Try downloading the original.'); });
    return () => { disposed = true; render?.cancel(); layer?.cancel(); };
  }, [doc, number, width, near, onError]);
  return <div ref={container} className="pdf-render" style={{ width, aspectRatio: `1 / ${aspect}` }}><canvas ref={canvas} /><div className="textLayer" ref={text} /></div>;
}

export function Reader({ source, annotations, page, setPage, onAnnotate, onAsk, onSelectAnnotation, onUpload }: Props) {
  const [mode, setMode] = useState<ViewMode>('vertical'), [zoom, setZoom] = useState(100), [doc, setDoc] = useState<pdfjs.PDFDocumentProxy>(), [error, setError] = useState('');
  const [selection, setSelection] = useState<Selection>(), [color, setColor] = useState<HighlightColor>('yellow');
  const [areaTool, setAreaTool] = useState(false), [area, setArea] = useState<{ page: number; start: { x: number; y: number }; rect: Rect }>();
  const [searchOpen, setSearchOpen] = useState(false), [query, setQuery] = useState(''), [pageInput, setPageInput] = useState(String(page));
  const scroller = useRef<HTMLDivElement>(null), sizeRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(700);
  const [navigation, setNavigation] = useState(0);
  const pagesRef = useRef(new Map<number, HTMLDivElement>());
  const count = source?.pages.length ?? 0;
  const pageWidth = Math.max(180, Math.min(mode === 'book' ? (available - 76) / 2 : available - 76, source?.kind === 'pptx' ? 860 : 650) * zoom / 100);
  const currentPage = useRef(page); currentPage.current = page;
  useEffect(() => {
    const observer = new ResizeObserver(entries => setAvailable(entries[0].contentRect.width));
    if (sizeRef.current) observer.observe(sizeRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setPageInput(String(page)); }, [page]);
  useEffect(() => {
    setDoc(undefined); setError(''); setSelection(undefined); setQuery(''); setZoom(100);
    if (!source || source.kind !== 'pdf') return;
    let disposed = false;
    let task: pdfjs.PDFDocumentLoadingTask | undefined;
    source.blob.arrayBuffer().then(data => {
      if (disposed) return;
      task = pdfjs.getDocument({ data });
      return task.promise;
    }).then(pdf => { if (pdf && !disposed) setDoc(pdf); }).catch(() => { if (!disposed) setError('Unable to open this PDF. Download the original or import an unlocked copy.'); });
    return () => { disposed = true; void task?.destroy(); };
  }, [source?.id]);
  useLayoutEffect(() => {
    if (mode === 'book') return;
    const element = pagesRef.current.get(page);
    const root = scroller.current;
    if (!element || !root) return;
    // Navigation preserves the active page across layout and zoom changes.
    if (mode === 'horizontal') root.scrollTo({ left: element.offsetLeft - root.offsetLeft - 30 });
    else root.scrollTo({ top: element.offsetTop - root.offsetTop - 30 });
  }, [page, mode, zoom, source?.id, doc, navigation]);
  useEffect(() => {
    const root = scroller.current;
    if (!root || mode === 'book') return;
    let raf = 0;
    const scroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rootRect = root.getBoundingClientRect();
        let closest = Infinity, active = currentPage.current;
        pagesRef.current.forEach((element, number) => {
          const rect = element.getBoundingClientRect();
          const distance = mode === 'vertical' ? Math.abs(rect.top - rootRect.top - 30) : Math.abs(rect.left - rootRect.left - 30);
          if (distance < closest) { closest = distance; active = number; }
        });
        // Update the counter without forcing the user to a page boundary.
        currentPage.current = active; setPageInput(String(active));
      });
    };
    root.addEventListener('scroll', scroll, { passive: true });
    return () => { root.removeEventListener('scroll', scroll); cancelAnimationFrame(raf); };
  }, [mode, source?.id, doc]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName) || (event.target as HTMLElement).isContentEditable) return;
      if (event.key === 'Escape') { setSelection(undefined); setAreaTool(false); setSearchOpen(false); }
      if (event.key === 'ArrowRight') navigate(Math.min(count, currentPage.current + (mode === 'book' ? 2 : 1)));
      if (event.key === 'ArrowLeft') navigate(Math.max(1, currentPage.current - (mode === 'book' ? 2 : 1)));
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });
  const navigate = (value: number) => { setPage(Math.min(count, Math.max(1, value))); setNavigation(n => n + 1); setSelection(undefined); };
  const capture = () => {
    if (areaTool) return;
    const selected = window.getSelection();
    if (!selected || selected.isCollapsed || !selected.rangeCount || !selected.toString().trim()) return;
    const range = selected.getRangeAt(0);
    const parent = range.startContainer.parentElement?.closest<HTMLElement>('[data-page]');
    if (!parent || !scroller.current?.contains(parent) || range.endContainer.parentElement?.closest('[data-page]') !== parent) return;
    const rect = parent.getBoundingClientRect();
    const rects = Array.from(range.getClientRects()).filter(r => r.width > 1 && r.height > 1).map(r => ({ x: (r.left - rect.left) / rect.width, y: (r.top - rect.top) / rect.height, width: r.width / rect.width, height: r.height / rect.height }));
    if (!rects.length) return;
    const bounds = range.getBoundingClientRect();
    setSelection({ page: Number(parent.dataset.page), quote: selected.toString().trim(), rects, x: Math.max(170, Math.min(innerWidth - 180, bounds.left + bounds.width / 2)), y: Math.max(90, bounds.top - 12) });
  };
  const save = (note: boolean) => {
    if (!selection || !source) return;
    const annotation: Annotation = { id: crypto.randomUUID(), sourceId: source.id, page: selection.page, quote: selection.quote, note: '', color, rects: selection.rects, createdAt: Date.now() };
    onAnnotate(annotation); if (note) onSelectAnnotation(annotation);
    setSelection(undefined); window.getSelection()?.removeAllRanges();
  };
  const position = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  };
  const visiblePages = mode === 'book' ? Array.from({ length: Math.min(2, count - (Math.floor((page - 1) / 2) * 2)) }, (_, i) => Math.floor((page - 1) / 2) * 2 + i + 1) : Array.from({ length: count }, (_, i) => i + 1);
  const matches = query.trim() && source ? source.pages.map((text, i) => ({ text, page: i + 1 })).filter(p => p.text.toLowerCase().includes(query.toLowerCase())).slice(0, 30) : [];
  return <section className="reader" ref={sizeRef} aria-label="Document reader">
    <div className="reader-toolbar">
      <div className="reader-file"><span className={`file-icon ${source?.kind ?? 'pdf'}`}>{source?.kind === 'pptx' ? 'P' : 'PDF'}</span><div><strong>{source?.name.replace(/\.(pdf|pptx)$/i, '') ?? 'Your reading space'}</strong><span>{source ? `${count} ${source.kind === 'pptx' ? 'slides' : 'pages'} · ${source.kind.toUpperCase()}` : 'Add a source to begin'}</span></div></div>
      <div className="toolbar-actions"><button className={`icon-button ${searchOpen ? 'selected' : ''}`} title="Find in document" aria-label="Find in document" disabled={!source} onClick={() => setSearchOpen(!searchOpen)}><Search size={17} /></button><button className="icon-button" title="Download original" aria-label="Download original" disabled={!source} onClick={() => source && download(source.blob, source.name)}><Download size={17} /></button></div>
    </div>
    <div className="reader-controls">
      <div className="segmented view-switch" aria-label="Reading layout">{([
        ['vertical', ArrowDown, 'Vertical'], ['horizontal', ArrowRight, 'Horizontal'], ['book', BookOpen, 'Book'],
      ] as const).map(([value, Icon, label]) => <button key={value} className={mode === value ? 'active' : ''} aria-label={`${label} view`} aria-pressed={mode === value} onClick={() => { const active = currentPage.current; setPage(active); setMode(value); setSelection(undefined); }}><Icon size={15} /><span>{label}</span></button>)}</div>
      <div className="zoom-controls"><button className="icon-button small" aria-label="Zoom out" disabled={zoom <= 50} onClick={() => setZoom(Math.max(50, zoom - 10))}><Minus size={14} /></button><button className="zoom-value" aria-label="Reset zoom" onClick={() => setZoom(100)}>{zoom}%</button><button className="icon-button small" aria-label="Zoom in" disabled={zoom >= 200} onClick={() => setZoom(Math.min(200, zoom + 10))}><Plus size={14} /></button><i /><button className={`icon-button small ${areaTool ? 'selected' : ''}`} aria-label="Area highlight" title="Drag to highlight an area" aria-pressed={areaTool} disabled={!source} onClick={() => { setAreaTool(!areaTool); setSelection(undefined); }}><Highlighter size={16} /></button><button className="icon-button small" aria-label="Focus reader" title="Focus reader" onClick={() => sizeRef.current?.requestFullscreen?.().catch(() => setError('Fullscreen is unavailable in this browser.'))}><Maximize2 size={15} /></button></div>
    </div>
    {searchOpen && <div className="document-search"><Search size={15} /><input autoFocus placeholder="Find a word or phrase…" aria-label="Search document text" value={query} onChange={e => setQuery(e.target.value)} /><span>{matches.length} pages</span><button className="icon-button small" aria-label="Close search" onClick={() => { setSearchOpen(false); setQuery(''); }}><X size={15} /></button>{query && <div className="search-results">{matches.length ? matches.map(match => { const index = match.text.toLowerCase().indexOf(query.toLowerCase()); return <button key={match.page} onClick={() => navigate(match.page)}><span>p. {match.page}</span>{match.text.slice(Math.max(0, index - 30), index + 100)}</button>; }) : <p>No matching text. Scanned pages may need OCR.</p>}</div>}</div>}
    {error && <div className="inline-error" role="alert">{error}<button className="icon-button small" aria-label="Dismiss error" onClick={() => setError('')}><X size={14} /></button></div>}
    {areaTool && <div className="reader-hint">Drag over any part of the page to highlight it. Press Escape to finish.</div>}
    <div className={`page-scroller ${mode} ${areaTool ? 'area-tool' : ''}`} ref={scroller} onMouseUp={capture} onTouchEnd={() => setTimeout(capture, 50)} onScroll={() => setSelection(undefined)}>
      {!source ? <div className="reader-empty"><BookOpen size={38} strokeWidth={1} /><h2>Room for a new perspective.</h2><p>Add a PDF or slide deck.<br />Make the margins your own.</p><button className="primary-button" onClick={onUpload}><Plus size={16} /> Add a source</button></div> : source.kind === 'pdf' && !doc && !error ? <div className="reader-empty"><span className="spinner" /><p>Opening your document…</p></div> : visiblePages.map(number => <div className="page-shell" key={`${source.id}-${number}`}><div className="document-page" data-page={number} ref={el => { if (el) pagesRef.current.set(number, el); else pagesRef.current.delete(number); }} style={{ width: pageWidth }}
        onPointerDown={event => { if (!areaTool) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); const start = position(event); setArea({ page: number, start, rect: { ...start, width: 0, height: 0 } }); }}
        onPointerMove={event => { if (!area || area.page !== number) return; const end = position(event); setArea({ ...area, rect: { x: Math.min(area.start.x, end.x), y: Math.min(area.start.y, end.y), width: Math.abs(end.x - area.start.x), height: Math.abs(end.y - area.start.y) } }); }}
        onPointerUp={event => { if (!area || !source) return; if (area.rect.width > .005 && area.rect.height > .005) { const annotation: Annotation = { id: crypto.randomUUID(), sourceId: source.id, page: number, quote: 'Area highlight', note: '', color, rects: [area.rect], createdAt: Date.now() }; onAnnotate(annotation); onSelectAnnotation(annotation); } event.currentTarget.releasePointerCapture(event.pointerId); setArea(undefined); setAreaTool(false); }} onPointerCancel={() => setArea(undefined)}>
        {source.kind === 'pdf' && doc ? <PdfPage doc={doc} number={number} width={pageWidth} onError={setError} /> : source.slides?.[number - 1] && <div className="slide-render" style={{ aspectRatio: `${source.slides[number - 1].width} / ${source.slides[number - 1].height}` }}>{source.slides[number - 1].elements.map((element, i) => <div key={i} className={`slide-element ${element.kind}`} style={{ left: `${element.x * 100}%`, top: `${element.y * 100}%`, width: `${element.width * 100}%`, height: `${element.height * 100}%`, fontSize: (element.fontSize ?? 20) * pageWidth / 960, fontWeight: element.bold ? 600 : 400, color: element.color }}>{element.kind === 'image' ? <img src={element.image} alt="Embedded slide content" draggable={false} /> : element.text}</div>)}</div>}
        <div className="annotation-layer">{annotations.filter(a => a.sourceId === source.id && a.page === number).map(annotation => annotation.rects.map((r, i) => <button key={`${annotation.id}-${i}`} className={`highlight ${annotation.color}`} title={annotation.note || annotation.quote} aria-label={`Annotation: ${annotation.note || annotation.quote}`} style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` }} onClick={() => onSelectAnnotation(annotation)} />))}{area?.page === number && <div className={`highlight pending ${color}`} style={{ left: `${area.rect.x * 100}%`, top: `${area.rect.y * 100}%`, width: `${area.rect.width * 100}%`, height: `${area.rect.height * 100}%` }} />}</div>
      </div><div className="page-caption"><span>{source.kind === 'pptx' ? 'SLIDE' : 'PAGE'} {String(number).padStart(2, '0')}</span></div></div>)}
    </div>
    <div className="reader-footer"><span><span className="status-dot" />{source ? 'Select text to highlight or ask a question' : 'A little space to think'}</span><div className="page-navigation"><button className="icon-button small" aria-label="Previous page" disabled={!source || Number(pageInput) <= 1} onClick={() => navigate(currentPage.current - (mode === 'book' ? 2 : 1))}><ChevronLeft size={16} /></button><label><input aria-label="Page number" type="text" inputMode="numeric" value={pageInput} onChange={e => setPageInput(e.target.value)} onBlur={() => navigate(Number(pageInput) || 1)} onKeyDown={e => { if (e.key === 'Enter') navigate(Number(pageInput) || 1); }} /><span>/ {count || '–'}</span></label><button className="icon-button small" aria-label="Next page" disabled={!source || Number(pageInput) >= count} onClick={() => navigate(currentPage.current + (mode === 'book' ? 2 : 1))}><ChevronRight size={16} /></button></div></div>
    {selection && <div className="selection-toolbar" role="toolbar" aria-label="Selected text actions" style={{ left: selection.x, top: selection.y }} onMouseDown={e => e.preventDefault()}><div className="highlight-colors">{(['yellow', 'mint', 'lavender'] as const).map(c => <button key={c} className={`color-dot ${c} ${color === c ? 'chosen' : ''}`} aria-label={`${c} highlight color`} onClick={() => setColor(c)} />)}</div><i /><button onClick={() => save(false)}><Highlighter size={14} />Highlight</button><button onClick={() => save(true)}><MessageSquarePlus size={14} />Note</button><button className="ask-selection" onClick={() => { onAsk(selection.quote, selection.page); setSelection(undefined); window.getSelection()?.removeAllRanges(); }}>Ask AI</button></div>}
  </section>;
}
