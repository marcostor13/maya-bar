import { Types } from 'mongoose';
import { InvoicingService } from './invoicing.service';
import type { PaymentChange } from '../billing-hooks.service';

/** HU75: modo de facturación según INVOICING_AUTO. */
describe('InvoicingService.onPayment (HU75)', () => {
  const id = new Types.ObjectId();
  let updateOne: jest.Mock;

  const make = (auto?: string) => {
    updateOne = jest.fn().mockReturnValue({
      exec: () => Promise.resolve({ modifiedCount: 1 }),
    });
    const svc = new InvoicingService(
      { updateOne } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { onPayment: jest.fn() } as never,
      {} as never,
      { get: () => auto } as never,
    );
    const kick = jest
      .spyOn(svc as unknown as { kick: () => void }, 'kick')
      .mockImplementation(() => undefined);
    return { svc, kick };
  };
  const change = (status: string, previousStatus?: string) =>
    ({
      payment: { _id: id, status },
      previousStatus,
    }) as unknown as PaymentChange;

  it('sin INVOICING_AUTO deja el comprobante en manual y no emite', async () => {
    const { svc, kick } = make(undefined);
    await svc.onPayment(change('approved', 'pending'));
    expect(updateOne).toHaveBeenCalledWith(
      { _id: id, 'receipt.status': { $exists: false } },
      { $set: { 'receipt.status': 'manual' } },
    );
    expect(kick).not.toHaveBeenCalled();
  });

  it('con INVOICING_AUTO=true lo pone en cola y emite (HU49 sin cambios)', async () => {
    const { svc, kick } = make('true');
    await svc.onPayment(change('approved', 'pending'));
    expect(updateOne).toHaveBeenCalledWith(
      { _id: id, 'receipt.status': { $exists: false } },
      { $set: { 'receipt.status': 'pending', 'receipt.attempts': 0 } },
    );
    expect(kick).toHaveBeenCalledWith(id, 'receipt');
  });

  it('un reembolso saca el pago de "Por facturar"', async () => {
    const { svc } = make(undefined);
    await svc.onPayment(change('refunded', 'approved'));
    expect(updateOne).toHaveBeenCalledWith(
      { _id: id, 'receipt.status': 'manual' },
      {
        $set: {
          'receipt.status': 'skipped',
          'receipt.skippedReason': 'Reembolsado antes de facturar',
        },
      },
    );
  });
});
