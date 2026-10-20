// The Squad page's styles: one <style> element, removed with the plugin. Colors are
// tokens, with dark variants; the page sits above DSH's shell like ds-bot's panels.
export const CSS = `
body{--sq-bg:#fbfbfa;--sq-panel:#ffffff;--sq-line:#e4e2dd;--sq-text:#1f1e1c;--sq-muted:#6f6b64;--sq-accent:#3d5afe;--sq-chip:#f1efea;--sq-canvas:#f8f7f4;
  --sq-running:#2563eb;--sq-running-bg:#e8efff;--sq-done:#15803d;--sq-done-bg:#e3f5e8;--sq-attention:#c2410c;--sq-attention-bg:#fff0e3;--sq-failed:#dc2626;--sq-failed-bg:#fdeaea;--sq-stopped:#6b7280;--sq-stopped-bg:#eeeff1;--sq-waiting:#6f6b64;--sq-waiting-bg:#ffffff;
  --sq-ok:var(--sq-done);--sq-warn:var(--sq-attention);--sq-bad:var(--sq-failed)}
body[data-ds-dark-theme]{--sq-bg:#1b1a18;--sq-panel:#23221f;--sq-line:#3a3833;--sq-text:#eceae5;--sq-muted:#a29e95;--sq-accent:#8c9eff;--sq-chip:#2f2d29;--sq-canvas:#16161a;
  --sq-running:#60a5fa;--sq-running-bg:#16233d;--sq-done:#4ade80;--sq-done-bg:#14301f;--sq-attention:#fb923c;--sq-attention-bg:#3a2412;--sq-failed:#f87171;--sq-failed-bg:#3b1717;--sq-stopped:#9ca3af;--sq-stopped-bg:#2a2b2f;--sq-waiting:#a29e95;--sq-waiting-bg:#23221f}
.sq-root{position:fixed;inset:0;z-index:2147480000;display:flex;align-items:stretch;justify-content:center;background:rgba(20,18,15,.38);font:14px/1.5 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--sq-text)}
.sq-shell{margin:24px;flex:1;max-width:1280px;background:var(--sq-bg);border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 18px 60px rgba(0,0,0,.25)}
.sq-head{display:flex;align-items:center;gap:16px;padding:12px 18px;border-bottom:1px solid var(--sq-line);background:var(--sq-panel)}
.sq-title{font-weight:650;font-size:16px}
.sq-tabs{display:flex;gap:4px}
.sq-tab{border:0;background:none;color:var(--sq-muted);padding:6px 12px;border-radius:8px;cursor:pointer;font:inherit}
.sq-tab[data-on]{background:var(--sq-chip);color:var(--sq-text);font-weight:600}
.sq-spacer{flex:1}
.sq-x{border:0;background:none;font-size:20px;color:var(--sq-muted);cursor:pointer;padding:0 6px}
.sq-banner{padding:6px 18px;background:#fff4e0;color:#7a4b00;font-size:13px}
body[data-ds-dark-theme] .sq-banner{background:#3a2c12;color:#f3cf8b}
.sq-body{flex:1;display:flex;min-height:0}
.sq-side{width:300px;border-right:1px solid var(--sq-line);overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
.sq-main{flex:1;overflow:auto;padding:16px 20px;display:flex;flex-direction:column;gap:16px}
.sq-item{border:1px solid var(--sq-line);border-radius:10px;padding:8px 10px;background:var(--sq-panel);cursor:pointer;text-align:left;font:inherit;color:inherit}
.sq-item[data-on]{border-color:var(--sq-accent);box-shadow:0 0 0 1px var(--sq-accent)}
.sq-muted{color:var(--sq-muted);font-size:12px}
.sq-chip{display:inline-block;white-space:nowrap;padding:1px 8px;border-radius:999px;background:var(--sq-chip);font-size:12px;margin-right:6px}
.sq-chip[data-tone=ok]{color:var(--sq-ok)}.sq-chip[data-tone=warn]{color:var(--sq-warn)}.sq-chip[data-tone=bad]{color:var(--sq-bad)}
.sq-status{display:inline-flex;align-items:center;gap:4px;white-space:nowrap;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid transparent}
.sq-status::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.sq-status[data-s=running]{color:var(--sq-running);background:var(--sq-running-bg)}
.sq-status[data-s=done]{color:var(--sq-done);background:var(--sq-done-bg)}
.sq-status[data-s=attention]{color:var(--sq-attention);background:var(--sq-attention-bg)}
.sq-status[data-s=failed]{color:var(--sq-failed);background:var(--sq-failed-bg)}
.sq-status[data-s=stopped]{color:var(--sq-stopped);background:var(--sq-stopped-bg)}
.sq-status[data-s=waiting]{color:var(--sq-waiting);background:var(--sq-waiting-bg);border-color:var(--sq-line)}
.sq-sum{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 18px;border-bottom:1px solid var(--sq-line);background:var(--sq-panel);font-size:13px}
.sq-sum-num{color:var(--sq-muted)}.sq-sum-num b{color:var(--sq-text);font-size:14px}
.sq-pill{position:relative;border:0;border-radius:999px;padding:3px 12px;font:inherit;font-weight:600;cursor:pointer}
.sq-pill[data-s=attention]{color:var(--sq-attention);background:var(--sq-attention-bg)}
.sq-pill[data-s=failed]{color:var(--sq-failed);background:var(--sq-failed-bg)}
.sq-pill[data-flash]{animation:sq-flash .9s ease-out 1}
@keyframes sq-flash{0%{box-shadow:0 0 0 0 currentColor}100%{box-shadow:0 0 0 8px transparent}}
@media (prefers-reduced-motion:reduce){.sq-pill[data-flash]{animation:none}}
.sq-menu{position:absolute;top:calc(100% + 6px);left:0;z-index:5;min-width:320px;max-width:480px;background:var(--sq-panel);border:1px solid var(--sq-line);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:6px;display:flex;flex-direction:column;gap:2px;color:var(--sq-text);font-weight:400;text-align:left}
.sq-menu-group{font-size:12px;color:var(--sq-muted);padding:4px 8px 0}
.sq-menu-item{border:0;background:none;text-align:left;padding:6px 8px;border-radius:8px;cursor:pointer;font:inherit;color:inherit}
.sq-menu-item:hover,.sq-menu-item:focus{background:var(--sq-chip);outline:none}
tr[data-focus]{outline:2px solid var(--sq-attention);outline-offset:-2px}
.sq-canvas-wrap{position:relative;border:1px solid var(--sq-line);border-radius:12px;overflow:hidden;background:var(--sq-canvas)}
.sq-canvas{position:relative;height:min(64vh,640px);min-height:420px;overflow:hidden;cursor:grab}
.sq-canvas:active{cursor:grabbing}
.sq-canvas-tools{position:absolute;left:10px;top:10px;z-index:3;display:flex;gap:6px}
.sq-layer{position:absolute;left:0;top:0;transform-origin:0 0;transition:transform .25s ease}
.sq-edges{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.sq-edge{fill:none;stroke:var(--sq-line);stroke-width:1.6}
.sq-edge[data-to-s=stopped]{stroke-dasharray:4 4}
.sq-edge-dep{fill:none;stroke:var(--sq-muted);stroke-width:1;stroke-dasharray:3 4;opacity:.45}
.sq-node{position:absolute;left:0;top:0;box-sizing:border-box;padding:8px 10px 6px;border-radius:12px;background:var(--sq-panel);border:1px solid var(--sq-line);border-top:3px solid var(--sq-waiting);box-shadow:0 1px 3px rgba(0,0,0,.08);display:flex;flex-direction:column;gap:3px;cursor:pointer;transition:transform .25s ease,box-shadow .2s,opacity .25s;color:var(--sq-text)}
.sq-node[data-s=running]{border-top-color:var(--sq-running)}.sq-node[data-s=done]{border-top-color:var(--sq-done)}
.sq-node[data-s=attention]{border-top-color:var(--sq-attention);box-shadow:0 0 0 1px var(--sq-attention)}
.sq-node[data-s=failed]{border-top-color:var(--sq-failed);box-shadow:0 0 0 1px var(--sq-failed)}
.sq-node[data-s=stopped]{border-top-color:var(--sq-stopped);opacity:.72}
.sq-node[data-kind=run]{border-width:1px 1px 1px 1px;border-top-width:4px}
.sq-node[data-selected]{box-shadow:0 0 0 2px var(--sq-accent)}
.sq-node[data-folded]{box-shadow:0 1px 3px rgba(0,0,0,.08),4px 4px 0 -1px var(--sq-panel),4px 4px 0 0 var(--sq-line),8px 8px 0 -1px var(--sq-panel),8px 8px 0 0 var(--sq-line)}
.sq-node[data-new]{animation:sq-grow .35s ease-out}
.sq-node[data-flash]{animation:sq-node-flash 1.1s ease-out}
@keyframes sq-grow{from{opacity:0;scale:.82;translate:0 -18px}to{opacity:1;scale:1;translate:0 0}}
@keyframes sq-node-flash{0%,60%{box-shadow:0 0 0 4px var(--sq-attention)}100%{box-shadow:0 0 0 0 transparent}}
.sq-node-head{display:flex;align-items:center;gap:8px;min-width:0}
.sq-node-who{flex:1;min-width:0}
.sq-node-role{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sq-node-model{font-size:11px;color:var(--sq-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sq-node-title{font-size:13px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sq-node-note{font-size:11px;color:var(--sq-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sq-node-count{position:absolute;right:-8px;bottom:-10px;min-width:22px;height:22px;border-radius:11px;border:1px solid var(--sq-line);background:var(--sq-panel);color:var(--sq-text);font:600 11px/20px system-ui,sans-serif;cursor:pointer;padding:0 6px}
.sq-avatar{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;color:#fff;font:600 13px/1 system-ui,sans-serif;flex:none;object-fit:cover}
.sq-drawer{position:absolute;right:0;top:0;bottom:0;width:360px;max-width:80%;z-index:4;background:var(--sq-panel);border-left:1px solid var(--sq-line);padding:14px;overflow:auto;display:flex;flex-direction:column;gap:8px;box-shadow:-8px 0 24px rgba(0,0,0,.12)}
.sq-reason{color:var(--sq-failed)}
.sq-pre{white-space:pre-wrap;word-break:break-word;margin:0;font-size:12px}
.sq-tech summary{cursor:pointer;color:var(--sq-muted);font-size:12px}
@media (prefers-reduced-motion:reduce){.sq-node,.sq-layer{transition:none}.sq-node[data-new]{animation:sq-fade .2s}.sq-node[data-flash]{animation:none;box-shadow:0 0 0 3px var(--sq-attention)}}
@keyframes sq-fade{from{opacity:0}to{opacity:1}}
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
.sq-dock{display:flex;align-items:center;gap:8px;padding:6px 10px;margin:0 0 6px;border:1px solid var(--sq-line);border-radius:10px;font-size:13px;color:var(--sq-text);background:var(--sq-panel)}
.sq-bar{height:8px;border-radius:4px;background:var(--sq-accent)}
`

export function installStyles() {
  const style = document.createElement('style')
  style.dataset.squad = 'page'
  style.textContent = CSS
  document.head.append(style)
  return () => style.remove()
}
