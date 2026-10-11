export interface InputSource {
  id: string;
  name: string;
  pages: string[];
}
export interface Excerpt {
  id: number;
  sourceId: string;
  sourceName: string;
  page: number;
  text: string;
}
export interface SelectedPassage {
  sourceId: string;
  page: number;
  quote: string;
}

// A word selection needs the surrounding page, not a search for generic
// instructions such as "define the selected term" across the whole book.
export function selectedPageEvidence(
  sources: InputSource[],
  selection: SelectedPassage,
): Excerpt[] {
  const matches = sources.filter((source) => source.id === selection.sourceId);
  const source = matches.length === 1 ? matches[0] : undefined;
  const normalize = (text: string) =>
    text
      .normalize("NFKC")
      .replace(/\u00ad/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const page = normalize(source?.pages[selection.page - 1] ?? "");
  const quote = normalize(selection.quote);
  const index = page.indexOf(quote);
  if (!source || !quote || index < 0) return [];
  const start = Math.max(0, index - 2000);
  const end = Math.min(page.length, index + quote.length + 4000);
  return [
    {
      id: 1,
      sourceId: source.id,
      sourceName: source.name,
      page: selection.page,
      text: page.length <= 18000 ? page : page.slice(start, end),
    },
  ];
}
const stopwords = new Set(
  "the a an of to and or in on is are was were it this that with for from be as at by what how why can could would should me my please summarize summary explain give key ideas main document sources".split(
    " ",
  ),
);
const terms = (text: string) =>
  text
    .toLowerCase()
    .match(/[\p{L}\p{N}]{2,}/gu)
    ?.filter((t) => !stopwords.has(t)) ?? [];

export function retrieve(
  sources: InputSource[],
  question: string,
  limit = 10,
  allowFallback = true,
): Excerpt[] {
  const chunks: (Omit<Excerpt, "id"> & { index: number; score: number })[] = [];
  for (const source of sources) {
    source.pages.forEach((page, index) => {
      for (let start = 0; start < page.length; start += 1200) {
        const text = page.slice(start, start + 1500).trim();
        if (text)
          chunks.push({
            sourceId: source.id,
            sourceName: source.name,
            page: index + 1,
            text,
            index: chunks.length,
            score: 0,
          });
      }
    });
  }
  const query = [...new Set(terms(question))];
  const tokenized = chunks.map((c) => terms(c.text));
  for (const term of query) {
    const frequency = tokenized.filter((t) => t.includes(term)).length;
    const idf = Math.log(
      1 + (chunks.length - frequency + 0.5) / (frequency + 0.5),
    );
    tokenized.forEach((tokens, i) => {
      const count = tokens.filter((t) => t === term).length;
      chunks[i].score +=
        (idf * count * 2.2) /
        (count + 1.2 * (0.25 + (0.75 * tokens.length) / 220));
    });
  }
  // Overview questions get a representative spread across documents and pages.
  const overview =
    !query.length ||
    /summari[sz]e|overview|main ideas|key takeaways/i.test(question);
  let selected = chunks
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, overview ? Math.floor(limit / 2) : limit);
  const candidates = chunks.filter((c) => !selected.includes(c));
  if (overview || (!selected.length && allowFallback)) {
    const pages = candidates.filter(
      (c, i) =>
        !candidates
          .slice(0, i)
          .some((p) => p.sourceId === c.sourceId && p.page === c.page),
    );
    const slots = limit - selected.length;
    for (let i = 0; i < slots && i < pages.length; i++)
      selected.push(
        pages[Math.floor((i * pages.length) / Math.min(slots, pages.length))],
      );
  }
  selected = selected.sort((a, b) => a.index - b.index);
  return selected.map(({ sourceId, sourceName, page, text }, i) => ({
    id: i + 1,
    sourceId,
    sourceName,
    page,
    text,
  }));
}
