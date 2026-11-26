import { stat } from 'node:fs/promises';

export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith('./') || specifier.startsWith('../'))
    && !specifier.endsWith('.js')
    && !specifier.endsWith('.mjs')
    && !specifier.endsWith('.cjs')
    && !specifier.endsWith('.ts')) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL);
    try {
      await stat(candidate);
      return nextResolve(candidate.href, context);
    } catch {
      // Preserve Node's normal error when no TS file exists.
    }
  }
  return nextResolve(specifier, context);
}
