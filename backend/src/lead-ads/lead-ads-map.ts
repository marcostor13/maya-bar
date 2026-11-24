/** Respuesta de un formulario de Meta tal como la devuelve Graph API. */
export interface MetaFieldData {
  name: string;
  values?: string[];
}

/** Destino de una pregunta en Maya. `custom:<clave>` va a `customFields`. */
export type FieldTarget =
  | 'name'
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'phone'
  | 'ignore'
  | `custom:${string}`;

export interface MappedLead {
  name?: string;
  email?: string;
  phone?: string;
  customFields: Record<string, string>;
}

/** Destino por defecto según la clave estándar de Meta. */
export function defaultTarget(question: string): FieldTarget {
  switch (question) {
    case 'full_name':
      return 'name';
    case 'first_name':
      return 'first_name';
    case 'last_name':
      return 'last_name';
    case 'email':
    case 'work_email':
      return 'email';
    case 'phone_number':
    case 'phone':
      return 'phone';
    default:
      return `custom:${customKey(question)}`;
  }
}

/** Clave segura para `customFields` (sin puntos ni `$`, que Mongo no admite). */
export function customKey(question: string): string {
  const k = question
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return k || 'respuesta';
}

export function isValidTarget(t: string): t is FieldTarget {
  return (
    ['name', 'first_name', 'last_name', 'email', 'phone', 'ignore'].includes(
      t,
    ) || /^custom:[a-z0-9_]{1,60}$/.test(t)
  );
}

/** Pasa las respuestas de Meta a los campos del contacto según el mapeo. */
export function mapLead(
  fields: MetaFieldData[],
  mapping: Record<string, string> = {},
): MappedLead {
  const out: MappedLead = { customFields: {} };
  let first = '';
  let last = '';
  for (const f of fields ?? []) {
    if (!f?.name) continue;
    const value = (f.values ?? [])
      .map((v) => String(v).trim())
      .filter(Boolean)
      .join(', ')
      .slice(0, 1000);
    if (!value) continue;
    const mapped = mapping[f.name];
    const target =
      mapped && isValidTarget(mapped) ? mapped : defaultTarget(f.name);
    if (target === 'ignore') continue;
    if (target === 'name') out.name = value;
    else if (target === 'first_name') first = value;
    else if (target === 'last_name') last = value;
    else if (target === 'email') out.email = value.toLowerCase();
    else if (target === 'phone') out.phone = value;
    else out.customFields[target.slice('custom:'.length)] = value;
  }
  if (!out.name && (first || last)) out.name = `${first} ${last}`.trim();
  return out;
}
