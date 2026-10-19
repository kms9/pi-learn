// The Squad page's styles: one <style> element, removed with the plugin. Colors are
// tokens, with dark variants; the page sits above DSH's shell like ds-bot's panels.
export const CSS = `
.sq-root{--sq-bg:#fbfbfa;--sq-panel:#ffffff;--sq-line:#e4e2dd;--sq-text:#1f1e1c;--sq-muted:#6f6b64;--sq-accent:#3d5afe;--sq-ok:#1f8a4c;--sq-warn:#b26a00;--sq-bad:#c62828;--sq-chip:#f1efea;
  position:fixed;inset:0;z-index:2147480000;display:flex;align-items:stretch;justify-content:center;background:rgba(20,18,15,.38);font:14px/1.5 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--sq-text)}
@media (prefers-color-scheme:dark){.sq-root{--sq-bg:#1b1a18;--sq-panel:#23221f;--sq-line:#3a3833;--sq-text:#eceae5;--sq-muted:#a29e95;--sq-accent:#8c9eff;--sq-ok:#5cc489;--sq-warn:#e0a54a;--sq-bad:#ef6f6c;--sq-chip:#2f2d29}}
.sq-shell{margin:24px;flex:1;max-width:1280px;background:var(--sq-bg);border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 18px 60px rgba(0,0,0,.25)}
.sq-head{display:flex;align-items:center;gap:16px;padding:12px 18px;border-bottom:1px solid var(--sq-line);background:var(--sq-panel)}
.sq-title{font-weight:650;font-size:16px}
.sq-tabs{display:flex;gap:4px}
.sq-tab{border:0;background:none;color:var(--sq-muted);padding:6px 12px;border-radius:8px;cursor:pointer;font:inherit}
.sq-tab[data-on]{background:var(--sq-chip);color:var(--sq-text);font-weight:600}
.sq-spacer{flex:1}
.sq-x{border:0;background:none;font-size:20px;color:var(--sq-muted);cursor:pointer;padding:0 6px}
.sq-banner{padding:6px 18px;background:#fff4e0;color:#7a4b00;font-size:13px}
@media (prefers-color-scheme:dark){.sq-banner{background:#3a2c12;color:#f3cf8b}}
.sq-body{flex:1;display:flex;min-height:0}
.sq-side{width:300px;border-right:1px solid var(--sq-line);overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
.sq-main{flex:1;overflow:auto;padding:16px 20px;display:flex;flex-direction:column;gap:16px}
.sq-item{border:1px solid var(--sq-line);border-radius:10px;padding:8px 10px;background:var(--sq-panel);cursor:pointer;text-align:left;font:inherit;color:inherit}
.sq-item[data-on]{border-color:var(--sq-accent);box-shadow:0 0 0 1px var(--sq-accent)}
.sq-muted{color:var(--sq-muted);font-size:12px}
.sq-chip{display:inline-block;padding:1px 8px;border-radius:999px;background:var(--sq-chip);font-size:12px;margin-right:6px}
.sq-chip[data-tone=ok]{color:var(--sq-ok)}.sq-chip[data-tone=warn]{color:var(--sq-warn)}.sq-chip[data-tone=bad]{color:var(--sq-bad)}
.sq-card{border:1px solid var(--sq-line);border-radius:12px;background:var(--sq-panel);padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.sq-card h3{margin:0;font-size:14px}
.sq-section h2{margin:0 0 8px;font-size:15px}
.sq-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.sq-btn{border:1px solid var(--sq-line);background:var(--sq-panel);color:var(--sq-text);border-radius:8px;padding:5px 12px;cursor:pointer;font:inherit}
.sq-btn[data-kind=primary]{background:var(--sq-accent);border-color:var(--sq-accent);color:#fff}
.sq-btn[data-kind=danger]{color:var(--sq-bad)}
.sq-btn:disabled{opacity:.5;cursor:default}
.sq-input,.sq-text,.sq-select{width:100%;box-sizing:border-box;border:1px solid var(--sq-line);background:var(--sq-panel);color:var(--sq-text);border-radius:8px;padding:6px 8px;font:inherit}
.sq-text{min-height:64px;resize:vertical}
.sq-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.sq-table{width:100%;border-collapse:collapse;font-size:13px}
.sq-table th,.sq-table td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--sq-line);vertical-align:top}
.sq-table th{color:var(--sq-muted);font-weight:500}
.sq-dag{overflow:auto;border:1px solid var(--sq-line);border-radius:12px;background:var(--sq-panel)}
.sq-dag text{font:12px system-ui,sans-serif;fill:var(--sq-text)}
.sq-preview{position:fixed;inset:40px;z-index:2147480001;background:var(--sq-panel);border-radius:12px;display:flex;flex-direction:column;box-shadow:0 18px 60px rgba(0,0,0,.35)}
.sq-preview iframe{flex:1;border:0;border-radius:0 0 12px 12px;background:#fff}
.sq-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147480002;background:#2b2926;color:#fff;padding:8px 14px;border-radius:10px;max-width:70vw}
.sq-foot{display:flex;align-items:center;gap:6px;width:100%;border:0;background:none;color:inherit;padding:6px 8px;border-radius:8px;cursor:pointer;font:inherit}
.sq-foot:hover{background:rgba(127,127,127,.12)}
.sq-dock{display:flex;align-items:center;gap:8px;padding:6px 10px;margin:0 0 6px;border:1px solid #e4e2dd;border-radius:10px;font-size:13px}
.sq-bar{height:8px;border-radius:4px;background:var(--sq-accent)}
`

export function installStyles() {
  const style = document.createElement('style')
  style.dataset.squad = 'page'
  style.textContent = CSS
  document.head.append(style)
  return () => style.remove()
}
