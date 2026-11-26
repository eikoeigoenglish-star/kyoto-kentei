// Node.js 単体テスト。ブラウザの DOM イベントは簡易スタブ。
const fs = require('fs'), vm = require('vm'), assert = require('assert/strict'), path = require('path');
const root = path.resolve(__dirname, '..');
let checks = 0; const pass=(name, cond)=>{assert.ok(cond,name); console.log('PASS',name);checks++};
const nodes = new Map(), listeners = new Map(), storage = new Map();
let timerFn = null;
const groups = {};
function el(id) { if (!nodes.has(id)) nodes.set(id,{id, hidden:false, textContent:'', style:{}, dataset:{}, classList:{add(){},remove(){},toggle(){}}, setAttribute(){}, append(){}, appendChild(){}, addEventListener(){}, querySelector: s=>el(id+s), querySelectorAll:()=>[], contains:()=>true});return nodes.get(id); }
const doc={createElement:()=>({textContent:"",className:"",append(){}}),getElementById:el,querySelector:el,querySelectorAll:s=>{const name=s.match(/input\[name="mock-([^\"]+)"\]/)?.[1];return groups[name]||[]},addEventListener(){},body:el('body'),documentElement:el('html')};
let confirmed=true; const win={addEventListener(){},setTimeout(fn,ms){assert.equal(ms,3000);timerFn=fn;return 1},clearTimeout(){timerFn=null},confirm:()=>confirmed,location:{href:'https://example.test/',search:'',hash:''},history:{},scrollTo(){}};
const c=vm.createContext({console, document:doc,window:win,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},URL,URLSearchParams,navigator:{},fetch:async u=>({ok:fs.existsSync(path.join(root,u)),json:async()=>JSON.parse(fs.readFileSync(path.join(root,u),'utf8'))})});
for(const name of ['app.js','mock.js','theme.js']) vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),c,{filename:name});
const run=s=>vm.runInContext(s,c);
function group(n, values, checked=values){groups[n]=values.map(value=>({value:String(value),checked:checked.map(String).includes(String(value)),disabled:false}));}
(async()=>{
 const P='kk2-progress-v1', T='kk2-theme-2026-toyotomi-progress-v1', M='kk2-mock-2026-progress-v1';
 storage.set(P,'{"k2-12-001":2}');storage.set(T,'{"theme-2026-toyotomi-001":3}');storage.set(M,'{"mock-2026-01-001":2,"mock-2026-02-001":1,"invalid":3}');
 group('round',[1,2,3,4,5]);group('range',Array.from({length:10},(_,i)=>`${i*10+1}-${i*10+10}`));group('stage',['new','miss','hit','double','triple']);group('count',['all','100','50','25','20','10','5','3','1'],['100']);group('order',['number','random'],['number']);
 // スタブ内では実際の HTML パースの代わりに描画入口だけを捕捉する。
 run('renderMockPanel=()=>{}; state.allQuestions=[{id:"k2-12-001"}]; state.progress=loadProgress()');await run('initMocks()');
 pass('load five v1.2 sets / 500 questions',run('mockState.ready && mockState.questions.length===500 && mockState.ids.size===500'));
 pass('saved mock data validation',run('mockState.progress["mock-2026-01-001"]===2 && !("invalid" in mockState.progress)'));
 pass('initial mock pool',run('mockPool().length===500'));
 pass('mock direct URL resolution',run('resolveMode("mock-2026")==="mock-2026"'));
 run('themeState.mode=MOCK_MODE; applyModeVisibility()');pass('mode panels exclusive',!el('mode-mock-2026').hidden&&el('mode-past').hidden&&el('theme-area').hidden);
 group('round',[1,2,3,4,5],[1]);pass('round filter',run('mockPool().length===100'));
 group('range',Array.from({length:10},(_,i)=>`${i*10+1}-${i*10+10}`),['1-10']);run('updateMockPanel()');pass('range filter and unavailable count disabled',run('mockPool().length===10')&&groups.count.find(i=>i.value==='100').disabled);
 group('stage',['new','miss','hit','double','triple'],['double']);run('updateMockPanel()');pass('stage filter and count fallback',run('mockPool().length===1')&&groups.count.find(i=>i.value==='1').checked);
 group('count',['all','100','50','25','20','10','5','3','1'],['1']);run('showScreen=()=>{};renderQuestion=()=>{};scrollPageTopImmediately=()=>{};startMock()');pass('start selected question and shuffle choices',run('state.session.kind==="mock" && state.questions.length===1 && state.questions[0].id==="mock-2026-01-001" && state.questions[0].displayChoices.length===4'));
 pass('mock metadata label',run('questionMetaLabel(state.questions[0]).includes("2026年度模試 第1回")'));pass('AI consult prompt source',run('buildAiConsultPrompt(state.questions[0],state.questions[0].correct).includes("非公式オリジナル模試")'));
 pass('judge correct and incorrect',run('judge(state.questions[0],state.questions[0].correct) && !judge(state.questions[0],undefined)'));
 pass('correct advances double to triple',run('applyMockResult(state.questions[0],true).after==="triple"'));run('finishMockSession()');pass('only mock key changed',JSON.parse(storage.get(M))['mock-2026-01-001']===3&&storage.get(P)==='{"k2-12-001":2}'&&storage.get(T)==='{"theme-2026-toyotomi-001":3}');
 pass('triple capped',run('applyMockResult(state.questions[0],true).after==="triple"'));pass('wrong resets to miss',run('applyMockResult(state.questions[0],false).after==="miss"'));run('finishMockSession()');
 confirmed=false;run('resetMockProgress(1)');pass('cancel preserves mock record',JSON.parse(storage.get(M))['mock-2026-01-001']===0);confirmed=true;run('resetMockProgress(1)');pass('round reset only touches round 1',JSON.stringify(JSON.parse(storage.get(M)))==='{"mock-2026-02-001":1}');run('resetMockProgress()');pass('global mock reset isolates other modes',storage.get(M)==='{}'&&storage.get(P)==='{"k2-12-001":2}'&&storage.get(T)==='{"theme-2026-toyotomi-001":3}');
 group('round',[1,2,3,4,5],[]);run('updateMockPanel()');pass('zero candidates disables start',el('mock-start').disabled);
 run('themeState.mode=PAST_MODE; applyModeVisibility()');pass('past panel restores',!el('mode-past').hidden&&el('mode-mock-2026').hidden);
 // 過去問・公開テーマの既存採点関数も変更なしで動作するか。
 pass('past stage transition',run('applyResult("k2-12-001",true).after==="triple"'));run('saveProgress()');pass('past save only past key',JSON.parse(storage.get(P))['k2-12-001']===3&&storage.get(M)==='{}');
 run(`themeState.themes=[{manifest:{id:"theme-2026-toyotomi",progressKey:"${T}"},progress:loadThemeProgress("${T}"),questions:[]}]`);pass('theme result still isolated',run('applyThemeResult("theme-2026-toyotomi","theme-2026-toyotomi-001",false).after==="miss"'));run('saveThemeProgress(themeState.themes[0])');pass('theme save only theme key',JSON.parse(storage.get(T))['theme-2026-toyotomi-001']===0&&storage.get(M)==='{}'&&JSON.parse(storage.get(P))['k2-12-001']===3);
 // 共有長押し処理をタイマーと pointer イベントのスタブで確認。
 const callbacks={}; const label={htmlFor:'test-round',classList:{add(){},remove(){}},setAttribute(){},addEventListener(){},closest:()=>label};
 const area=el('longpress-test');area.querySelectorAll=()=>[label];area.addEventListener=(name,fn)=>callbacks[name]=fn;el('test-round').value='3';c.resetEvents=[];
 run('installExamLongPressReset("longpress-test", n=>resetEvents.push(n))');
 const pointer={button:0,isPrimary:true,target:label,pointerId:1,clientX:20,clientY:20};
 callbacks.pointerdown(pointer);pass('3-second timer installed',typeof timerFn==='function');callbacks.pointerup(pointer);pass('short press cancels timer',timerFn===null&&c.resetEvents.length===0);
 callbacks.pointerdown(pointer);callbacks.pointermove({...pointer,clientX:40});pass('pointer movement cancels timer',timerFn===null);
 callbacks.pointerdown(pointer);const callback=timerFn;callback();let prevented=false;callbacks.click({target:label,preventDefault(){prevented=true},stopImmediatePropagation(){}});pass('long press calls only selected round and suppresses click',c.resetEvents.length===1&&c.resetEvents[0]===3&&prevented);
 // 100問出題と採点ルーティング（表示のみスタブ）。
 group('round',[1,2,3,4,5],[3]);group('range',Array.from({length:10},(_,i)=>`${i*10+1}-${i*10+10}`));group('stage',['new','miss','hit','double','triple']);group('count',['all','100','50','25','20','10','5','3','1'],['100']);group('order',['number','random'],['number']);run('startMock()');pass('full 100-question mock round in order',run('state.questions.length===100 && state.questions.every((q,i)=>q.mock===3 && q.questionNumber===i+1)'));
 run('state.questions.forEach(q=>state.answers[q.id]=q.correct);createResultItem=()=>({});showResult()');pass('shared result handler stores mock scores without altering past/theme',Object.keys(JSON.parse(storage.get(M))).length===100&&Object.values(JSON.parse(storage.get(M))).every(v=>v===1)&&JSON.parse(storage.get(P))['k2-12-001']===3&&JSON.parse(storage.get(T))['theme-2026-toyotomi-001']===0);
 // mock 読み込み失敗時の既存モードへのフォールバック。
 c.fetch=async()=>({ok:false,status:404});await run('initMocks()');pass('failed mock load disables mock mode',run('!mockState.ready && resolveMode(MOCK_MODE)===PAST_MODE')&&!el('mock-load-warning').hidden);
 console.log('TOTAL',checks);
})().catch(e=>{console.error(e);process.exitCode=1});
