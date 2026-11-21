import { mergeMessages } from './merge-messages';

type M = { _id: string; at: string; status?: string };
const isTemp = (m: M) => m._id.startsWith('tmp-');

describe('mergeMessages (HU23)', () => {
  const old: M = { _id: 'a1', at: '2026-11-20T10:00:00Z' };
  const sent: M = { _id: 'a2', at: '2026-11-20T10:01:00Z', status: 'sent' };
  const temp: M = { _id: 'tmp-1', at: '2026-11-20T10:05:00Z', status: 'pending' };

  it('C4: añade lo nuevo, actualiza el estado y no duplica', () => {
    const nuevo: M = { _id: 'a3', at: '2026-11-20T10:02:00Z' };
    const out = mergeMessages([sent], [{ ...sent, status: 'read' }, nuevo], isTemp);
    expect(out.map(m => m._id)).toEqual(['a2', 'a3']);
    expect(out[0].status).toBe('read');
  });

  it('C4: conserva los antiguos ya cargados y las burbujas provisionales al final', () => {
    const out = mergeMessages([old, sent, temp], [sent, { _id: 'a3', at: '2026-11-20T10:03:00Z' }], isTemp);
    expect(out.map(m => m._id)).toEqual(['a1', 'a2', 'a3', 'tmp-1']);
  });

  it('C4: ordena por fecha aunque el servidor traiga uno intercalado', () => {
    const between: M = { _id: 'a0', at: '2026-11-20T10:00:30Z' };
    const out = mergeMessages([old, sent], [between, sent], isTemp);
    expect(out.map(m => m._id)).toEqual(['a1', 'a0', 'a2']);
  });
});

describe('mergeMessages: más perdidos de los que caben (HU23)', () => {
  it('sin nada en común con lo cargado, se queda solo la página nueva', () => {
    const at = (i: number) => new Date(Date.UTC(2026, 10, 20, 12, i)).toISOString();
    const loaded = [{ _id: 'v1', at: at(0) }, { _id: 'v2', at: at(1) }];
    const temp = { _id: 'tmp-9', at: at(59) };
    const page = [1, 2, 3].map(i => ({ _id: `n${i}`, at: at(10 + i) }));
    const out = mergeMessages([...loaded, temp], page, m => m._id.startsWith('tmp-'), 3);
    expect(out.map(m => m._id)).toEqual(['n1', 'n2', 'n3', 'tmp-9']);
  });
});
