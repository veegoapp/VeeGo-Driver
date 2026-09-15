import { en } from './en';
import { ar } from './ar';

// TypeScript already forces `ar` to declare every key of `en` (ar.ts types
// itself as `Translations = typeof en`), so a missing/extra key is a build
// error, not a runtime one. What TS can't catch is a value going wrong
// *inside* a string — most commonly a `{placeholder}` interpolation token
// dropped or mistyped during translation. A screen calling
// `t('key', { n: 5 })` on a string missing `{n}` silently renders the
// literal `{n}` (or omits data) only in Arabic, and nothing catches it
// short of manually switching the app to Arabic and hitting that screen.
function extractPlaceholders(value: string): string[] {
  return Array.from(value.matchAll(/\{[a-zA-Z0-9_]+\}/g), (m) => m[0]).sort();
}

describe('i18n translations: en/ar parity', () => {
  const keys = Object.keys(en) as (keyof typeof en)[];

  it('has at least one translation key to check', () => {
    expect(keys.length).toBeGreaterThan(0);
  });

  it.each(keys)('"%s" has no leading/trailing whitespace and is non-empty in both languages', (key) => {
    const enValue = en[key];
    const arValue = ar[key];
    expect(typeof enValue).toBe('string');
    expect(typeof arValue).toBe('string');
    expect((enValue as string).length).toBeGreaterThan(0);
    expect((arValue as string).length).toBeGreaterThan(0);
  });

  it.each(keys)('"%s" uses the same {placeholder} tokens in English and Arabic', (key) => {
    const enPlaceholders = extractPlaceholders(en[key] as string);
    const arPlaceholders = extractPlaceholders(ar[key] as string);
    expect(arPlaceholders).toEqual(enPlaceholders);
  });
});
