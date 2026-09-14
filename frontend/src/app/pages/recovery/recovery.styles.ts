/**
 * Piezas visuales que comparten las pantallas del asistente de recuperación.
 * Van en un solo sitio para que los cuatro pasos se lean como uno.
 */
export const RECOVERY_SHARED_STYLES = `
  :host { display: block; }

  .panel {
    background: var(--color-white); border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm); padding: 24px; box-sizing: border-box; min-width: 0;
  }
  .panel + .panel { margin-top: 16px; }
  .panel-title {
    font-family: var(--font-heading); font-size: 18px; font-weight: 600;
    color: var(--color-text-main); margin: 0 0 4px;
  }
  .panel-sub { font-size: 14px; color: var(--color-text-muted); margin: 0; line-height: 1.5; }

  .field { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .label { font-size: 13px; font-weight: 600; color: var(--color-text-main); }
  .hint { font-size: 12px; color: var(--color-text-muted); line-height: 1.5; }

  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip {
    padding: 9px 16px; border-radius: var(--radius-pill); border: 1px solid var(--color-border);
    background: var(--color-white); font: 600 13px var(--font-base); color: var(--color-text-muted);
    cursor: pointer; transition: all var(--transition-fast);
  }
  .chip:hover { border-color: var(--color-brand); color: var(--color-brand); }
  .chip.active { background: var(--color-brand); border-color: var(--color-brand); color: #fff; box-shadow: var(--shadow-brand); }

  .footer-bar {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    margin-top: 24px; flex-wrap: wrap;
  }
  .footer-bar .spacer { flex: 1; }

  .alert {
    display: flex; gap: 12px; align-items: flex-start; padding: 14px 18px;
    border-radius: var(--radius-md); font-size: 13px; line-height: 1.5;
  }
  .alert lucide-icon { flex-shrink: 0; margin-top: 1px; }
  .alert-info { background: #EFF6FF; color: #1E40AF; }
  .alert-warning { background: #FFFBEB; color: #92400E; }
  .alert-danger { background: #FEF2F2; color: #991B1B; }
  .alert-success { background: #ECFDF5; color: #065F46; }
  .alert-ai { background: #F5F3FF; color: #5B21B6; }

  .status-pill {
    display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px;
    border-radius: var(--radius-pill); font-size: 12px; font-weight: 600; white-space: nowrap;
  }

  .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

  /* Burbuja de WhatsApp para la vista previa del mensaje */
  .wa-preview {
    background: #EFEAE2; border-radius: var(--radius-md); padding: 18px 14px;
    min-width: 0; display: flex; flex-direction: column; gap: 6px;
  }
  .wa-bubble {
    align-self: flex-start; max-width: 100%; background: #fff; border-radius: 4px 14px 14px 14px;
    padding: 9px 12px 20px; font-size: 14px; line-height: 1.45; color: #111B21;
    white-space: pre-wrap; overflow-wrap: anywhere; position: relative;
    box-shadow: 0 1px 1px rgba(0,0,0,.08);
  }
  .wa-time { position: absolute; right: 10px; bottom: 4px; font-size: 11px; color: #667781; }
  .wa-label { font-size: 11px; color: #54656F; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }

  .progress { height: 8px; background: var(--color-bg-app); border-radius: var(--radius-pill); overflow: hidden; display: flex; }
  .progress > span { display: block; height: 100%; transition: width var(--transition-smooth); }

  .switch { position: relative; width: 44px; height: 26px; flex-shrink: 0; display: inline-block; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .switch .track {
    position: absolute; inset: 0; background: var(--color-border); border-radius: var(--radius-pill);
    cursor: pointer; transition: background var(--transition-fast);
  }
  .switch .track::after {
    content: ''; position: absolute; left: 3px; top: 3px; width: 20px; height: 20px; border-radius: 50%;
    background: #fff; box-shadow: var(--shadow-sm); transition: transform var(--transition-spring);
  }
  .switch input:checked + .track { background: var(--color-success); }
  .switch input:checked + .track::after { transform: translateX(18px); }
  .switch input:focus-visible + .track { box-shadow: 0 0 0 4px var(--color-brand-light); }

  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 768px) {
    .panel { padding: 20px 16px; }
    .footer-bar { flex-direction: column-reverse; align-items: stretch; }
    .footer-bar .btn { width: 100%; justify-content: center; }
    .footer-bar .spacer { display: none; }
  }
`;
