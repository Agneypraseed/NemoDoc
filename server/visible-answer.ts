// Reasoning may arrive in a separate field (ignored by the caller) or inside
// tagged content. Never forward tagged reasoning, even across stream chunks.
export class VisibleAnswerStream {
  private buffer = "";
  private hidden = false;

  push(text: string) {
    this.buffer += text;
    return this.consume(false);
  }

  finish() {
    return this.consume(true);
  }

  private consume(final: boolean) {
    let answer = "";
    const tags = ["<think>", "</think>", "<analysis>", "</analysis>"];
    while (this.buffer) {
      const lower = this.buffer.slice(0, 11).toLowerCase();
      const tag = tags.find((value) => lower.startsWith(value));
      if (tag) {
        this.hidden = !tag.startsWith("</");
        this.buffer = this.buffer.slice(tag.length);
      } else if (!final && tags.some((value) => value.startsWith(lower))) {
        break;
      } else {
        if (!this.hidden) answer += this.buffer[0];
        this.buffer = this.buffer.slice(1);
      }
    }
    return answer;
  }
}
