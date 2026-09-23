import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { AuthProvider, useAuth } from './authContext';

const mockGetToken = jest.fn();
const mockSaveToken = jest.fn().mockResolvedValue(undefined);
const mockDeleteToken = jest.fn().mockResolvedValue(undefined);
const mockSaveRefreshToken = jest.fn().mockResolvedValue(undefined);
const mockDeleteRefreshToken = jest.fn().mockResolvedValue(undefined);

jest.mock('./auth', () => ({
  getToken: () => mockGetToken(),
  saveToken: (t: string) => mockSaveToken(t),
  deleteToken: () => mockDeleteToken(),
  saveRefreshToken: (t: string) => mockSaveRefreshToken(t),
  deleteRefreshToken: () => mockDeleteRefreshToken(),
}));

const mockLogout = jest.fn();
jest.mock('./api', () => ({
  endpoints: { auth: { logout: () => mockLogout() } },
}));

const mockStopLocationTracking = jest.fn().mockResolvedValue(undefined);
jest.mock('./backgroundLocationTask', () => ({
  stopLocationTracking: () => mockStopLocationTracking(),
}));

async function setupHook() {
  return renderHook(() => useAuth(), {
    wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('AuthContext — full session lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetToken.mockResolvedValue(null);
    mockLogout.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts loading, resolves to an unauthenticated state when no token is stored, then logs in and out', async () => {
    const { result } = await setupHook();
    await flush();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.token).toBeNull();

    await act(async () => { await result.current.login('access-1', 'refresh-1'); });
    expect(result.current.token).toBe('access-1');
    expect(mockSaveToken).toHaveBeenCalledWith('access-1');
    expect(mockSaveRefreshToken).toHaveBeenCalledWith('refresh-1');

    await act(async () => { await result.current.logout(); });
    expect(result.current.token).toBeNull();
    expect(mockStopLocationTracking).toHaveBeenCalled();
    expect(mockLogout).toHaveBeenCalled();
    expect(mockDeleteToken).toHaveBeenCalled();
    expect(mockDeleteRefreshToken).toHaveBeenCalled();
  });

  it('picks up a previously stored token on mount (app relaunch while logged in)', async () => {
    mockGetToken.mockResolvedValue('stored-access-token');
    const { result } = await setupHook();
    await flush();

    expect(result.current.token).toBe('stored-access-token');
    expect(result.current.isLoading).toBe(false);
  });

  it('retries a SecureStore read failure before treating it as unauthenticated, instead of hanging', async () => {
    mockGetToken.mockRejectedValue(new Error('keychain locked'));
    const { result } = await setupHook();
    await flush();
    // Still retrying — a single rejection must not immediately log the
    // driver out, since a real token may exist and this may just be a
    // transient keychain read failure.
    expect(result.current.isLoading).toBe(true);

    // 3 retries, 400ms apart — advance past all of them.
    await act(async () => { jest.advanceTimersByTime(400); });
    await flush();
    await act(async () => { jest.advanceTimersByTime(400); });
    await flush();
    await act(async () => { jest.advanceTimersByTime(400); });
    await flush();

    expect(mockGetToken).toHaveBeenCalledTimes(3);
    expect(result.current.token).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('recovers from a transient SecureStore failure on retry instead of logging out a valid session', async () => {
    mockGetToken
      .mockRejectedValueOnce(new Error('keychain still waking up'))
      .mockResolvedValueOnce('stored-access-token');
    const { result } = await setupHook();
    await flush();
    expect(result.current.isLoading).toBe(true);

    await act(async () => { jest.advanceTimersByTime(400); });
    await flush();

    expect(result.current.token).toBe('stored-access-token');
    expect(result.current.isLoading).toBe(false);
  });

  it('completes local logout even when the server logout call fails (offline)', async () => {
    mockGetToken.mockResolvedValue('access-1');
    mockLogout.mockRejectedValue(new Error('network down'));
    const { result } = await setupHook();
    await flush();

    await act(async () => { await result.current.logout(); });

    expect(result.current.token).toBeNull();
    expect(mockDeleteToken).toHaveBeenCalled();
    expect(mockDeleteRefreshToken).toHaveBeenCalled();
  });

  it('clearLocalSession() force-clears credentials without any backend call', async () => {
    mockGetToken.mockResolvedValue('access-1');
    const { result } = await setupHook();
    await flush();

    await act(async () => { await result.current.clearLocalSession(); });

    expect(result.current.token).toBeNull();
    expect(mockStopLocationTracking).toHaveBeenCalled();
    expect(mockDeleteToken).toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();
  });
});
