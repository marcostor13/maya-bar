import { buildSmsRequest, readPath, referencedSecrets } from './sms-request';
import { toE164 } from './sms.service';

const values = {
  to: '+51999888777',
  message: 'Hola "Ana"\n¿Vienes? 50% & más',
  from: 'MAYA',
  secrets: { sid: 'AC123', token: 's3cr3t', api_key: 'k&y' },
};

describe('buildSmsRequest', () => {
  it('JSON: los valores se escapan y el cuerpo sigue siendo JSON válido', () => {
    const req = buildSmsRequest(
      {
        url: 'https://api.proveedor.com/sms',
        method: 'POST',
        headers: [{ key: 'Authorization', value: 'Bearer {secret:api_key}' }],
        bodyType: 'json',
        body: '{"to":"{to}","from":"{from}","text":"{message}"}',
      },
      values,
    );
    expect(JSON.parse(req.body!)).toEqual({
      to: '+51999888777',
      from: 'MAYA',
      text: values.message,
    });
    expect(req.headers['Authorization']).toBe('Bearer k&y');
    expect(req.headers['Content-Type']).toBe('application/json');
  });

  it('form (estilo Twilio): urlencoded y cabecera Basic con dos secretos', () => {
    const req = buildSmsRequest(
      {
        url: 'https://api.twilio.com/2010-04-01/Accounts/{secret:sid}/Messages.json',
        method: 'POST',
        headers: [{ key: 'Authorization', value: '{basic:sid:token}' }],
        bodyType: 'form',
        body: 'To={to}\nFrom={from}\nBody={message}',
      },
      values,
    );
    expect(req.url).toBe(
      'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json',
    );
    expect(req.headers['Authorization']).toBe(
      `Basic ${Buffer.from('AC123:s3cr3t').toString('base64')}`,
    );
    const params = new URLSearchParams(req.body);
    expect(params.get('To')).toBe('+51999888777');
    expect(params.get('Body')).toBe(values.message);
    expect(req.headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
  });

  it('query con GET: los parámetros van en la URL y no hay cuerpo', () => {
    const req = buildSmsRequest(
      {
        url: 'https://sms.ejemplo.com/send?key={secret:api_key}',
        method: 'GET',
        headers: [],
        bodyType: 'query',
        body: 'to={to_digits}&msg={message}',
      },
      values,
    );
    const url = new URL(req.url);
    expect(url.searchParams.get('key')).toBe('k&y');
    expect(url.searchParams.get('to')).toBe('51999888777');
    expect(url.searchParams.get('msg')).toBe(values.message);
    expect(req.body).toBeUndefined();
  });

  it('un secreto que no existe queda vacío, no rompe la petición', () => {
    const req = buildSmsRequest(
      {
        url: 'https://x.com',
        method: 'POST',
        headers: [{ key: 'X-Key', value: '{secret:nada}' }],
        bodyType: 'none',
        body: '',
      },
      values,
    );
    expect(req.headers['X-Key']).toBe('');
  });

  it('referencedSecrets lista los de {secret} y {basic}', () => {
    expect(
      referencedSecrets({
        url: 'https://x.com/{secret:Sid}',
        method: 'POST',
        headers: [{ key: 'Authorization', value: '{basic:sid:token}' }],
        bodyType: 'json',
        body: '{"k":"{secret:api_key}"}',
      }).sort(),
    ).toEqual(['api_key', 'sid', 'token']);
  });
});

describe('readPath', () => {
  it('lee rutas con índices', () => {
    const data = { messages: [{ status: { groupName: 'PENDING' }, id: 7 }] };
    expect(readPath(data, 'messages.0.status.groupName')).toBe('PENDING');
    expect(readPath(data, 'messages.1.id')).toBeUndefined();
    expect(readPath(undefined, 'a.b')).toBeUndefined();
  });
});

describe('toE164', () => {
  it('respeta el prefijo internacional y añade el de la empresa si falta', () => {
    expect(toE164('+34 600 111 222', '51')).toBe('+34600111222');
    expect(toE164('0034 600 111 222', '51')).toBe('+34600111222');
    expect(toE164('999 888 777', '51')).toBe('+51999888777');
    expect(toE164('51999888777', '51')).toBe('+51999888777');
    expect(toE164('0991234567', '593')).toBe('+593991234567');
  });

  it('rechaza lo que no es un teléfono', () => {
    expect(toE164('', '51')).toBeNull();
    expect(toE164('abc', '51')).toBeNull();
    expect(toE164('12', '51')).toBeNull();
  });
});
