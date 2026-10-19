export interface ModelRequestDetails {
  url: string;
  model: string;
  target?: string;
  body: unknown;
  at: number;
}

export interface ModelResponseDetails {
  status: number;
  requestId?: string;
  returnedModel?: string;
  responseId?: string;
  finishReason?: string;
  usage?: unknown;
  promptTokens?: number;
  completionTokens?: number;
  body?: unknown;
  errorBody?: string;
  at: number;
}

export interface ModelRequestObserver {
  onRequest?(details: ModelRequestDetails): unknown | Promise<unknown>;
  onResponse?(details: ModelResponseDetails): unknown | Promise<unknown>;
  onError?(error: string, at: number): unknown | Promise<unknown>;
}

export async function notifyModelObserver(
  callback: (() => unknown | Promise<unknown>) | undefined,
) {
  try {
    await callback?.();
  } catch {
    // Observability failure is recorded by the trace spool and must not hide
    // the result of a provider request.
  }
}
