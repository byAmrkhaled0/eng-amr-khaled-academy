'use strict';
const fs=require('node:fs'),path=require('node:path'),acorn=require('acorn');
const root=path.join(__dirname,'../..');
function inventory(){
 const rows=[];
 for(const file of ['functions/index.js','functions/entry.js']){
  const source=fs.readFileSync(path.join(root,file),'utf8'),ast=acorn.parse(source,{ecmaVersion:'latest',locations:true});
  function visit(node){
   if(!node||typeof node!=='object')return;
   if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&/^on(Call|Request|Schedule|Document)/.test(node.callee.name)){
    const parent=parents.get(node);let name;
    if(parent?.type==='AssignmentExpression'&&parent.left.type==='MemberExpression'&&parent.left.object.name==='exports'){
     if(!parent.left.computed)name=parent.left.property.name;
     else if(parent.left.property.type==='TemplateLiteral')name=parent.left.property.quasis.map(q=>q.value.cooked).join('*');
    }else if(parent?.type==='VariableDeclarator')name=parent.id.name;
    if(name){const callback=node.arguments.find(a=>['ArrowFunctionExpression','FunctionExpression'].includes(a.type)),body=callback?source.slice(callback.start,callback.end):source.slice(node.start,node.end),kind=node.callee.name;
     const category=kind!=='onCall'&&kind!=='onRequest'?'INTERNAL/TRIGGER/SCHEDULED':name==='activateOwnerAccount'||/\brequire(?:Staff|Admin)\(/.test(body)?'ADMIN':/\brequirePortalSession\(/.test(body)?(/\[\s*['"]parent['"]\s*\]/.test(body)?'PORTAL-PARENT':'PORTAL-STUDENT'):'PUBLIC';
     const names=[];if(name.includes('*')){let ancestor=parent;while(ancestor&&ancestor.type!=='ForOfStatement')ancestor=parents.get(ancestor);const declaration=ast.body.find(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name===ancestor?.right?.name));for(const v of (ancestor.right.type==='ArrayExpression'?ancestor.right.elements:declaration.declarations.find(d=>d.id.name===ancestor.right.name).init.elements))names.push(name.replace('*',v.value));}else names.push(name);
     for(const name of names)rows.push({name,file,line:node.loc.start.line,kind,category,guard:name==='activateOwnerAccount'?'verified admin claim bootstrap + existing profile revocation':category==='ADMIN'?'verified admin claim + users role/active':category.startsWith('PORTAL-')?'server portal session owner + mode + expiry':category==='PUBLIC'?'public contract / endpoint-specific limits':'platform event identity'});
    }
   }
   for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}
  }
  const parents=new WeakMap();function map(node){for(const value of Object.values(node)){for(const child of Array.isArray(value)?value:[value])if(child&&typeof child==='object'){parents.set(child,node);map(child);}}}map(ast);visit(ast);
 }
 return rows.sort((a,b)=>a.name.localeCompare(b.name));
}
module.exports={inventory};
if(require.main===module){const target=path.join(root,'docs/PHASE2_1_AUTHORIZATION_INVENTORY.json');fs.writeFileSync(target,JSON.stringify({schemaVersion:1,endpoints:inventory()},null,2)+'\n');console.log(target);}
