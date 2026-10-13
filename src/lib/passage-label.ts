export function passageAction(question: string) {
  if (/^explain\b/i.test(question.trim())) return "Explain";
  if (/^define\b/i.test(question.trim())) return "Define";
  return "Ask";
}

export function passageTitle(question: string, quote: string) {
  const topic = quote.replace(/\s+/g, " ").trim();
  const short = topic.length > 90 ? `${topic.slice(0, 87)}…` : topic;
  return short ? `${passageAction(question)} · ${short}` : question;
}
