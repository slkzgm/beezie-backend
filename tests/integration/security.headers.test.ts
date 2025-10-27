import { describe, expect, test } from 'bun:test';

import '../setup';

describe('Security headers', () => {
  test('applies hardened defaults', async () => {
    const { createApp } = await import('@/app');
    const app = createApp();

    const response = await app.request('/health');

    expect(response.status).toBe(200);

    const csp = response.headers.get('content-security-policy');
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");

    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('strict-transport-security')).toBe(
      'max-age=63072000; includeSubDomains; preload',
    );

    const permissions = response.headers.get('permissions-policy');
    expect(permissions).toBeTruthy();
    expect(permissions).toContain('geolocation=none');
    expect(permissions).toContain('microphone=none');
    expect(permissions).toContain('camera=none');
  });
});
