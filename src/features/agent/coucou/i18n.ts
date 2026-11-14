// Minimal self-contained i18n shim for Coucou components
export const N_ = (s: string) => s;
export const t = (s: string, vars?: Record<string, string | number>) => {
  if (!vars) return s;
  return s.replace(/{(\w+)}/g, (_, k) => String(vars[k] ?? `{${k}}`));
};
export const tl = (s: string) => s;
export const language = () => "en";
export const labels = <K extends string>(keys: Record<K, string>): Record<K, string> => {
  return keys;
};
export type Msg = string;
