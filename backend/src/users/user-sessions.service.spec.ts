import { Types } from 'mongoose';
import { UserSessionsService } from './user-sessions.service';

const exec = () => ({ exec: jest.fn().mockResolvedValue({}) });

describe('UserSessionsService', () => {
  const id = new Types.ObjectId().toString();
  let userModel: { updateOne: jest.Mock };
  let refreshTokens: { updateMany: jest.Mock };
  let cache: { invalidate: jest.Mock };
  let svc: UserSessionsService;

  beforeEach(() => {
    userModel = { updateOne: jest.fn(exec) };
    refreshTokens = { updateMany: jest.fn(exec) };
    cache = { invalidate: jest.fn() };
    svc = new UserSessionsService(
      userModel as never,
      refreshTokens as never,
      cache as never,
    );
  });

  it('revocar completo fija la fecha, revoca los refresh tokens y limpia la caché', async () => {
    await svc.revoke(id, { refresh: true });
    const [filter, update] = userModel.updateOne.mock.calls[0] as [
      { _id: Types.ObjectId },
      { $set: { sessionsValidFrom: Date } },
    ];
    expect(String(filter._id)).toBe(id);
    expect(update.$set.sessionsValidFrom).toBeInstanceOf(Date);
    expect(refreshTokens.updateMany).toHaveBeenCalledWith(
      { userId: new Types.ObjectId(id), revokedAt: null },
      { $set: { revokedAt: expect.any(Date) as Date } },
    );
    expect(cache.invalidate).toHaveBeenCalledWith(id);
  });

  it('revocar ligero deja vivos los refresh tokens para renovar con los datos nuevos', async () => {
    await svc.revoke(id, { refresh: false });
    expect(userModel.updateOne).toHaveBeenCalled();
    expect(refreshTokens.updateMany).not.toHaveBeenCalled();
    expect(cache.invalidate).toHaveBeenCalledWith(id);
  });

  it('anota el último acceso', async () => {
    await svc.touchAccess(id);
    const [, update] = userModel.updateOne.mock.calls[0] as [
      unknown,
      { $set: { lastAccessAt: Date } },
    ];
    expect(update.$set.lastAccessAt).toBeInstanceOf(Date);
  });
});
