/* Loads the interior engine in plain Node (no browser) so check.js can run headless. Used by interiors-headless.js */
const vm=require('vm'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../../public/world')+'/';
const ctx={console,Math,Date,performance:{now:()=>0},setTimeout,clearTimeout,Promise};
ctx.window=ctx;ctx.globalThis=ctx;ctx.self=ctx;
const c2=new Proxy(function(){},{get:(t,k)=>k==='measureText'?(()=>({width:10})):k==='createLinearGradient'||k==='createRadialGradient'||k==='createPattern'?(()=>({addColorStop(){}})):k==='getImageData'?(()=>({data:new Uint8ClampedArray(4)})):(()=>{}),set:()=>true,apply:()=>{}});
ctx.URLSearchParams=URLSearchParams;
ctx.document={createElement:()=>({getContext:()=>c2,style:{},width:0,height:0,addEventListener(){}}),addEventListener(){},body:{}};
ctx.navigator={};ctx.location={search:''};ctx.addEventListener=()=>{};
vm.createContext(ctx);
const files=['vendor/three.min.js','game/avatar/avatar-options.js','game/avatar/avatar-core.js','game/avatar/avatar-body.js','game/avatar/avatar-wear.js','game/avatar/avatar-rig.js','game/avatar/avatar-build.js','game/avatar/avatar-npc.js','game/interior/clock.js','game/interior/activities.js','game/live/interact.js','game/interiors/kit.js','game/interiors/furniture.js','game/interiors/acts.js','game/interiors/rooms.js','game/interiors/stage.js','game/interiors/templates.js','game/interiors/check.js','game/interiors/tpl_res.js','game/interiors/tpl_bank.js','game/interiors/tpl_edu.js','game/interiors/tpl_commerce.js','game/interiors/tpl_care.js'];
for(const f of files){try{vm.runInContext(fs.readFileSync(root+f,'utf8'),ctx,{filename:f});}catch(e){console.log('LOADFAIL',f,e.message.slice(0,200));}}

module.exports=ctx;
