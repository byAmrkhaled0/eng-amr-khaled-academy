'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),acorn=require('acorn');
module.exports=function installRenderActions(context){const source=fs.readFileSync(path.join(__dirname,'../../assets/app.js'),'utf8'),ast=acorn.parse(source,{ecmaVersion:'latest'});const nodes=ast.body.filter(n=>n.type==='FunctionDeclaration'&&['esc','renderActionAttrs','invokeRenderAction'].includes(n.id.name)||n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name==='TM_RENDER_ACTIONS'));vm.runInContext(nodes.map(n=>source.slice(n.start,n.end)).join('\n'),context);};
