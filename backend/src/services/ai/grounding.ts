// Guards against invented statistics: every number the model writes must match a
// number in the context it was given, within the rounding the model applied.

const NUMBER = /-?\d+(?:,\d{3})*(?:\.\d+)?/g;

/** All numbers in a JSON-like value, including those embedded in strings. */
export function collectNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number' && Number.isFinite(value)) out.push(value);
  else if (typeof value === 'string') out.push(...numbersIn(value));
  else if (Array.isArray(value)) value.forEach((v) => collectNumbers(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectNumbers(v, out));
  return out;
}

function numbersIn(text: string): number[] {
  return (text.match(NUMBER) ?? []).map((m) => Number(m.replace(/,/g, '')));
}

function decimalsOf(token: string): number {
  const dot = token.indexOf('.');
  return dot === -1 ? 0 : token.length - dot - 1;
}

export class Grounding {
  private readonly allowed: number[];

  constructor(context: unknown) {
    // Signs are often expressed in words ("decreased by 12%"), so compare magnitudes
    this.allowed = [...new Set(collectNumbers(context).map(Math.abs))];
  }

  /** Numbers in `text` that don't correspond to any context value. */
  ungrounded(text: string): string[] {
    const bad: string[] = [];
    for (const token of text.match(NUMBER) ?? []) {
      const n = Math.abs(Number(token.replace(/,/g, '')));
      // A value written with d decimals may be any context value that rounds to it
      const tolerance = 0.5 * 10 ** -decimalsOf(token) + 1e-9;
      if (!this.allowed.some((a) => Math.abs(a - n) <= tolerance)) bad.push(token);
    }
    return bad;
  }

  /** Ungrounded numbers across several fields. */
  check(...texts: string[]): string[] {
    return texts.flatMap((t) => this.ungrounded(t));
  }
}
