import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateTenantDto } from './create-tenant.dto';

describe('UpdateTenantDto.plan (HU40 C4)', () => {
  const errorsFor = async (plan: string) =>
    (await validate(plainToInstance(UpdateTenantDto, { plan }))).filter(
      (e) => e.property === 'plan',
    );

  it('rechaza un plan fuera del catálogo', async () => {
    expect(await errorsFor('pro')).toHaveLength(1);
    expect(await errorsFor('starter')).toHaveLength(1);
  });

  it('acepta los planes del catálogo', async () => {
    for (const p of ['inicia', 'crece', 'escala', 'empresa'])
      expect(await errorsFor(p)).toHaveLength(0);
  });
});
