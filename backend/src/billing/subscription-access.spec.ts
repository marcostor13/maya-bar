import { accessOf, canUse, TRIAL_ENDED_MESSAGE } from './subscription-access';

const NOW = new Date('2026-12-01T12:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe('accessOf (HU41)', () => {
  it('prueba vigente: acceso completo y días restantes', () => {
    const s = accessOf(
      { trialEndsAt: days(3.5), subscription: { status: 'trialing' } },
      NOW,
    );
    expect(s).toMatchObject({
      status: 'trialing',
      readOnly: false,
      trialDaysLeft: 4,
    });
  });

  it('prueba vencida: solo lectura con el mensaje de la prueba (C2)', () => {
    const s = accessOf(
      { trialEndsAt: days(-1), subscription: { status: 'trialing' } },
      NOW,
    );
    expect(s).toMatchObject({
      status: 'expired',
      readOnly: true,
      reason: TRIAL_ENDED_MESSAGE,
    });
  });

  it('cliente anterior al catálogo sin suscripción: sin cambios', () => {
    expect(
      accessOf({ legacy: true, trialEndsAt: days(-30) }, NOW).readOnly,
    ).toBe(false);
  });

  it('activo, cancelado con periodo vigente y past_due en gracia: acceso completo', () => {
    expect(accessOf({ subscription: { status: 'active' } }, NOW).readOnly).toBe(
      false,
    );
    expect(
      accessOf(
        { subscription: { status: 'canceled', currentPeriodEnd: days(5) } },
        NOW,
      ).readOnly,
    ).toBe(false);
    expect(
      accessOf(
        { subscription: { status: 'past_due', graceEndsAt: days(2) } },
        NOW,
      ).readOnly,
    ).toBe(false);
  });

  it('gracia vencida, cancelado vencido o expirado: solo lectura', () => {
    expect(
      accessOf(
        { subscription: { status: 'past_due', graceEndsAt: days(-1) } },
        NOW,
      ).readOnly,
    ).toBe(true);
    expect(
      accessOf(
        { subscription: { status: 'canceled', currentPeriodEnd: days(-1) } },
        NOW,
      ).readOnly,
    ).toBe(true);
    expect(
      accessOf({ subscription: { status: 'expired' } }, NOW).readOnly,
    ).toBe(true);
  });
});

describe('canUse (HU48)', () => {
  const now = new Date('2026-06-01');
  it('suspendida a mano no opera aunque esté activa', () => {
    expect(
      canUse({ isActive: false, subscription: { status: 'active' } }, now),
    ).toBe(false);
  });
  it('activa opera; vencida en gracia opera; vencida sin gracia no', () => {
    expect(canUse({ subscription: { status: 'active' } }, now)).toBe(true);
    expect(
      canUse(
        {
          subscription: {
            status: 'past_due',
            graceEndsAt: new Date('2026-06-03'),
          },
        },
        now,
      ),
    ).toBe(true);
    expect(
      canUse(
        {
          subscription: {
            status: 'past_due',
            graceEndsAt: new Date('2026-05-30'),
          },
        },
        now,
      ),
    ).toBe(false);
  });
});
