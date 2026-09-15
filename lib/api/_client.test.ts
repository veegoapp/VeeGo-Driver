// Mock the auth token store before importing the module under test so the
// module-level `_rawApiUrl` guard (which reads EXPO_PUBLIC_API_URL) and every
// getToken/getRefreshToken/saveToken call resolve to controllable fakes.
const mockGetToken = jest.fn();
const mockGetRefreshToken = jest.fn();
const mockSaveToken = jest.fn().mockResolvedValue(undefined);
const mockSaveRefreshToken = jest.fn().mockResolvedValue(undefined);
const mockDeleteToken = jest.fn().mockResolvedValue(undefined);
const mockDeleteRefreshToken = jest.fn().mockResolvedValue(undefined);

jest.mock('../auth', () => ({
  getToken: () => mockGetToken(),
  getRefreshToken: () => mockGetRefreshToken(),
  saveToken: (t: string) => mockSaveToken(t),
  saveRefreshToken: (t: string) => mockSaveRefreshToken(t),
  deleteToken: () => mockDeleteToken(),
  deleteRefreshToken: () => mockDeleteRefreshToken(),
}));

import {
  api,
  ApiError,
  refreshAccessToken,
  setOnAccountSuspended,
  setOnSessionCleared,
} from './_client';

function jsonResponse(status: number, body: unknown, ok = status >= 200 && status < 300) {
  return {
    ok,
    status,
    statusText: 'status',
    headers: { get: () => null },
    clone() { return jsonResponse(status, body, ok); },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('api client — request()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetToken.mockResolvedValue('access-token');
    mockGetRefreshToken.mockResolvedValue('refresh-token');
    globalThis.fetch = jest.fn();
  });

  it('attaches the bearer token and content headers on a GET request', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { ok: true }));

    await api.get('/driver/me');

    const [, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(init.headers['Authorization']).toBe('Bearer access-token');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('omits the Authorization header when no token is stored', async () => {
    mockGetToken.mockResolvedValue(null);
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, {}));

    await api.get('/public/config');

    const [, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(init.headers['Authorization']).toBeUndefined();
  });

  it('resolves with the parsed JSON body on success', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { id: 1, name: 'x' }));

    const result = await api.get<{ id: number; name: string }>('/thing');

    expect(result).toEqual({ id: 1, name: 'x' });
  });

  it('returns undefined for a 204 No Content response', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse(204, null));

    const result = await api.del('/thing/1');

    expect(result).toBeUndefined();
  });

  it('serializes the request body for POST/PATCH', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, {}));

    await api.post('/thing', { a: 1 });

    const [, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it('wraps a fetch rejection in an ApiError with status 0', async () => {
    (globalThis.fetch as jest.Mock).mockRejectedValue(new Error('offline'));

    await expect(api.get('/thing')).rejects.toMatchObject(new ApiError(0, 'Network error', null));
  });

  it('throws ApiError with the parsed body for a non-2xx JSON response', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse(422, { message: 'bad input' }));

    await expect(api.post('/thing', {})).rejects.toMatchObject({
      status: 422,
      body: { message: 'bad input' },
    });
  });

  it('retries once after a successful silent refresh on 401', async () => {
    (globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(401, null, false)) // original request
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'new-token' })) // refresh call
      .mockResolvedValueOnce(jsonResponse(200, { data: 'ok' })); // retried request

    const result = await api.get<{ data: string }>('/thing');

    expect(result).toEqual({ data: 'ok' });
    expect(mockSaveToken).toHaveBeenCalledWith('new-token');
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it('clears the session and rejects when the refresh token itself is rejected (401)', async () => {
    const onSessionCleared = jest.fn();
    setOnSessionCleared(onSessionCleared);
    (globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(401, null, false)) // original request
      .mockResolvedValueOnce(jsonResponse(401, null, false)); // refresh rejected

    await expect(api.get('/thing')).rejects.toMatchObject({ status: 401 });

    expect(mockDeleteToken).toHaveBeenCalled();
    expect(mockDeleteRefreshToken).toHaveBeenCalled();
    expect(onSessionCleared).toHaveBeenCalled();
    setOnSessionCleared(undefined as any);
  });

  it('does NOT clear the session on a transient network/server error during refresh', async () => {
    const onSessionCleared = jest.fn();
    setOnSessionCleared(onSessionCleared);
    (globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(401, null, false)) // original request
      .mockRejectedValueOnce(new Error('refresh network error')); // refresh network failure

    await expect(api.get('/thing')).rejects.toMatchObject({ status: 401 });

    expect(mockDeleteToken).not.toHaveBeenCalled();
    expect(onSessionCleared).not.toHaveBeenCalled();
    setOnSessionCleared(undefined as any);
  });

  it('single-flights concurrent refresh calls into one network request', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { accessToken: 'shared-token' }));

    const [a, b] = await Promise.all([refreshAccessToken(), refreshAccessToken()]);

    expect(a).toBe('shared-token');
    expect(b).toBe('shared-token');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('invokes the account-suspended callback on a 403 with reason account_suspended', async () => {
    const onSuspended = jest.fn();
    setOnAccountSuspended(onSuspended);
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(403, { error: 'account_suspended' }, false),
    );

    await expect(api.get('/thing')).rejects.toMatchObject({ status: 403 });

    expect(onSuspended).toHaveBeenCalled();
    setOnAccountSuspended(undefined as any);
  });

  it('does not invoke the account-suspended callback for an unrelated 403', async () => {
    const onSuspended = jest.fn();
    setOnAccountSuspended(onSuspended);
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse(403, { error: 'forbidden' }, false));

    await expect(api.get('/thing')).rejects.toMatchObject({ status: 403 });

    expect(onSuspended).not.toHaveBeenCalled();
    setOnAccountSuspended(undefined as any);
  });
});
