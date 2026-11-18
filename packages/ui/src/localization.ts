import { ref } from 'vue';
import { chineseTranslations } from './translations/zh-CN.js';

export type LanguagePreference = 'system' | 'en' | 'zh-CN';
export type WalletLanguage = 'en' | 'zh-CN';

const STORAGE_KEY = 'inscrib3:language';
const VALID_PREFERENCES = new Set<LanguagePreference>(['system', 'en', 'zh-CN']);

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

export function detectWalletLanguage(languages: readonly string[] = browserLanguages()): WalletLanguage {
  return languages[0]?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export function resolveWalletLanguage(
  preference: LanguagePreference,
  languages: readonly string[] = browserLanguages(),
): WalletLanguage {
  return preference === 'system' ? detectWalletLanguage(languages) : preference;
}

function loadPreference(): LanguagePreference {
  if (typeof localStorage === 'undefined') return 'system';
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as LanguagePreference | null;
    return stored && VALID_PREFERENCES.has(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export const languagePreference = ref<LanguagePreference>(loadPreference());
export const activeLanguage = ref<WalletLanguage>(
  resolveWalletLanguage(languagePreference.value),
);

export function setLanguagePreference(preference: LanguagePreference): void {
  if (!VALID_PREFERENCES.has(preference)) return;
  languagePreference.value = preference;
  activeLanguage.value = resolveWalletLanguage(preference);
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // The selected language still applies for the current session.
  }
}

const partialTranslations = Object.entries(chineseTranslations)
  .filter(([source]) => source.length >= 6 && /[A-Za-z]/.test(source))
  .sort(([left], [right]) => right.length - left.length);

function translateDynamicValue(value: string): string {
  const rules: Array<[RegExp, (...matches: string[]) => string]> = [
    [/^Account (\d+)$/, (_match, number) => `账户 ${number}`],
    [/^Seed (\d+)$/, (_match, number) => `助记词 ${number}`],
    [/^(\d+) confirmations?$/, (_match, count) => `${count} 次确认`],
    [/^(\d+) minutes?$/, (_match, count) => `${count} 分钟`],
    [/^(\d+) hours?$/, (_match, count) => `${count} 小时`],
    [/^(\d+) days?$/, (_match, count) => `${count} 天`],
  ];
  for (const [pattern, replacement] of rules) {
    const match = value.match(pattern);
    if (match) return replacement(...match);
  }

  let translated = value;
  for (const [source, target] of partialTranslations) {
    if (translated.includes(source)) translated = translated.split(source).join(target);
  }
  return translated;
}

function translateValue(value: string): string {
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  const normalized = value.trim().replace(/\s+/g, ' ');
  const translated = chineseTranslations[normalized] ?? translateDynamicValue(normalized);
  return translated === normalized ? value : `${leading}${translated}${trailing}`;
}

function translateNode(node: Node): void {
  if (node.nodeType === Node.TEXT_NODE && node.textContent) {
    const translated = translateValue(node.textContent);
    if (translated !== node.textContent) node.textContent = translated;
    return;
  }
  if (!(node instanceof Element)) return;
  for (const attribute of ['aria-label', 'title', 'placeholder']) {
    const value = node.getAttribute(attribute);
    if (!value) continue;
    const translated = translateValue(value);
    if (translated !== value) node.setAttribute(attribute, translated);
  }
  node.childNodes.forEach(translateNode);
}

let observer: MutationObserver | undefined;

export function startLocalization(): WalletLanguage {
  activeLanguage.value = resolveWalletLanguage(languagePreference.value);
  if (typeof document === 'undefined') return activeLanguage.value;
  document.documentElement.lang = activeLanguage.value;
  observer?.disconnect();
  observer = undefined;

  if (activeLanguage.value !== 'zh-CN') return activeLanguage.value;
  document.body && translateNode(document.body);
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') translateNode(mutation.target);
      else mutation.addedNodes.forEach(translateNode);
    }
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  return activeLanguage.value;
}
