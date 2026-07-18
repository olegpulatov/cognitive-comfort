import { describe, it, expect } from 'vitest';
import { getDomain, getBaseDomain, getSiteOverride } from '../src/utils/domain';

describe('getDomain', () => {
  it('returns the hostname for http/https URLs', () => {
    expect(getDomain('https://a.b.example.com/p')).toBe('a.b.example.com');
    expect(getDomain('http://example.com')).toBe('example.com');
  });

  it('normalizes away port, userinfo, and case', () => {
    expect(getDomain('https://User:Pass@EXAMPLE.com:8080/p?q=1')).toBe('example.com');
  });

  it('returns empty string for non-web protocols', () => {
    expect(getDomain('chrome-extension://abc/options.html')).toBe('');
    expect(getDomain('about:blank')).toBe('');
    expect(getDomain('file:///x')).toBe('');
  });

  it('returns empty string for malformed or empty input', () => {
    expect(getDomain('')).toBe('');
    expect(getDomain('https://')).toBe('');
    expect(getDomain('not a url')).toBe('');
    expect(getDomain('example.com')).toBe('');
  });
});

describe('getBaseDomain', () => {
  it('returns null for hostnames with fewer than three parts', () => {
    expect(getBaseDomain('localhost')).toBeNull();
    expect(getBaseDomain('example.com')).toBeNull();
    expect(getBaseDomain('')).toBeNull();
    expect(getBaseDomain('...')).toBeNull();
  });

  it('returns the last two parts for simple three-plus-part hostnames', () => {
    expect(getBaseDomain('a.b.example.com')).toBe('example.com');
    expect(getBaseDomain('x.y.z.com')).toBe('z.com');
    expect(getBaseDomain('a.b.c.d.example.com')).toBe('example.com');
  });

  it('returns null for a multipart TLD with fewer than four parts', () => {
    expect(getBaseDomain('example.co.uk')).toBeNull();
    expect(getBaseDomain('co.uk')).toBeNull();
  });

  it('returns the last three parts for a multipart TLD with four-plus parts', () => {
    expect(getBaseDomain('sub.example.co.uk')).toBe('example.co.uk');
    expect(getBaseDomain('deep.sub.example.com.au')).toBe('example.com.au');
  });
});

describe('getSiteOverride', () => {
  it('an exact domain key wins over a base-domain key', () => {
    const overrides = { 'sub.example.com': 'enabled', 'example.com': 'disabled' } as const;
    expect(getSiteOverride(overrides, 'sub.example.com')).toBe('enabled');
  });

  it('inherits from the base domain when no exact key is present', () => {
    const overrides = { 'example.com': 'disabled' } as const;
    expect(getSiteOverride(overrides, 'sub.example.com')).toBe('disabled');
  });

  it("returns 'default' when nothing matches", () => {
    expect(getSiteOverride({ 'other.com': 'enabled' }, 'x.com')).toBe('default');
    expect(getSiteOverride({}, 'anything.com')).toBe('default');
  });

  it("an explicit 'default' at the exact level takes precedence over a base-domain override", () => {
    // 'default' is a truthy string, so the exact lookup short-circuits before
    // falling through to base-domain inheritance.
    const overrides = { 'sub.example.com': 'default', 'example.com': 'disabled' } as const;
    expect(getSiteOverride(overrides, 'sub.example.com')).toBe('default');
  });
});
