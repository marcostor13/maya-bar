import { ActiveUserCache } from './active-user.cache';

describe('ActiveUserCache', () => {
  let users: { findById: jest.Mock };
  let cache: ActiveUserCache;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T10:00:00Z'));
    users = { findById: jest.fn() };
    cache = new ActiveUserCache(users as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('un usuario activo se considera activo', async () => {
    users.findById.mockResolvedValue({ isActive: true });

    await expect(cache.isActive('u1')).resolves.toBe(true);
    expect(users.findById).toHaveBeenCalledWith('u1');
  });

  it('un usuario sin el campo isActive (anterior a la desactivación) sigue activo', async () => {
    users.findById.mockResolvedValue({ email: 'a@b.pe' });

    await expect(cache.isActive('u1')).resolves.toBe(true);
  });

  it('un usuario desactivado no está activo', async () => {
    users.findById.mockResolvedValue({ isActive: false });

    await expect(cache.isActive('u1')).resolves.toBe(false);
  });

  it('un usuario borrado no está activo', async () => {
    users.findById.mockResolvedValue(null);

    await expect(cache.isActive('u1')).resolves.toBe(false);
  });

  it('dentro del minuto responde de memoria sin volver a la base', async () => {
    users.findById.mockResolvedValue({ isActive: true });

    await cache.isActive('u1');
    jest.setSystemTime(new Date('2026-01-01T10:00:59Z'));
    await cache.isActive('u1');

    expect(users.findById).toHaveBeenCalledTimes(1);
  });

  it('también guarda en memoria la respuesta negativa', async () => {
    users.findById.mockResolvedValue(null);

    await cache.isActive('u1');
    await expect(cache.isActive('u1')).resolves.toBe(false);

    expect(users.findById).toHaveBeenCalledTimes(1);
  });

  it('pasado el minuto relee y refleja la desactivación', async () => {
    users.findById
      .mockResolvedValueOnce({ isActive: true })
      .mockResolvedValueOnce({ isActive: false });

    await expect(cache.isActive('u1')).resolves.toBe(true);
    jest.setSystemTime(new Date('2026-01-01T10:01:01Z'));

    await expect(cache.isActive('u1')).resolves.toBe(false);
    expect(users.findById).toHaveBeenCalledTimes(2);
  });

  it('invalidate fuerza la relectura sin esperar al TTL', async () => {
    users.findById
      .mockResolvedValueOnce({ isActive: true })
      .mockResolvedValueOnce({ isActive: false });

    await cache.isActive('u1');
    cache.invalidate('u1');

    await expect(cache.isActive('u1')).resolves.toBe(false);
  });

  it('cada usuario tiene su propia entrada', async () => {
    users.findById.mockImplementation((id: string) =>
      Promise.resolve({ isActive: id === 'u1' }),
    );

    await expect(cache.isActive('u1')).resolves.toBe(true);
    await expect(cache.isActive('u2')).resolves.toBe(false);

    cache.invalidate('u2');
    await cache.isActive('u1');
    expect(users.findById).toHaveBeenCalledTimes(2);
  });
});
