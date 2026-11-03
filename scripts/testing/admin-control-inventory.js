'use strict';
// Fixed semantic contracts exclude row counts, icons, transient loading and dates.
function adminControlInventory(document){
 const root=document.getElementById('adminContent');
 const actionName=value=>{const m=String(value||'').match(/^\s*(?:return\s+)?([A-Za-z_$][\w.$]*)\s*\(/);return m?.[1]||String(value||'').trim();};
 const unique=items=>[...new Set(items)].sort();
 return {
  actions:unique([...root.querySelectorAll('[onclick],[onchange],[oninput],[onsubmit],[data-tm-action]')].flatMap(n=>['onclick','onchange','oninput','onsubmit','data-tm-action'].filter(a=>n.hasAttribute(a)).map(a=>a+':'+actionName(n.getAttribute(a))))),
  fields:unique([...root.querySelectorAll('input,select,textarea')].map(n=>JSON.stringify([n.tagName,n.id,n.name,n.type]))),
  forms:unique([...root.querySelectorAll('form')].map(n=>JSON.stringify([n.id,n.name,n.getAttribute('action'),n.method]))),
  routes:unique([...root.querySelectorAll('a[href]')].map(n=>n.getAttribute('href')))
 };
}
module.exports={adminControlInventory};
