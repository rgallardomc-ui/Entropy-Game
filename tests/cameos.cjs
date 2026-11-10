// Run with: node tests/cameos.cjs. Executes the real game in a lightweight DOM shim.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const storage = new Map();
const elements = new Map();
const noop = () => {};
const canvas = new Proxy({}, { get: (o, k) => o[k] ?? noop, set: (o,k,v) => (o[k]=v,true) });
function el(id) {
  if (!elements.has(id)) {
    const classes = new Set();
    elements.set(id, { id, dataset:{}, style:{setProperty:noop}, textContent:'', innerHTML:'',
      classList:{add:(...v)=>v.forEach(x=>classes.add(x)),remove:(...v)=>v.forEach(x=>classes.delete(x)),contains:x=>classes.has(x),toggle:(x,v)=>{if(v===undefined)v=!classes.has(x);v?classes.add(x):classes.delete(x);return v;}},
      addEventListener:noop,setAttribute:noop,getContext:()=>canvas,
      getBoundingClientRect:()=>({width:960,height:540,left:0,top:0}),matches:()=>false,closest:()=>null });
  }
  return elements.get(id);
}
const document = {getElementById:el,querySelector:el,querySelectorAll:()=>[],addEventListener:noop,hidden:false,documentElement:el('html')};
const context = vm.createContext({console,document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},navigator:{getGamepads:()=>[]},requestAnimationFrame:noop,setTimeout:noop,setInterval:noop,clearInterval:noop,clearTimeout:noop,performance:{now:()=>0},matchMedia:()=>({matches:false,addEventListener:noop}),innerWidth:1200,innerHeight:900,addEventListener:noop});
context.window=context;
vm.runInContext(code,context);
const run = s => vm.runInContext(s,context);
let checks=0;
function check(s,message){assert.equal(run(s),true,message);checks++;}
function setup(i,hero='flux') {run(`save=freshSave();save.sound=false;save.music=false;save.unlocked=6;save.character=${JSON.stringify(hero)};save.characterChosen=true;resetStage(${i});stage.glassesOn=true;stage.previewSeen=true;stage.shiftPlayed=true;activeRun=true;arcadeSession=null;screen='play';dialogue=null;lessonFocus=null;projectiles=[];enemies=[];controls={};player={x:90,y:450,vx:0,vy:0,hp:4,invincible:0,charge:8,onGround:true,dir:1,jumps:0};checkpoint=90;equipped=0;powerTime=0;powerCooldown=0;shotTimer=0;`);}
function finish(){run(`for(let i=0;dialogue&&i<20;i++)advanceSpeech();`);}
check('levels.length===7 && Object.keys(characters).length===3 && powers.length===6','all worlds, characters and powers remain');
check("STORAGE==='entropy-quest-save-v1' && INSTRUCTIONS_VERSION==='3.1'",'existing save keys and instruction version retained');
const scenarios=[['spark',0,'stage.q=1;'],['battery',1,'stage.cells=2;player.x=660;'],['heat',2,"receiverHit({x:785,y:416,kind:'heat'});"],['zero',3,'stage.pump=1;stage.temp=160;stage.cooling=60;'],['boulder',4,'player.x=400;'],['catalyst',5,'stage.reactors[0].t=400;stage.reactors[0].loaded=1;'],['finale',6,'stage.finalStep=1;']];
for(const hero of ['flux','student','professor'])for(const [key,i,trigger] of scenarios){
 setup(i,hero);run(trigger);
 check('maybeProfessorCameo()','trigger '+key+' for '+hero);
 check(`stage.cameosSeen.${key}===true && dialogue.lines.some(l=>l[0]==='PIP')`,'remember cameo and Pip reply');
 check("dialogue.lines[0][0]==='PROFESSOR AARONS'",'correct professor speaker');
 run('constBefore=JSON.stringify({stage,player,projectiles,ticks,powerTime});');
 run('stepGame();stepGame();');
 check('constBefore===JSON.stringify({stage,player,projectiles,ticks,powerTime})','dialogue freezes world, resources and hazard timers');
 check(`JSON.parse(localStorage.getItem(STORAGE)).runs[${i}].stage.cameosSeen.${key}===true`,'cameo persists inside current run');
 finish();check('dialogue===null','exchange dismisses normally');
 check('!maybeProfessorCameo()','no repeated cameo');
 run(`persistRun();save=readSave();startLevel(${i});stage.preview=null;dialogue=null;`);
 check(`!maybeProfessorCameo() && stage.cameosSeen.${key}===true`,'no repeat after checkpoint restore');
}
setup(2);run("receiverHit({x:785,y:416,kind:'heat'});maybeProfessorCameo();dialogue.shown=999;renderSpeech();");
check(`dialogue.lines[0][1]==='Hold up, my Jamaican is about to come out!'`,'exact catchphrase on cold-to-hot attempt');
check("$('speech').dataset.reaction==='flustered'",'animated frustrated bubble selected');
check('!stage.receivers.some(Boolean) && !stage.done','invalid transfer never lights a receiver');
finish();run("receiverHit({x:785,y:416,kind:'heat'});");check('!maybeProfessorCameo()','repeated invalid heat uses ordinary hint');
run("receiverHit({x:460,y:416,kind:'heat'});receiverHit({x:625,y:324,kind:'heat'});");
check('stage.receivers[0] && stage.receivers[1] && stage.done','valid heat flow still opens the gate');
setup(4);run('player.x=435;player.y=floorAt(player.x);');check('beginAscent() && !!dialogue && !stage.ascent','boulder cameo precedes direct ascent');finish();check("stage.ascent?.mode==='entering' && stage.ascent.schema===3",'climb starts after cameo with original schema');
check('stage.ascent.weapon===1 && stage.ascent.pips===0','ascent upgrades remain original');
setup(5);run("stage.reagents=2;receiverHit({x:520,y:395,kind:'reagent',resource:'reagents'});");check('stage.reagents===3 && stage.reactors[0].loaded===0','unfavorable reaction refunds the seed');
for(const blocker of ["stage.preview={}","stage.shift={}","stage.ascent={}","stage.labDemo={}","stage.boss={}","lessonFocus={}","arcadeSession={}","screen='paused'"]){setup(4);run('player.x=400;'+blocker);check("!maybeProfessorCameo() && !stage.cameosSeen",'never interrupt '+blocker);}
setup(2);run("stage.cameoPending='heat';stage.preview={time:0};");check('!maybeProfessorCameo() && stage.cameoPending===\'heat\'','defer pending cameo safely');run('stage.preview=null;');check('maybeProfessorCameo()','deliver after safe point');finish();
setup(4);run("save.ambient=false;showProfessorCameo('boulder');");check("$('speech').dataset.still==='true'",'respect disabled motion');
setup(2);run("stage.energy=2;stage.cameosSeen={heat:true};save.xp=77;save.completed=[0,1];persistRun();selectCharacter('student');");
check("save.character==='student' && !save.runs[2]",'student has independent campaign');
run("selectCharacter('flux');");check("save.xp===77 && save.completed.length===2 && save.runs[2].stage.energy===2 && save.runs[2].stage.cameosSeen.heat",'switching back preserves original progress and cameo');
setup(2);run("receiverHit({x:785,y:416,kind:'heat'});stage.done=true;");check('maybeProfessorCameo()','pending error is not lost if another shot completes the world');
setup(0);run('stage.q=1;stage.energy=2;persistRun();save=readSave();startLevel(0);');check('stage.q===1 && stage.energy===2 && stage.glassesOn','legacy run without cameo fields restores');
setup(0);run("showProfessorCameo('spark');dialogue.shown=999;advanceSpeech();");check("$('speech').dataset.reaction==='quip' && $('speech').dataset.voice==='pip'",'Pip gets separate response animation');finish();run("say([['PIP','Normal hint.']]);");check("$('speech').dataset.reaction===''",'cameo reaction styling never leaks into story dialogue');
console.log(`${checks} checks passed: seven worlds, three heroes, heat rules, boulder continuation, pauses, reduced motion and save compatibility.`);
