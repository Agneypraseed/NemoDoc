import type { Citation, Message, Source } from "../types";
export const wantsPages = (question: string) =>
  /\b(show|return|give|display|attach|send)\b[^\n]*\b(pages?|slides?)\b/i.test(
    question,
  );
export const pageOnlyRequest = (question: string) =>
  (wantsPages(question) ||
    /^\s*(page|slide)\s*\d+\s*[.!?]?\s*$/i.test(question)) &&
  !/\b(explain|summari[sz]e|summary|analy[sz]e|compare|describe|translate|why|how|what|question|answer|discuss|teach|interpret)\b/i.test(
    question,
  );
export function explicitPage(
  question: string,
  sources: Source[],
): Citation | undefined {
  const match = question.match(/\b(page|slide)\s*(\d+)\b/i);
  if (!match) return;
  const named = sources.filter(
    (s) =>
      question.toLowerCase().includes(s.name.toLowerCase()) ||
      question
        .toLowerCase()
        .includes(s.name.replace(/\.(pdf|pptx)$/i, "").toLowerCase()),
  );
  if (!named.length && /\.(pdf|pptx)\b/i.test(question))
    throw new Error(
      "The named source is not selected or is unavailable. Select it in the sidebar.",
    );
  const pool = named.length ? named : sources;
  const decks = pool.filter((s) => s.kind === "pptx");
  // Lectures exported to PDF still have numbered slides. Prefer a selected deck
  // for unnamed slide requests, but respect an explicitly named PDF lecture.
  const candidates =
    match[1].toLowerCase() === "slide" && !named.length && decks.length
      ? decks
      : pool;
  if (candidates.length !== 1)
    throw new Error(
      "Choose one source in the sidebar, or include its filename, to identify the requested page or slide.",
    );
  const source = candidates[0],
    page = Number(match[2]);
  if (page < 1 || page > source.pages.length)
    throw new Error(
      `${source.name} has ${source.pages.length} ${source.kind === "pptx" ? "slides" : "pages"}. Choose a number in that range.`,
    );
  return {
    id: 1,
    sourceId: source.id,
    sourceName: source.name,
    page,
    text: source.pages[page - 1].slice(0, 1500),
  };
}
export function supportingPages(message: Message, sources: Source[]) {
  const groups = new Map<
    string,
    { citation: Citation; source?: Source; excerpts: string[]; error?: string }
  >();
  for (const c of message.citations ?? []) {
    if (
      !Number.isInteger(c.id) ||
      c.id < 1 ||
      !new RegExp(`\\[${c.id}\\]`).test(message.content)
    )
      continue;
    const key = `${c.sourceId}:${c.page}`;
    const source = sources.find((s) => s.id === c.sourceId);
    const page = source?.pages[c.page - 1];
    const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
    const error = !source
      ? "Source removed or unavailable. Restore its backup to view this page."
      : !Number.isInteger(c.page) || c.page < 1 || page === undefined
        ? "Invalid page reference."
        : c.text && !normalize(page).includes(normalize(c.text))
          ? "Evidence does not match the stored page. Preview withheld."
          : undefined;
    const group = groups.get(key) ?? {
      citation: c,
      source,
      excerpts: [],
      error,
    };
    if (error) group.error = error;
    if (c.text && !group.excerpts.includes(c.text)) group.excerpts.push(c.text);
    groups.set(key, group);
  }
  return [...groups.values()];
}
