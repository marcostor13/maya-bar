import {
  customKey,
  defaultTarget,
  isValidTarget,
  mapLead,
} from './lead-ads-map';

describe('lead-ads-map (HU60)', () => {
  it('usa las claves estándar de Meta y guarda el resto como campos', () => {
    const m = mapLead([
      { name: 'full_name', values: ['Ana Pérez'] },
      { name: 'email', values: ['ANA@X.PE'] },
      { name: 'phone_number', values: ['+51987654321'] },
      { name: '¿Qué carrera te interesa?', values: ['Diseño'] },
      { name: 'vacía', values: [''] },
    ]);
    expect(m).toEqual({
      name: 'Ana Pérez',
      email: 'ana@x.pe',
      phone: '+51987654321',
      customFields: { que_carrera_te_interesa: 'Diseño' },
    });
  });

  it('aplica el mapeo del formulario y junta nombre y apellido', () => {
    const m = mapLead(
      [
        { name: 'first_name', values: ['Luis'] },
        { name: 'last_name', values: ['Rojas'] },
        { name: 'celular', values: ['999 888 777'] },
        { name: 'dni', values: ['12345678'] },
        { name: 'distrito', values: ['Miraflores'] },
      ],
      {
        celular: 'phone',
        dni: 'ignore',
        distrito: 'custom:zona',
        otro: 'mala',
      },
    );
    expect(m).toEqual({
      name: 'Luis Rojas',
      phone: '999 888 777',
      customFields: { zona: 'Miraflores' },
    });
  });

  it('valida destinos y claves', () => {
    expect(isValidTarget('custom:zona')).toBe(true);
    expect(isValidTarget('custom:$where')).toBe(false);
    expect(isValidTarget('mala')).toBe(false);
    expect(customKey('a.b$c')).toBe('a_b_c');
    expect(defaultTarget('work_email')).toBe('email');
  });
});
