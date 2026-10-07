import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUp, BookOpen, Check, ChevronDown, ChevronRight, CircleHelp, FileText, FolderOpen, Grid2X2, Layers, Leaf, Library, LoaderCircle, Menu, MessageSquare, MoreHorizontal, NotebookPen, Plus, Search, Settings2, ShieldCheck, Sparkles, Square, Trash2, Upload, X, Download, PanelRightClose, PanelRightOpen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Reader } from './components/Reader';
import { Modal } from './components/Modal';
import { createDemo } from './lib/demo';
import { importDocument } from './lib/documents';
import { download, storage } from './lib/storage';
import { streamChat } from './lib/chat';
import type { AIStatus, Annotation, Message, Notebook, Source } from './types';

function Brand({ small = false }: { small?: boolean }) { return <span className={`brand-mark ${small ? 'small' : ''}`} aria-hidden="true"><svg viewBox="0 0 28 28"><path d="M6 21V7h3l10 14h3V7h-3v9L9 7" /></svg></span>; }
const readableSize = (size: number) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;

export default function App() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]), [sources, setSources] = useState<Source[]>([]), [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeId, setActiveId] = useState(''), [sourceId, setSourceId] = useState(''), [page, setPage] = useState(1);
  const [enabled, setEnabled] = useState<Set<string>>(new Set()), [tab, setTab] = useState<'chat' | 'notes'>('chat');
  const [status, setStatus] = useState<AIStatus>({ configured: false, model: 'nvidia/nemotron-3-nano-30b-a3b', local: false });
  const [modal, setModal] = useState<'settings' | 'new' | 'library' | 'help' | null>(null), [title, setTitle] = useState(''), [description, setDescription] = useState('');
  const [ready, setReady] = useState(false), [importing, setImporting] = useState(''), [filter, setFilter] = useState('');
  const [toast, setToast] = useState<{ message: string; undo?: () => void }>(), [saveError, setSaveError] = useState('');
  const [draft, setDraft] = useState(''), [chatError, setChatError] = useState(''), [busy, setBusy] = useState(false);
  const [context, setContext] = useState<{ quote: string; sourceId: string; page: number }>(), [selectedAnnotation, setSelectedAnnotation] = useState<string>();
  const [sidebarOpen, setSidebarOpen] = useState(false), [panelOpen, setPanelOpen] = useState(true);
  const input = useRef<HTMLInputElement>(null), composer = useRef<HTMLTextAreaElement>(null), chatBottom = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController>(null), streaming = useRef(false);
  const notebook = notebooks.find(n => n.id === activeId);
  const notebookSources = sources.filter(s => s.notebookId === activeId);
  const source = notebookSources.find(s => s.id === sourceId);
  const notebookAnnotations = annotations.filter(a => notebookSources.some(s => s.id === a.sourceId));
  const activeAnnotation = notebookAnnotations.find(a => a.id === selectedAnnotation);
  const enabledSources = notebookSources.filter(s => enabled.has(s.id));
  const notify = (message: string, undo?: () => void) => setToast({ message, undo });
  const reportStorageError = () => { setSaveError('Browser storage is full or unavailable. Export your notes before refreshing.'); };
  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = await storage.read();
      if (!saved.notebooks.length) {
        const demo = await createDemo();
        await storage.notebook(demo.notebook);
        for (const s of demo.sources) await storage.source(s);
        saved.notebooks = [demo.notebook]; saved.sources = demo.sources;
      }
      if (!alive) return;
      setNotebooks(saved.notebooks); setSources(saved.sources); setAnnotations(saved.annotations);
      let rememberedNotebook = '', rememberedSource = '';
      try { rememberedNotebook = localStorage.getItem('nemodoc-notebook') ?? ''; rememberedSource = localStorage.getItem('nemodoc-source') ?? ''; } catch { /* IndexedDB remains the primary store. */ }
      const active = saved.notebooks.find(n => n.id === rememberedNotebook)?.id ?? saved.notebooks[0].id; setActiveId(active);
      setSourceId(saved.sources.find(s => s.notebookId === active && s.id === rememberedSource)?.id ?? saved.sources.find(s => s.notebookId === active)?.id ?? '');
      setEnabled(new Set(saved.sources.map(s => s.id))); setReady(true);
    })().catch(() => { if (alive) { setSaveError('Unable to open local storage. Allow site storage in your browser, then reload.'); setReady(true); } });
    fetch('/api/status').then(r => r.json()).then(setStatus).catch(() => {});
    return () => { alive = false; abort.current?.abort(); };
  }, []);
  useEffect(() => { if (!ready) return; try { localStorage.setItem('nemodoc-notebook', activeId); localStorage.setItem('nemodoc-source', sourceId); } catch { /* Reading remains available with localStorage disabled. */ } }, [activeId, sourceId, ready]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(undefined), toast.undo ? 10000 : 5000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (tab === 'chat') chatBottom.current?.scrollIntoView({ block: 'nearest' }); }, [notebook?.messages, tab]);
  const updateNotebook = (value: Notebook) => { setNotebooks(list => list.map(n => n.id === value.id ? value : n)); void storage.notebook(value).catch(reportStorageError); };
  const openNotebook = (id: string) => { abort.current?.abort(); setActiveId(id); setSourceId(sources.find(s => s.notebookId === id)?.id ?? ''); setPage(1); setContext(undefined); setSelectedAnnotation(undefined); setChatError(''); setSidebarOpen(false); setModal(null); };
  const openSource = (id: string, pageNumber = 1) => { setSourceId(id); setPage(pageNumber); setContext(undefined); setSidebarOpen(false); };
  const addAnnotation = (value: Annotation) => { setAnnotations(list => [...list, value]); void storage.annotation(value).catch(reportStorageError); notify('Highlight saved to your notebook'); };
  const editAnnotation = (value: Annotation) => { setAnnotations(list => list.map(a => a.id === value.id ? value : a)); void storage.annotation(value).catch(reportStorageError); };
  const selectAnnotation = (value: Annotation) => { setSelectedAnnotation(value.id); setTab('notes'); setPanelOpen(true); };
  const askSelection = (quote: string, selectedPage: number) => { if (!source) return; setContext({ quote, page: selectedPage, sourceId: source.id }); setTab('chat'); setPanelOpen(true); setDraft('Explain this passage'); setTimeout(() => composer.current?.focus(), 0); };
  const addFiles = async (files: FileList | File[]) => {
    if (!notebook || importing) return;
    const targetNotebook = notebook.id;
    for (const file of Array.from(files)) {
      try {
        const imported = await importDocument(file, targetNotebook, setImporting);
        await storage.source(imported);
        setSources(list => [...list, imported]); setEnabled(prev => new Set([...prev, imported.id]));
        setSourceId(imported.id); setPage(1); notify(`${file.name} added`);
      } catch (error) { notify(error instanceof Error ? error.message : 'Could not import this document.'); }
    }
    setImporting(''); if (input.current) input.current.value = '';
  };
  const createNotebook = async () => {
    if (!title.trim()) return;
    const value: Notebook = { id: crypto.randomUUID(), title: title.trim(), description: description.trim(), createdAt: Date.now(), notes: '', messages: [] };
    try { await storage.notebook(value); setNotebooks(list => [...list, value]); setActiveId(value.id); setSourceId(''); setPage(1); setTitle(''); setDescription(''); setModal(null); setContext(undefined); setChatError(''); setSidebarOpen(false); }
    catch { reportStorageError(); }
  };
  const removeSource = async (value: Source) => {
    const savedAnnotations = annotations.filter(a => a.sourceId === value.id);
    try {
      await storage.removeSource(value.id); setSources(list => list.filter(s => s.id !== value.id)); setAnnotations(list => list.filter(a => a.sourceId !== value.id));
      if (sourceId === value.id) openSource(notebookSources.find(s => s.id !== value.id)?.id ?? '');
      notify('Source removed', () => { void (async () => { await storage.source(value); for (const a of savedAnnotations) await storage.annotation(a); setSources(list => [...list, value]); setAnnotations(list => [...list, ...savedAnnotations]); })().catch(reportStorageError); setToast(undefined); });
    } catch { reportStorageError(); }
  };
  const removeAnnotation = async (value: Annotation) => {
    try { await storage.removeAnnotation(value.id); setAnnotations(list => list.filter(a => a.id !== value.id)); setSelectedAnnotation(undefined); notify('Highlight removed', () => { addAnnotation(value); }); } catch { reportStorageError(); }
  };
  const exportNotes = () => {
    if (!notebook) return;
    const text = `# ${notebook.title}\n\n${notebook.description}\n\n${notebook.notes}\n\n## Highlights & annotations\n\n` + notebookAnnotations.map(a => `### ${sources.find(s => s.id === a.sourceId)?.name} · page ${a.page}\n\n> ${a.quote.replace(/\n/g, '\n> ')}\n\n${a.note}\n`).join('\n') + '\n## Conversation\n\n' + notebook.messages.map(m => `### ${m.role === 'user' ? 'You' : 'NemoDoc'}\n\n${m.content}\n\n` + (m.citations ?? []).map(c => `[${c.id}] ${c.sourceName}, page ${c.page}\n`).join('')).join('\n');
    download(new Blob([text], { type: 'text/markdown' }), `${notebook.title.replace(/[^\p{L}\p{N} -]/gu, '') || 'Notebook'} - notes.md`);
    notify('Notes exported');
  };
  const send = async (question = draft) => {
    if (!notebook || !question.trim() || streaming.current) return;
    if (!enabledSources.length && !context) { setChatError('Select at least one source in the sidebar first.'); return; }
    const target = notebook.id;
    const fullQuestion = context ? `${question}\n\nSelected passage from ${source?.name}, page ${context.page}:\n${context.quote}` : question;
    const selectedSources = context ? notebookSources.filter(s => s.id === context.sourceId) : enabledSources;
    const user: Message = { id: crypto.randomUUID(), role: 'user', content: fullQuestion };
    const answer: Message = { id: crypto.randomUUID(), role: 'assistant', content: '', citations: [] };
    const originalMessages = notebook.messages;
    const messages = [...originalMessages, user, answer];
    const refresh = () => setNotebooks(list => list.map(n => n.id === target ? { ...n, messages: messages.map(m => ({ ...m })) } : n));
    setDraft(''); setContext(undefined); setChatError(''); setBusy(true); streaming.current = true;
    abort.current = new AbortController(); refresh();
    try {
      await streamChat({ question: fullQuestion, history: originalMessages.filter(m => m.content).slice(-12).map(({ role, content }) => ({ role, content: content.slice(0, 16000) })), sources: selectedSources.map(({ id, name, pages }) => ({ id, name, pages })) }, abort.current.signal, text => { answer.content += text; refresh(); }, citations => { answer.citations = citations; refresh(); });
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) setChatError(error instanceof Error ? error.message : 'Unable to send this question.');
      if (!answer.content) messages.pop();
    } finally {
      refresh();
      // Merge into the current notebook so notes edited during streaming remain intact.
      setNotebooks(list => list.map(n => { if (n.id !== target) return n; const updated = { ...n, messages: messages.map(m => ({ ...m })) }; void storage.notebook(updated).catch(reportStorageError); return updated; }));
      setBusy(false); streaming.current = false;
    }
  };
  if (!ready) return <div className="boot"><Brand /><span>Making room for your ideas…</span></div>;
  return <div className={`app ${sidebarOpen ? 'sidebar-open' : ''} ${panelOpen ? '' : 'panel-hidden'}`} onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }} onDrop={e => { if (e.dataTransfer.files.length) { e.preventDefault(); void addFiles(e.dataTransfer.files); } }}>
    <input ref={input} className="sr-only" type="file" accept=".pdf,.pptx" multiple onChange={e => { if (e.target.files) void addFiles(e.target.files); }} aria-label="Upload sources" />
    {sidebarOpen && <button className="sidebar-backdrop" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} />}
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setModal('library'); }}><Brand /><strong>Nemo<span>Doc</span></strong><span className="beta-label">BETA</span></a>
      <div className="workspace-label">YOUR WORKSPACE</div>
      <button className="nav-item" onClick={() => setModal('library')}><Grid2X2 size={17} />All notebooks<span>{notebooks.length}</span></button>
      <button className="nav-item current" onClick={() => setModal('library')}><BookOpen size={17} />{notebook?.title ?? 'Notebook'}<ChevronDown size={14} /></button>
      <div className="sidebar-section-heading"><span>SOURCES</span><span>{notebookSources.length}</span></div>
      <button className="add-source" disabled={!!importing || !notebook} onClick={() => input.current?.click()}>{importing ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}Add source</button>
      <label className="source-search"><Search size={14} /><input aria-label="Filter sources" placeholder="Find a source…" value={filter} onChange={e => setFilter(e.target.value)} /><span>⌕</span></label>
      {notebookSources.length > 0 && <label className="select-all"><input type="checkbox" checked={enabledSources.length === notebookSources.length} onChange={e => setEnabled(prev => { const next = new Set(prev); notebookSources.forEach(s => { if (e.target.checked) next.add(s.id); else next.delete(s.id); }); return next; })} /><span>Select all sources</span></label>}
      <div className="source-list">{notebookSources.filter(s => s.name.toLowerCase().includes(filter.toLowerCase())).map(s => <div key={s.id} className={`source-row ${sourceId === s.id ? 'active' : ''}`}><input type="checkbox" aria-label={`Use ${s.name} in chat`} checked={enabled.has(s.id)} onChange={e => setEnabled(prev => { const next = new Set(prev); if (e.target.checked) next.add(s.id); else next.delete(s.id); return next; })} /><button className="source-open" onClick={() => openSource(s.id)}><span className={`source-document-icon ${s.kind}`}><FileText size={17} /></span><span><strong>{s.name.replace(/\.(pdf|pptx)$/i, '')}</strong><small>{s.kind.toUpperCase()} · {s.pages.length} {s.kind === 'pptx' ? 'slides' : 'pages'}</small></span></button><button className="source-remove icon-button small" aria-label={`Remove ${s.name}`} title="Remove source" onClick={() => void removeSource(s)}><X size={13} /></button></div>)}{!notebookSources.length && <div className="source-empty"><Layers size={25} strokeWidth={1.3} /><p>Your ideas start here.</p><span>Drop a PDF or slide deck<br />anywhere in this workspace.</span></div>}</div>
      <div className="sidebar-spacer" />
      <div className="local-card"><span className="local-symbol"><ShieldCheck size={18} /></span><div><strong>A space of your own</strong><p>Documents & notes stay<br />in this browser.</p></div><span className="status-dot" /></div>
      <div className="sidebar-bottom"><button onClick={() => setModal('settings')}><Settings2 size={16} />Settings</button><button aria-label="Help and shortcuts" onClick={() => setModal('help')}><CircleHelp size={17} /></button></div>
      <div className="profile"><span className="avatar">Y</span><div><strong>Your workspace</strong><small>Local notebook</small></div><Leaf size={15} /></div>
    </aside>
    <main className="workspace">
      <header className="workspace-header"><div className="breadcrumbs"><button className="icon-button mobile-menu" aria-label="Open sidebar" onClick={() => setSidebarOpen(true)}><Menu size={19} /></button><span>My notebooks</span><ChevronRight size={13} /><strong>{notebook?.title ?? 'Welcome'}</strong></div><div className="header-actions"><span className="saved-indicator"><Check size={13} />Saved locally</span><button className="subtle-button" onClick={exportNotes} disabled={!notebook}><Download size={14} /><span>Export notes</span></button><button className="icon-button" aria-label={panelOpen ? 'Hide assistant' : 'Show assistant'} onClick={() => setPanelOpen(!panelOpen)}>{panelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}</button></div></header>
      <div className="notebook-header"><div><div className="eyebrow"><span />A SPACE FOR YOUR IDEAS</div><h1>{notebook?.title ?? 'Your first notebook'}</h1><p>{notebook?.description || 'Read a little deeper. Connect a little more.'}</p></div><button className="model-chip" onClick={() => setModal('settings')}><span className="nvidia-mark">N</span><div><span>POWERED BY</span><strong>NVIDIA Nemotron</strong></div><ChevronDown size={13} /></button></div>
      {saveError && <div className="storage-error" role="alert">{saveError}</div>}
      <div className="work-area"><Reader source={source} annotations={annotations} page={page} setPage={setPage} onAnnotate={addAnnotation} onAsk={askSelection} onSelectAnnotation={selectAnnotation} onUpload={() => input.current?.click()} />
        <aside className="assistant-panel" aria-label="Notebook assistant"><div className="panel-tabs"><div><button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}><Sparkles size={16} />Chat</button><button className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}><NotebookPen size={16} />Notes{notebookAnnotations.length > 0 && <span className="count-badge">{notebookAnnotations.length}</span>}</button></div><button className="icon-button small" title="New notebook" aria-label="New notebook" disabled={busy} onClick={() => setModal('new')}><Plus size={17} /></button></div>
        {tab === 'chat' ? <><div className="chat-scroll">{!notebook?.messages.length ? <div className="chat-welcome"><div className="assistant-orbit"><Brand /><span className="orbit-dot" /></div><div className="eyebrow">THINK TOGETHER</div><h2>A fresh perspective,<br />a question away.</h2><p>Explore your sources, untangle an idea,<br />and see how the pieces connect.</p><div className="prompt-cards"><button onClick={() => void send('Summarize the key ideas in my sources.')} disabled={busy || !notebookSources.length}><span className="prompt-icon violet"><FileText size={17} /></span><span><strong>Find the big picture</strong><small>A summary of the key ideas</small></span><ArrowRight size={15} /></button><button onClick={() => void send('What connections can you find between the ideas in my sources?')} disabled={busy || !notebookSources.length}><span className="prompt-icon green"><Layers size={17} /></span><span><strong>Connect the dots</strong><small>Discover themes across sources</small></span><ArrowRight size={15} /></button><button onClick={() => void send('Create five thoughtful study questions with short answers based on these sources.')} disabled={busy || !notebookSources.length}><span className="prompt-icon peach"><MessageSquare size={17} /></span><span><strong>Go a little deeper</strong><small>Questions worth thinking about</small></span><ArrowRight size={15} /></button></div><div className="grounded-note"><BookOpen size={14} /><span>Answers grounded in your sources.</span></div></div> : <div className="messages" aria-live="polite">{notebook.messages.map(m => <div key={m.id} className={`message ${m.role}`}>{m.role === 'assistant' && <div className="message-author"><Brand small /><strong>NemoDoc</strong></div>}{m.content ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => href?.startsWith('#citation-') ? <button className="inline-citation" onClick={() => { const c = m.citations?.find(c => c.id === Number(href.slice(10))); if (c) openSource(c.sourceId, c.page); }}>{children}</button> : <a href={href} target="_blank" rel="noreferrer">{children}</a> }}>{m.content.replace(/\[(\d+)\](?!\()/g, (_, n) => m.citations?.some(c => c.id === Number(n)) ? `[${n}](#citation-${n})` : `[${n}]`)}</ReactMarkdown> : <div className="thinking"><span /><span /><span /><small>Reading your sources</small></div>}{m.role === 'assistant' && m.content && !!m.citations?.length && <div className="citation-list">{m.citations.filter(c => new RegExp(`\\[${c.id}\\]`).test(m.content)).map(c => <button key={c.id} title={c.text} onClick={() => openSource(c.sourceId, c.page)}><span>{c.id}</span>{c.sourceName.replace(/\.(pdf|pptx)$/i, '').slice(0, 23)}<small>p. {c.page}</small></button>)}</div>}</div>)}</div>}<div ref={chatBottom} /></div>
          <div className="chat-composer-area">{chatError && <div className="chat-error" role="alert">{chatError}<button aria-label="Dismiss chat error" className="icon-button small" onClick={() => setChatError('')}><X size={13} /></button></div>}{context && <div className="quote-context"><div><span>Selected passage · p. {context.page}</span><p>{context.quote}</p></div><button className="icon-button small" aria-label="Clear selected passage" onClick={() => setContext(undefined)}><X size={14} /></button></div>}<form className="composer" onSubmit={e => { e.preventDefault(); void send(); }}><textarea ref={composer} aria-label="Ask about your sources" placeholder="Ask about your sources…" value={draft} maxLength={8000} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} rows={2} /><div><span><Layers size={13} />{context ? 'Selected passage' : `${enabledSources.length} ${enabledSources.length === 1 ? 'source' : 'sources'}`}</span>{busy ? <button type="button" className="send-button stop" aria-label="Stop answer" onClick={() => abort.current?.abort()}><Square size={13} fill="currentColor" /></button> : <button className="send-button" aria-label="Send question" disabled={!draft.trim() || !notebookSources.length}><ArrowUp size={18} /></button>}</div></form><div className="chat-footnote"><span className={`status-dot ${status.configured ? '' : 'offline'}`} />{status.configured ? status.local ? 'Local NVIDIA inference' : 'NVIDIA Nemotron · source grounded' : <button onClick={() => setModal('settings')}>Connect NVIDIA to start a conversation <ArrowRight size={11} /></button>}</div></div></> : <div className="notes-scroll"><div className="notes-intro"><span className="eyebrow">MAKE IT YOURS</span><h2>Thoughts in the margins.</h2><p>A home for the ideas you want to keep.</p></div><div className="notebook-note"><label htmlFor="notebook-note"><NotebookPen size={15} />Notebook notes<span><Check size={12} />Auto-saved</span></label><textarea id="notebook-note" aria-label="Notebook notes" placeholder="An idea, a connection, a question…" value={notebook?.notes ?? ''} onChange={e => { if (notebook) updateNotebook({ ...notebook, notes: e.target.value }); }} /></div><div className="notes-section-title">HIGHLIGHTS & ANNOTATIONS<span>{notebookAnnotations.length}</span></div>{!notebookAnnotations.length ? <div className="notes-empty"><NotebookPen size={28} strokeWidth={1.2} /><p>Select a passage in your document<br />and choose Highlight or Note.</p><span>For scanned pages, use the area highlight tool.</span></div> : notebookAnnotations.sort((a, b) => b.createdAt - a.createdAt).map(a => <div key={a.id} className={`annotation-card ${a.color} ${a.id === selectedAnnotation ? 'focused' : ''}`}><div><button className="annotation-source" onClick={() => openSource(a.sourceId, a.page)}><FileText size={12} />{sources.find(s => s.id === a.sourceId)?.name.replace(/\.(pdf|pptx)$/i, '').slice(0, 26)}<span>p. {a.page}</span></button><button className="icon-button small" aria-label="Delete annotation" onClick={() => void removeAnnotation(a)}><Trash2 size={13} /></button></div><blockquote>{a.quote}</blockquote><textarea aria-label="Annotation note" placeholder="Add your thought…" value={a.note} autoFocus={activeAnnotation?.id === a.id} onFocus={() => setSelectedAnnotation(a.id)} onChange={e => editAnnotation({ ...a, note: e.target.value })} /><div className="annotation-colors">{(['yellow', 'mint', 'lavender'] as const).map(c => <button key={c} aria-label={`Change annotation to ${c}`} className={`color-dot ${c} ${a.color === c ? 'chosen' : ''}`} onClick={() => editAnnotation({ ...a, color: c })} />)}</div></div>)}</div>}
        </aside>
      </div><footer className="workspace-footer"><span><Leaf size={12} />Less noise. More meaning.</span><span>NemoDoc <span className="footer-separator">/</span> Your local thinking space</span></footer>
    </main>
    {toast && <div className="toast" role="status"><Check size={16} /><span>{toast.message}</span>{toast.undo && <button onClick={toast.undo}>Undo</button>}<button className="icon-button small" aria-label="Dismiss notification" onClick={() => setToast(undefined)}><X size={13} /></button></div>}
    {importing && <div className="import-progress" role="status"><LoaderCircle className="spin" size={17} /><span>{importing}</span></div>}
    {modal === 'new' && <Modal title="A new place to think" onClose={() => setModal(null)}><p className="modal-description">Bring related sources together in a notebook.</p><form onSubmit={e => { e.preventDefault(); void createNotebook(); }}><label className="form-label">Notebook title<input autoFocus placeholder="What are you exploring?" maxLength={80} value={title} onChange={e => setTitle(e.target.value)} required /></label><label className="form-label">A little context <span>optional</span><input placeholder="A few words about this collection" maxLength={160} value={description} onChange={e => setDescription(e.target.value)} /></label><button className="primary-button modal-submit" disabled={!title.trim()}><Plus size={16} />Create notebook</button></form></Modal>}
    {modal === 'library' && <Modal title="Your notebooks" onClose={() => setModal(null)}><p className="modal-description">A collection of things worth understanding.</p><div className="library-grid">{notebooks.map(n => <button key={n.id} className={`notebook-card ${activeId === n.id ? 'active' : ''}`} onClick={() => openNotebook(n.id)}><span className="notebook-cover"><BookOpen size={28} strokeWidth={1.3} /></span><strong>{n.title}</strong><p>{n.description || 'Room for your ideas'}</p><span>{sources.filter(s => s.notebookId === n.id).length} sources<ArrowRight size={14} /></span></button>)}<button className="notebook-card new-card" disabled={busy} onClick={() => setModal('new')}><Plus size={26} /><strong>New notebook</strong><p>Start with a little curiosity.</p></button></div></Modal>}
    {modal === 'settings' && <Modal title="Your AI connection" onClose={() => setModal(null)}><div className="connection-status"><span className={`status-dot ${status.configured ? '' : 'offline'}`} /><strong>{status.configured ? 'Endpoint configured' : 'NVIDIA connection needs a key'}</strong></div><p className="modal-description">NemoDoc uses NVIDIA's open Nemotron model. Set the connection in the project's <code>.env</code> file and restart the server.</p><pre className="config-example">NVIDIA_API_KEY=your-key-here{'\n'}NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1{'\n'}NVIDIA_MODEL=nvidia/nemotron-3-nano-30b-a3b</pre><a className="primary-button" href="https://build.nvidia.com/settings/api-keys" target="_blank" rel="noreferrer">Get an NVIDIA API key<ArrowRight size={15} /></a><div className="settings-divider" /><h3>Prefer local inference?</h3><p className="modal-description">Point <code>NVIDIA_BASE_URL</code> to your running NVIDIA NIM endpoint (for example, <code>http://127.0.0.1:8000/v1</code>) and set its model ID. A loopback endpoint can run without an API key.</p><div className="privacy-note"><ShieldCheck size={19} /><p>Documents and notes stay in this browser. When you ask a question, retrieved text excerpts and conversation messages go to your configured model endpoint.</p></div><small className="settings-model">Configured model: {status.model}</small></Modal>}
    {modal === 'help' && <Modal title="A few things to know" onClose={() => setModal(null)}><div className="help-list"><div><Upload size={20} /><p><strong>Bring your sources</strong>Drop a PDF or .pptx anywhere. Up to 50 MB and 500 pages per source. Export complex slide decks to PDF for the best fidelity.</p></div><div><NotebookPen size={20} /><p><strong>Read actively</strong>Select text to highlight, annotate, or ask AI. Use the area highlight tool for images and scanned pages.</p></div><div><BookOpen size={20} /><p><strong>Find your rhythm</strong>Choose vertical, horizontal, or book view. Use ← and → to turn pages. Enter sends a question; Shift + Enter adds a line.</p></div><div><FolderOpen size={20} /><p><strong>Keep what matters</strong>Your library persists in this browser. Download originals and export notes before clearing site data. OCR and legacy .ppt import are not included in this MVP.</p></div></div></Modal>}
  </div>;
}
