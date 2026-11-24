import { InstagramAccountsService } from './instagram-accounts.service';

describe('InstagramAccountsService.findByIgUserId', () => {
  it('con la misma cuenta en varias empresas, rutea a la activa más reciente', async () => {
    const doc = { _id: 'nuevo' };
    const exec = jest.fn().mockResolvedValue(doc);
    const sort = jest.fn().mockReturnValue({ exec });
    const findOne = jest.fn().mockReturnValue({ sort });
    const service = new InstagramAccountsService(
      { findOne } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.findByIgUserId('17841400809392708')).resolves.toBe(
      doc,
    );
    expect(findOne).toHaveBeenCalledWith({
      igBusinessAccountId: '17841400809392708',
      active: { $ne: false },
    });
    expect(sort).toHaveBeenCalledWith({ updatedAt: -1 });
  });
});
