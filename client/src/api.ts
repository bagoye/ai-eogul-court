import type { Trial } from '../../shared/types';
export class APIError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}
export async function api<T>(url: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${url}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    throw new APIError(
      '서버에 연결하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.',
      'NETWORK',
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new APIError(
      data?.error?.message || '요청을 처리하지 못했습니다.',
      data?.error?.code || 'UNKNOWN',
    );
  return data as T;
}
export const getTrial = (id: string) => api<Trial>(`/trials/${id}`);
