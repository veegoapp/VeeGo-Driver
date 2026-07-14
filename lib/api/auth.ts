import { request } from './_client';

export const authEndpoints = {
  logout: () => request<void>('POST', '/driver/auth/logout'),

  driverLogin: (credential: string, password: string) =>
    request<{
      accessToken: string;
      refreshToken: string;
      status: 'pending' | 'approved';
      serviceType: 'car' | 'shuttle' | 'scooter' | 'delivery' | null;
      user: Record<string, unknown>;
      driver: Record<string, unknown>;
    }>('POST', '/driver/auth/login', { credential, password }),

  driverRegister: (data: { name: string; email: string; phone: string; password: string; licenseNumber?: string; nationalId?: string }) =>
    request<{ requiresOtp: true; phone: string; maskedPhone: string }>(
      'POST', '/driver/auth/register', data
    ),

  // Public — tells the client which OTP delivery channels are currently
  // enabled (and which is preferred), so signup/forgot-password screens can
  // render a channel picker without hardcoding availability.
  otpChannels: () =>
    request<{ whatsappEnabled: boolean; smsEnabled: boolean; defaultChannel: 'whatsapp' | 'sms' }>(
      'GET', '/auth/otp-channels'
    ),

  sendOtp: (phone: string, channel?: 'whatsapp' | 'sms') =>
    request<{ success: boolean; message: string; channel?: 'whatsapp' | 'sms' }>(
      'POST', '/auth/send-otp', { phone, ...(channel ? { channel } : {}) }
    ),

  verifyOtp: (phone: string, otp: string) =>
    request<{ success: boolean; accessToken: string; refreshToken: string; user: Record<string, unknown>; driver: Record<string, unknown> }>(
      'POST', '/auth/verify-otp', { phone, otp }
    ),

  // Not role-scoped on the backend — same two endpoints the passenger app uses,
  // looked up by phone number only (no /driver prefix, no email).
  forgotPassword: (phone: string, channel?: 'whatsapp' | 'sms') =>
    request<{ success: boolean; message: string; channel?: 'whatsapp' | 'sms' }>(
      'POST', '/auth/forgot-password', { phone, ...(channel ? { channel } : {}) }
    ),

  resetPassword: (phone: string, token: string, newPassword: string) =>
    request<{ success: boolean; message: string }>(
      'POST', '/auth/reset-password', { phone, token, newPassword }
    ),
};
