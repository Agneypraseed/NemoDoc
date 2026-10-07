import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Notebook, Source } from '../types';

export async function createDemo(): Promise<{ notebook: Notebook; sources: Source[] }> {
  const notebook: Notebook = { id: 'welcome', title: 'The thoughtful interface', description: 'A small collection of big ideas.', createdAt: Date.now(), notes: '', messages: [] };
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const ink = rgb(.14, .18, .22), muted = rgb(.44, .49, .51), green = rgb(.17, .36, .30);
  const cover = pdf.addPage([612, 792]);
  cover.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(.98, .975, .957) });
  cover.drawText('FIELD NOTES   /   001', { x: 54, y: 730, size: 10, font: bold, color: green });
  cover.drawLine({ start: { x: 54, y: 708 }, end: { x: 558, y: 708 }, thickness: .6, color: rgb(.78, .81, .76) });
  cover.drawText('Designing for', { x: 54, y: 619, size: 47, font: serif, color: ink });
  cover.drawText('human attention.', { x: 54, y: 563, size: 47, font: serif, color: ink });
  cover.drawText('Less noise. More meaning.', { x: 56, y: 514, size: 13, font: regular, color: muted });
  // An original geometric composition, drawn directly into the sample PDF.
  cover.drawRectangle({ x: 54, y: 166, width: 504, height: 290, color: rgb(.86, .90, .84) });
  cover.drawCircle({ x: 306, y: 311, size: 112, color: rgb(.69, .77, .62) });
  cover.drawCircle({ x: 306, y: 311, size: 80, color: rgb(.78, .85, .72) });
  cover.drawCircle({ x: 306, y: 311, size: 49, color: rgb(.94, .95, .85) });
  cover.drawCircle({ x: 306, y: 311, size: 18, color: green });
  for (let i = 0; i < 7; i++) cover.drawLine({ start: { x: 54, y: 193 + i * 39 }, end: { x: 558, y: 193 + i * 39 }, color: rgb(.98, .98, .93), thickness: .4, opacity: .5 });
  cover.drawText('A practical essay on calm, clarity, and digital spaces', { x: 54, y: 113, size: 11, font: regular, color: ink });
  cover.drawText('NEMODOC STUDIO', { x: 54, y: 69, size: 9, font: bold, color: green });
  cover.drawText('READING COLLECTION / 2026', { x: 363, y: 69, size: 8, font: regular, color: muted });
  const chapters = [
    { title: 'Attention is a finite resource', kicker: '01 / THE STARTING POINT', paragraphs: [
      'Every interface asks for a little of our attention. A notification, a toolbar, a choice: each carries a cost. Good design begins by noticing that cost and spending it carefully.',
      'Clarity is not the absence of information. It is the careful arrangement of information so that the next useful action feels obvious. A quiet interface can still be powerful.',
      'When the surrounding tools recede, the work comes forward. Reading becomes easier when navigation is predictable, typography is comfortable, and the document has room to breathe.',
      'Design principle: make the primary task visually dominant. Keep supporting actions close, but give them less visual weight. Attention should follow purpose, not decoration.',
    ] },
    { title: 'The shape of a reading space', kicker: '02 / SPACE AND RHYTHM', paragraphs: [
      'A document reader is a place, not merely a container. Its margins, page rhythm, and scrolling behavior influence how we understand the ideas inside it.',
      'Vertical scrolling supports continuous reading and quick scanning. Horizontal paging creates a deliberate cadence. A two-page spread invites comparison and gives long-form writing the familiar rhythm of a book.',
      'There is no single correct reading mode. The best tools preserve agency: people can choose a layout that matches their task and change it without losing their position.',
      'Design principle: maintain spatial continuity. A highlight belongs to the passage that inspired it, even when the page is resized or the reading mode changes.',
    ] },
    { title: 'Thinking in the margins', kicker: '03 / ACTIVE READING', paragraphs: [
      'A highlight is a small act of attention. An annotation turns that attention into a thought we can return to. Together they make reading an active conversation with a source.',
      'Notes are most useful when they keep their context. Store the original passage, the page number, and the reader\'s own interpretation together. A note without its source quickly becomes difficult to trust.',
      'Use color sparingly and consistently. Yellow can mark a central idea, green can mark a connection, and violet can mark a question. The meaning belongs to the reader.',
      'Design principle: let people capture a thought at the point of discovery. Avoid moving them into a separate workflow before the thought is safely recorded.',
    ] },
    { title: 'A companion, grounded in sources', kicker: '04 / ASSISTED UNDERSTANDING', paragraphs: [
      'An AI reading companion should help us return to the source. A useful answer explains an idea, identifies the supporting passage, and makes that passage easy to inspect.',
      'Retrieval selects relevant excerpts from a document before a model answers. The model receives those excerpts as context and refers to them with citations. This keeps the conversation attached to evidence.',
      'Source-grounded assistance still has limits. A retrieved excerpt is not the entire document. A responsible answer distinguishes what is supported from what remains uncertain.',
      'Design principle: use AI to open a path into the material. Keep the source visible and let the reader decide how to interpret it.',
    ] },
    { title: 'Small details, lasting clarity', kicker: '05 / PUTTING IT TOGETHER', paragraphs: [
      'The best reading tools are composed of small, considered decisions: a toolbar that stays within reach, a page that keeps its place, a note that saves without interrupting.',
      'Responsive feedback makes an interface feel dependable. Restrained movement helps explain where an element came from. Reduced-motion preferences should preserve clarity while removing unnecessary movement.',
      'Local persistence lets the reading space feel personal. Documents, highlights, and notes can remain on the device. Hosted AI calls should clearly explain when excerpts leave it.',
      'A thoughtful interface protects attention, supports agency, preserves context, and makes evidence easy to revisit. These four qualities provide a practical foundation for a calm digital workspace.',
    ] },
  ];
  for (const [index, chapter] of chapters.entries()) {
    const page = pdf.addPage([612, 792]);
    page.drawText(chapter.kicker, { x: 56, y: 721, size: 9, font: bold, color: green });
    page.drawText(chapter.title, { x: 56, y: 661, size: 27, font: serif, color: ink });
    let y = 611;
    for (const paragraph of chapter.paragraphs) {
      const words = paragraph.split(' '); let line = '';
      for (const word of words) {
        if (regular.widthOfTextAtSize(line + word, 12) > 494) {
          page.drawText(line.trim(), { x: 56, y, size: 12, font: regular, color: ink }); y -= 21; line = '';
        }
        line += word + ' ';
      }
      page.drawText(line.trim(), { x: 56, y, size: 12, font: regular, color: ink }); y -= 46;
    }
    page.drawLine({ start: { x: 56, y: 78 }, end: { x: 556, y: 78 }, color: rgb(.84, .86, .83), thickness: .5 });
    page.drawText('DESIGNING FOR HUMAN ATTENTION', { x: 56, y: 56, size: 8, font: regular, color: muted });
    page.drawText(String(index + 2).padStart(2, '0'), { x: 540, y: 56, size: 9, font: regular, color: muted });
  }
  const data = await pdf.save();
  const blob = new Blob([new Uint8Array(data)], { type: 'application/pdf' });
  const pages = ['Designing for human attention. Less noise. More meaning. A practical essay on calm, clarity, and digital spaces. NemoDoc Studio.', ...chapters.map(c => c.title + '\n' + c.paragraphs.join('\n'))];
  return { notebook, sources: [{ id: 'sample-paper', notebookId: notebook.id, name: 'Designing for human attention.pdf', kind: 'pdf', blob, pages, size: blob.size, createdAt: Date.now() }] };
}
