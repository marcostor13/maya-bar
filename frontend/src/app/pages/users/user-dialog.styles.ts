/** Estilos comunes de los diálogos de Usuarios (eliminar, restablecer, traspasar). */
export const USER_DIALOG_STYLES = `
  .ud-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45);
    backdrop-filter: blur(3px); display: flex; align-items: center;
    justify-content: center; z-index: 120; }
  .ud-modal { background: var(--color-white); border-radius: var(--radius-lg);
    width: calc(100% - 48px); max-width: 480px; padding: 28px 32px;
    box-shadow: var(--shadow-lg); max-height: calc(100vh - 48px); overflow-y: auto; }
  .ud-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
  .ud-head h2 { display: flex; align-items: center; gap: 8px; margin: 0;
    font-family: var(--font-heading); font-size: 18px; font-weight: 700; color: var(--color-text-main); }
  .ud-sub { margin: 0 0 18px; font-size: 13.5px; color: var(--color-text-muted); line-height: 1.55; }
  .ud-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
  .ud-field > span { font-size: 13px; font-weight: 600; color: var(--color-text-main); }
  .ud-options { display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px; }
  .ud-option { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px;
    border: 1.5px solid var(--color-border); border-radius: var(--radius-md); cursor: pointer; }
  .ud-option.on { border-color: var(--color-brand); background: var(--color-brand-light); }
  .ud-option input { margin-top: 3px; accent-color: var(--color-brand); }
  .ud-option strong { display: block; font-size: 14px; color: var(--color-text-main); }
  .ud-option small { display: block; font-size: 12.5px; color: var(--color-text-muted); margin-top: 2px; }
  .ud-error { font-size: 13px; color: var(--color-error); margin: 0 0 12px; }
  .ud-muted { font-size: 14px; color: var(--color-text-muted); margin: 0 0 14px; }
  .ud-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; flex-wrap: wrap; }
  .ud-cred { background: var(--color-bg-light); border-radius: var(--radius-sm); padding: 16px;
    margin-bottom: 12px; display: flex; flex-direction: column; gap: 10px; }
  .ud-cred span { display: block; font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .06em; color: var(--color-text-muted); }
  .ud-cred strong { font-size: 15px; color: var(--color-text-main); word-break: break-all; }
  .ud-cred .ud-pass { font-family: monospace; font-size: 18px; color: var(--color-brand); letter-spacing: .08em; }
  .ud-impact { list-style: none; margin: 0 0 18px; padding: 0; border: 1px solid var(--color-border);
    border-radius: var(--radius-sm); overflow: hidden; }
  .ud-impact li { display: flex; justify-content: space-between; gap: 12px; padding: 9px 14px;
    font-size: 13.5px; border-bottom: 1px solid var(--color-border); }
  .ud-impact li:last-child { border-bottom: none; }
  .ud-impact strong { font-variant-numeric: tabular-nums; }
  @media (max-width: 480px) { .ud-modal { padding: 22px 20px; } }
`;
