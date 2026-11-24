/**
 * Script del chat web (HU69) que la empresa pega en su sitio:
 *   <script src="https://API/public/webchat/widget.js" data-key="CLAVE" async></script>
 *
 * Vanilla JS, sin dependencias, en Shadow DOM para no chocar con los estilos
 * del sitio. Si el dominio no está permitido, la sesión responde 403 y el
 * widget no se pinta. Recibe las respuestas por SSE y, al reconectar, pide lo
 * que se perdió.
 */
export const WIDGET_JS = String.raw`(function () {
  var script = document.currentScript;
  if (!script || window.__mayaWebchat) return;
  window.__mayaWebchat = true;
  var key = script.getAttribute('data-key') || '';
  var base = new URL(script.src).origin + '/public/webchat/' + key;
  var store = 'maya_wc_' + key;
  var state = { token: '', visitorId: '', last: '', seen: {}, identified: false, cfg: null, open: false };

  function get(k) { try { return localStorage.getItem(store + k) || ''; } catch (e) { return ''; } }
  function set(k, v) { try { localStorage.setItem(store + k, v); } catch (e) { /* sin almacenamiento */ } }
  function api(path, body) {
    return fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); });
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  api('/session', { visitorId: get('v') || undefined }).then(start, function (status) {
    if (window.console) console.warn('[Maya chat] no disponible en este sitio (' + status + ')');
  });

  function start(s) {
    state.token = s.token; state.visitorId = s.visitorId; state.identified = s.identified; state.cfg = s.config;
    set('v', s.visitorId);
    var c = s.config;
    var host = el('div');
    host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483000;';
    document.body.appendChild(host);
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var style = el('style');
    style.textContent = [
      ':host{all:initial}',
      '*{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}',
      '.bubble{width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;background:' + c.color + ';color:#fff;box-shadow:0 10px 30px rgba(15,23,42,.25);display:grid;place-items:center}',
      '.bubble svg{width:28px;height:28px}',
      '.panel{position:absolute;right:0;bottom:76px;width:360px;max-width:calc(100vw - 32px);height:520px;max-height:calc(100vh - 120px);background:#fff;border-radius:20px;box-shadow:0 20px 50px rgba(15,23,42,.3);display:none;flex-direction:column;overflow:hidden}',
      '.panel.open{display:flex}',
      '.head{background:' + c.color + ';color:#fff;padding:16px 18px;display:flex;align-items:center;gap:10px}',
      '.head img{width:32px;height:32px;border-radius:50%;background:#fff;object-fit:contain}',
      '.head strong{flex:1;font-size:15px}',
      '.x{background:none;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1}',
      '.list{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;background:#f8fafc}',
      '.m{max-width:80%;padding:9px 13px;border-radius:16px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}',
      '.m.in{align-self:flex-end;background:' + c.color + ';color:#fff;border-bottom-right-radius:4px}',
      '.m.out{align-self:flex-start;background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-bottom-left-radius:4px}',
      '.m a{color:inherit}',
      '.form{padding:12px;border-top:1px solid #e2e8f0;display:flex;gap:8px}',
      '.form input,.contact input{flex:1;border:1px solid #cbd5e1;border-radius:999px;padding:10px 14px;font-size:14px;outline:none;min-width:0}',
      '.send{border:0;border-radius:999px;background:' + c.color + ';color:#fff;padding:0 16px;font-weight:600;cursor:pointer}',
      '.contact{padding:16px;display:flex;flex-direction:column;gap:8px;border-top:1px solid #e2e8f0}',
      '.contact p{margin:0;font-size:13px;color:#475569}',
      '.hp{position:absolute;left:-9999px}',
      '.wa{display:block;text-align:center;padding:8px;font-size:13px;color:#16a34a;text-decoration:none;border-top:1px solid #e2e8f0}',
      '.err{color:#dc2626;font-size:12px;padding:0 16px 8px}'
    ].join('');
    root.appendChild(style);

    var panel = el('div', 'panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', c.title);
    var head = el('div', 'head');
    if (c.logo) { var img = el('img'); img.src = c.logo; img.alt = ''; head.appendChild(img); }
    head.appendChild(el('strong', '', c.title));
    var x = el('button', 'x', '×'); x.setAttribute('aria-label', 'Cerrar'); head.appendChild(x);
    var list = el('div', 'list'); list.setAttribute('aria-live', 'polite');
    var err = el('div', 'err');
    var form = el('form', 'form');
    var input = el('input'); input.placeholder = 'Escribe tu mensaje'; input.maxLength = 2000; input.setAttribute('aria-label', 'Mensaje');
    var hp = el('input', 'hp'); hp.tabIndex = -1; hp.autocomplete = 'off'; hp.name = 'website';
    var send = el('button', 'send', 'Enviar'); send.type = 'submit';
    form.appendChild(input); form.appendChild(hp); form.appendChild(send);
    panel.appendChild(head); panel.appendChild(list); panel.appendChild(err);

    var contact = null;
    if (c.askContact && !state.identified) {
      contact = el('form', 'contact');
      contact.appendChild(el('p', '', 'Déjanos tus datos para escribirte si se corta el chat.'));
      var fn = el('input'); fn.placeholder = 'Tu nombre'; fn.maxLength = 120;
      var fp = el('input'); fp.placeholder = 'Teléfono o email'; fp.maxLength = 200;
      var fb = el('button', 'send', 'Empezar'); fb.type = 'submit'; fb.style.padding = '10px';
      contact.appendChild(fn); contact.appendChild(fp); contact.appendChild(fb);
      contact.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = fp.value.trim();
        if (!v) { err.textContent = 'Deja tu teléfono o tu email'; return; }
        var body = { token: state.token, name: fn.value.trim() || undefined, website: hp.value };
        if (v.indexOf('@') > 0) body.email = v; else body.phone = v;
        api('/contact', body).then(function () {
          state.identified = true; err.textContent = '';
          panel.replaceChild(form, contact); input.focus();
        }, function () { err.textContent = 'Revisa tus datos e intenta de nuevo'; });
      });
      panel.appendChild(contact);
    } else panel.appendChild(form);
    if (c.whatsappUrl) {
      var wa = el('a', 'wa', 'Seguir por WhatsApp'); wa.href = c.whatsappUrl; wa.target = '_blank'; wa.rel = 'noopener';
      panel.appendChild(wa);
    }

    var bubble = el('button', 'bubble');
    bubble.setAttribute('aria-label', c.title);
    bubble.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    root.appendChild(panel); root.appendChild(bubble);

    function add(m) {
      if (m.id && state.seen[m.id]) return;
      if (m.id) state.seen[m.id] = true;
      if (m.at && m.at > state.last) state.last = m.at;
      var b = el('div', 'm ' + (m.direction === 'in' ? 'in' : 'out'));
      if (m.mediaUrl) {
        var a = el('a', '', m.text || m.filename || 'Archivo'); a.href = m.mediaUrl; a.target = '_blank'; a.rel = 'noopener';
        b.appendChild(a);
      } else b.textContent = m.text;
      list.appendChild(b);
      list.scrollTop = list.scrollHeight;
    }
    add({ id: 'greeting', direction: 'out', text: c.greeting });
    (s.messages || []).forEach(add);

    function toggle() {
      state.open = !state.open;
      panel.className = 'panel' + (state.open ? ' open' : '');
      if (state.open) { (contact ? contact.querySelector('input') : input).focus(); connect(); }
    }
    bubble.addEventListener('click', toggle);
    x.addEventListener('click', toggle);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (!text) return;
      input.value = ''; err.textContent = '';
      api('/messages', { token: state.token, text: text, website: hp.value }).then(function (r) {
        if (r.message) add(r.message);
      }, function (status) {
        input.value = text;
        err.textContent = status === 429 ? 'Vas muy rápido, espera un momento' : 'No se pudo enviar, intenta de nuevo';
      });
    });

    var es = null;
    function catchUp() {
      var q = state.last ? '&since=' + encodeURIComponent(state.last) : '';
      api('/messages?token=' + encodeURIComponent(state.token) + q).then(function (rows) { rows.forEach(add); }, function () {});
    }
    function connect() {
      if (es || !window.EventSource) return;
      es = new EventSource(base + '/stream?token=' + encodeURIComponent(state.token));
      es.onmessage = function (ev) { try { add(JSON.parse(ev.data)); } catch (e) { /* mensaje mal formado */ } };
      es.onopen = catchUp;
    }
    if (s.messages && s.messages.length) connect();
  }
})();
`;
