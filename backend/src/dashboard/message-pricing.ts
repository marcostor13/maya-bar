/**
 * Tarifas de lista de WhatsApp Business Platform en USD, vigentes desde el
 * 1-oct-2026 (HU18). Fuente y regiones: `docs/costos-mensajes.md`. Meta solo
 * cambia precios el día 1 de cada trimestre: revisar en enero de 2027.
 */
export const WA_RATES_EFFECTIVE = '2026-10-01';

/** [marketing, utility/service, authentication, auth. internacional|null]. */
type Rates = [number, number, number, number | null];

export const WA_RATES: Record<string, Rates> = {
  Argentina: [0.0618, 0.026, 0.026, null],
  Brasil: [0.0625, 0.0068, 0.0068, null],
  Chile: [0.0889, 0.02, 0.02, null],
  Colombia: [0.0125, 0.0008, 0.0008, null],
  México: [0.0397, 0.0085, 0.0085, null],
  Perú: [0.0703, 0.03, 0.03, null],
  España: [0.0707, 0.02, 0.02, null],
  Norteamérica: [0.025, 0.0034, 0.0034, null],
  India: [0.0118, 0.0014, 0.0014, 0.0304],
  Indonesia: [0.0411, 0.025, 0.025, 0.136],
  Italia: [0.0795, 0.03, 0.03, null],
  Alemania: [0.1365, 0.055, 0.055, null],
  Francia: [0.0859, 0.03, 0.03, null],
  'Reino Unido': [0.0635, 0.022, 0.022, null],
  Egipto: [0.0644, 0.0036, 0.0036, 0.065],
  Malasia: [0.086, 0.014, 0.014, 0.0418],
  Nigeria: [0.0516, 0.0067, 0.0067, 0.075],
  Pakistán: [0.0473, 0.015, 0.015, 0.075],
  'Arabia Saudita': [0.0576, 0.0107, 0.0107, 0.0598],
  Sudáfrica: [0.0379, 0.0095, 0.0095, 0.02],
  Turquía: [0.0109, 0.0009, 0.0009, null],
  Emiratos: [0.0576, 0.0157, 0.0157, 0.051],
  Israel: [0.0353, 0.0053, 0.0053, null],
  'Países Bajos': [0.1597, 0.05, 0.05, null],
  Rusia: [0.0802, 0.04, 0.04, null],
  Bangladés: [0.0732, 0.0037, 0.0037, 0.096],
  'Hong Kong': [0.0732, 0.026, 0.026, null],
  Hungría: [0.086, 0.035, 0.035, null],
  Irak: [0.0341, 0.0079, 0.0079, 0.128],
  Kuwait: [0.0792, 0.044, 0.044, 0.12],
  Marruecos: [0.0414, 0.023, 0.023, 0.0811],
  Nepal: [0.0732, 0.0034, 0.0034, 0.112],
  Omán: [0.0341, 0.0247, 0.0247, 0.06],
  Polonia: [0.0366, 0.0122, 0.0122, null],
  Catar: [0.0341, 0.012, 0.012, null],
  Rumanía: [0.086, 0.029, 0.029, null],
  Singapur: [0.0732, 0.016, 0.016, null],
  'Sri Lanka': [0.0732, 0.002, 0.002, 0.144],
  Ucrania: [0.086, 0.0298, 0.0298, 0.0746],
  'Resto de África': [0.0225, 0.004, 0.004, null],
  'Resto de Asia Pacífico': [0.0842, 0.0113, 0.0113, null],
  'Resto de Europa central y del este': [0.086, 0.0212, 0.0212, null],
  'Resto de Latinoamérica': [0.074, 0.0113, 0.0113, null],
  'Resto de Oriente Medio': [0.0392, 0.0091, 0.0091, null],
  'Resto de Europa occidental': [0.0592, 0.0171, 0.0171, null],
  Otros: [0.0604, 0.0077, 0.0077, null],
};

const group = (market: string, prefixes: string[]) =>
  prefixes.map((p) => [p, market] as const);

/** Prefijo internacional → mercado. Gana la coincidencia más larga. */
const PREFIXES = new Map<string, string>([
  ['54', 'Argentina'],
  ['55', 'Brasil'],
  ['56', 'Chile'],
  ['57', 'Colombia'],
  ['52', 'México'],
  ['51', 'Perú'],
  ['34', 'España'],
  ['1', 'Norteamérica'],
  ['91', 'India'],
  ['62', 'Indonesia'],
  ['39', 'Italia'],
  ['49', 'Alemania'],
  ['33', 'Francia'],
  ['44', 'Reino Unido'],
  ['20', 'Egipto'],
  ['60', 'Malasia'],
  ['234', 'Nigeria'],
  ['92', 'Pakistán'],
  ['966', 'Arabia Saudita'],
  ['27', 'Sudáfrica'],
  ['90', 'Turquía'],
  ['971', 'Emiratos'],
  ['972', 'Israel'],
  ['31', 'Países Bajos'],
  // Rusia y Kazajistán comparten +7: Meta no publica la regla, se asume Rusia.
  ['7', 'Rusia'],
  ['880', 'Bangladés'],
  ['852', 'Hong Kong'],
  ['36', 'Hungría'],
  ['964', 'Irak'],
  ['965', 'Kuwait'],
  ['212', 'Marruecos'],
  ['977', 'Nepal'],
  ['968', 'Omán'],
  ['48', 'Polonia'],
  ['974', 'Catar'],
  ['40', 'Rumanía'],
  ['65', 'Singapur'],
  ['94', 'Sri Lanka'],
  ['380', 'Ucrania'],
  ...group('Resto de Latinoamérica', [
    '591',
    '506',
    '593',
    '503',
    '502',
    '509',
    '504',
    '505',
    '507',
    '595',
    '598',
    '58',
    '1809',
    '1829',
    '1849',
    '1658',
    '1876',
    '1787',
    '1939',
  ]),
  ...group('Resto de Europa occidental', [
    '43',
    '32',
    '45',
    '358',
    '353',
    '47',
    '351',
    '46',
    '41',
  ]),
  ...group('Resto de Europa central y del este', [
    '355',
    '374',
    '994',
    '375',
    '359',
    '385',
    '420',
    '995',
    '30',
    '371',
    '370',
    '373',
    '389',
    '381',
    '421',
    '386',
  ]),
  ...group('Resto de África', [
    '213',
    '244',
    '229',
    '267',
    '226',
    '257',
    '237',
    '235',
    '242',
    '291',
    '251',
    '241',
    '220',
    '233',
    '245',
    '225',
    '254',
    '266',
    '231',
    '218',
    '261',
    '265',
    '223',
    '222',
    '258',
    '264',
    '227',
    '250',
    '221',
    '232',
    '252',
    '211',
    '249',
    '268',
    '255',
    '228',
    '216',
    '256',
    '260',
    '263',
  ]),
  ...group('Resto de Asia Pacífico', [
    '93',
    '61',
    '855',
    '86',
    '81',
    '856',
    '976',
    '64',
    '675',
    '63',
    '886',
    '992',
    '66',
    '993',
    '998',
    '84',
  ]),
  ...group('Resto de Oriente Medio', ['973', '962', '961', '967']),
]);

/** Mercado de Meta para un teléfono internacional (con o sin "+"). */
export function waMarket(phone: string | undefined | null): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  for (let len = Math.min(4, digits.length); len > 0; len--) {
    const market = PREFIXES.get(digits.slice(0, len));
    if (market) return market;
  }
  return 'Otros';
}

/**
 * Costo en USD de un mensaje entregado. Solo `type: regular` se cobra; el
 * resto (ventana gratuita, punto de entrada) vale 0.
 */
export function waCost(
  phone: string | undefined | null,
  category: string | undefined,
  type: string | undefined,
): number {
  if (type !== 'regular') return 0;
  const rates = WA_RATES[waMarket(phone)] ?? WA_RATES.Otros;
  switch (category) {
    case 'marketing':
    case 'marketing_lite':
      return rates[0];
    case 'utility':
    case 'service':
      return rates[1];
    case 'authentication':
      return rates[2];
    case 'authentication-international':
      return rates[3] ?? rates[2];
    default:
      return 0;
  }
}
