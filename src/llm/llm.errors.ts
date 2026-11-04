export type LlmErrorCode = 'LLM_TIMEOUT' | 'LLM_INVALID_RESPONSE' | 'LLM_PROVIDER_ERROR';

export class LlmTimeoutError extends Error {
  readonly code: LlmErrorCode = 'LLM_TIMEOUT';

  constructor(message = 'LLM call timed out') {
    super(message);
    this.name = 'LlmTimeoutError';
  }
}

export class LlmInvalidResponseError extends Error {
  readonly code: LlmErrorCode = 'LLM_INVALID_RESPONSE';

  constructor(message: string) {
    super(message);
    this.name = 'LlmInvalidResponseError';
  }
}

export class LlmProviderError extends Error {
  readonly code: LlmErrorCode = 'LLM_PROVIDER_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'LlmProviderError';
  }
}
