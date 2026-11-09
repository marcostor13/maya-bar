import {
  ConversationSchema,
  hideTrashInPipeline,
  hideTrashInQuery,
} from './conversation.schema';

const query = (filter: Record<string, unknown>) => {
  const where = jest.fn();
  return { q: { getFilter: () => filter, where }, where };
};

describe('Conversation: filtro de papelera', () => {
  it('las consultas normales dejan fuera la papelera', () => {
    const { q, where } = query({ tenantId: 't1' });
    hideTrashInQuery(q);
    expect(where).toHaveBeenCalledWith({ inTrash: { $ne: true } });
  });

  it('si la consulta ya filtra por inTrash, no se toca (papelera, migración)', () => {
    for (const inTrash of [true, false, { $in: [true, false] }]) {
      const { q, where } = query({ tenantId: 't1', inTrash });
      hideTrashInQuery(q);
      expect(where).not.toHaveBeenCalled();
    }
  });

  it('un aggregate recibe un $match inicial', () => {
    const pipeline: object[] = [{ $group: { _id: '$channel' } }];
    hideTrashInPipeline(pipeline);
    expect(pipeline[0]).toEqual({ $match: { inTrash: { $ne: true } } });
    expect(pipeline).toHaveLength(2);
  });

  it('un aggregate que ya filtra por inTrash en su primer $match no cambia', () => {
    const pipeline: object[] = [{ $match: { inTrash: true } }];
    hideTrashInPipeline(pipeline);
    expect(pipeline).toEqual([{ $match: { inTrash: true } }]);
  });

  it('el índice único de contacto solo aplica fuera de la papelera', () => {
    const unique = ConversationSchema.indexes().find(
      ([fields, opts]) =>
        'contact' in fields && 'channel' in fields && opts?.unique,
    );
    expect(unique?.[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { inTrash: false },
    });
  });
});
