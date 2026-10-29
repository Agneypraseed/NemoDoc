import { Brand } from "./Brand";

export function NotebookLoading() {
  return (
    <div className="boot" role="status">
      <Brand />
      <span>Loading notebook…</span>
    </div>
  );
}
