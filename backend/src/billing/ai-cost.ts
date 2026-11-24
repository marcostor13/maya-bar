/**
 * Costo estimado en US$ de una llamada a la IA (HU43), para medir el margen
 * por empresa. Tarifas públicas aproximadas por millón de tokens
 * [entrada, salida]; revisarlas cuando los proveedores cambien precios.
 * Se busca por prefijo del modelo, del más específico al más general.
 */
const RATES: [prefix: string, input: number, output: number][] = [
  ['claude-haiku', 1, 5],
  ['claude-sonnet', 3, 15],
  ['claude-opus', 5, 25],
  ['gpt-5-mini', 0.25, 2],
  ['gpt-5', 1.25, 10],
  ['gpt-4.1-mini', 0.4, 1.6],
  ['gpt-4o-mini', 0.15, 0.6],
  ['deepseek', 0.28, 0.42],
  ['gemini-2.5-flash-lite', 0.1, 0.4],
  ['gemini-2.5-flash', 0.3, 2.5],
  ['gemini-2.5-pro', 1.25, 10],
  ['gemini-2.0-flash', 0.1, 0.4],
];

/** Si el modelo no se reconoce se usa la tarifa del proveedor por defecto. */
const PROVIDER_FALLBACK: Record<string, [number, number]> = {
  claude: [3, 15],
  openai: [0.25, 2],
  deepseek: [0.28, 0.42],
  gemini: [0.3, 2.5],
};

export function estimateCostUsd(
  model: string | undefined,
  provider: string | undefined,
  inputTokens = 0,
  outputTokens = 0,
): number {
  if (!inputTokens && !outputTokens) return 0;
  const m = (model ?? '').toLowerCase();
  const hit = RATES.find(([prefix]) => m.startsWith(prefix));
  const [inRate, outRate] = hit
    ? [hit[1], hit[2]]
    : (PROVIDER_FALLBACK[provider ?? ''] ?? [1, 5]);
  const usd = (inputTokens * inRate + outputTokens * outRate) / 1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}
