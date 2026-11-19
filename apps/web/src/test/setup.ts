import '@testing-library/jest-dom/vitest';

/*
 * jsdom troca AbortController/AbortSignal pelos dele, mas `Request` continua sendo
 * o do Node (undici), que rejeita sinais de outro realm. O react-router cria um
 * `Request` com sinal a cada navegação; nos testes um sinal recusado é descartado.
 */
const NativeRequest = globalThis.Request;

function acceptsSignal(signal: AbortSignal): boolean {
  try {
    new NativeRequest('http://localhost/', { signal });
    return true;
  } catch {
    return false;
  }
}

class TestRequest extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    if (init?.signal && !acceptsSignal(init.signal)) {
      const { signal: _foreignSignal, ...rest } = init;
      super(input, rest);
    } else {
      super(input, init);
    }
  }
}

globalThis.Request = TestRequest as typeof Request;
