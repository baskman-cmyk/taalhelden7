import { shuffle, normalize, arraysEqual } from "./utils.js?v=4.3.9";
import { MODE_LABELS, LEVEL_LABELS } from "./config.js?v=4.3.9";
const REWARD_TARGET=500;
const questionKey=q=>String(q?.id||normalize(`${q?.title||""}|${q?.text||""}|${q?.question||q?.word||""}`));
export class Session{
 constructor(database,state,onState,onReward){this.database=database;this.state=state;this.onState=onState;this.onReward=onReward;this.reset();}
 reset(){this.mode="";this.level="gr4";this.questions=[];this.index=0;this.score=0;this.selected=null;this.indices=new Set();this.answered=false;}
 start(mode,level){
  this.reset();this.mode=mode;this.level=level;
  const source=this.database[level][mode]||[];
  const amount=mode==="woordtrainer"?25:15;
  const target=Math.min(amount,source.length);
  const key=`${level}_${mode}`;
  this.state.questionHistory=this.state.questionHistory||{};
  this.state.textHistory=this.state.textHistory||{};
  this.state.lastQuestion=this.state.lastQuestion||{};
  let usedQuestions=new Set(this.state.questionHistory[key]||[]);
  let usedTexts=new Set(this.state.textHistory[key]||[]);
  const previousFirst=this.state.lastQuestion[key]||"";

  if(mode==="lezen"){
    const words=value=>new Set(normalize(value||"").split(/\s+/).filter(w=>w.length>2));
    const similarity=(a,b)=>{const aw=words(a),bw=words(b);if(!aw.size||!bw.size)return 0;let overlap=0;for(const w of aw)if(bw.has(w))overlap++;return overlap/Math.min(aw.size,bw.size);};
    const groups=[];
    for(const q of source){
      const text=String(q.text||"").trim();
      let group=groups.find(g=>similarity(text,g.text)>=0.60);
      if(!group){const explicit=q.textId?String(q.textId):normalize((q.title||"")+"|"+text).slice(0,240);group={id:explicit,text,items:[]};groups.push(group);}
      group.items.push(q);
    }
    const selectedGroups=new Set();
    const addFromGroups=pool=>{
      for(const group of shuffle(pool)){
        if(this.questions.length>=target||selectedGroups.has(group.id))continue;
        let candidates=shuffle(group.items).filter(q=>!usedQuestions.has(questionKey(q)));
        if(!candidates.length)candidates=shuffle(group.items);
        if(this.questions.length===0&&previousFirst)candidates.sort((a,b)=>(questionKey(a)===previousFirst)-(questionKey(b)===previousFirst));
        const q=candidates[0];if(!q)continue;
        this.questions.push(q);selectedGroups.add(group.id);usedTexts.add(group.id);usedQuestions.add(questionKey(q));
      }
    };
    addFromGroups(groups.filter(g=>!usedTexts.has(g.id)));
    // Is de oude cyclus bijna op, begin dan binnen dezelfde ronde een nieuwe
    // cyclus, maar kies nog steeds nooit twee vragen bij dezelfde leestekst.
    if(this.questions.length<target){usedTexts=new Set(selectedGroups);usedQuestions=new Set(this.questions.map(questionKey));addFromGroups(groups);}
  }else{
    const chosen=new Set();
    const addFromPool=pool=>{
      let candidates=shuffle(pool).filter(q=>!chosen.has(questionKey(q)));
      if(this.questions.length===0&&previousFirst)candidates.sort((a,b)=>(questionKey(a)===previousFirst)-(questionKey(b)===previousFirst));
      for(const q of candidates){if(this.questions.length>=target)break;const qk=questionKey(q);if(chosen.has(qk))continue;this.questions.push(q);chosen.add(qk);usedQuestions.add(qk);}
    };
    addFromPool(source.filter(q=>!usedQuestions.has(questionKey(q))));
    // Vul altijd tot exact 15/25 aan zodra de historiecyclus op is.
    if(this.questions.length<target){usedQuestions=new Set(chosen);addFromPool(source);}
  }

  const positions=shuffle(Array.from({length:this.questions.length},(_,i)=>i%4));
  this.questions=this.questions.map((q,i)=>{
    if(!Array.isArray(q.options)||!q.options.includes(q.correct))return q;
    const wrong=shuffle(q.options.filter(o=>o!==q.correct));const pos=Math.min(positions[i],q.options.length-1);const options=[...wrong];options.splice(pos,0,q.correct);return {...q,options};
  });
  this.state.questionHistory[key]=[...usedQuestions].slice(-5000);
  this.state.textHistory[key]=[...usedTexts].slice(-1000);
  this.state.lastQuestion[key]=questionKey(this.questions[0]);
  // Meteen opslaan, ook wanneer de gebruiker zonder antwoorden naar een ander onderdeel gaat.
  this.onState();
 }
 current(){return this.questions[this.index];} select(value){this.selected=value;} selectIndex(i,on){on?this.indices.add(i):this.indices.delete(i);}
 evaluate(input=""){
  if(this.answered||this.mode==="woordtrainer")return null;const q=this.current();let correct=false,answer="";
  if(q.type==="dictee"){correct=normalize(input)===normalize(q.word);answer=q.word;}
  else if(q.type==="grammar"){correct=arraysEqual([...this.indices].sort((a,b)=>a-b),[...q.correctIndices].sort((a,b)=>a-b));answer=q.correctText;}
  else{if(this.selected===null)return{missing:true};correct=this.selected===String(q.correct);answer=q.explanation||String(q.correct);}
  this.answered=true;const p=this.state.progress[this.mode];p.answered++;if(correct)p.correct++;let reward=false;
  if(correct){
   this.score++;
   const earned=this.mode==="engels"?0.1:1;
   this.state.points=Math.round((this.state.points+earned)*10)/10;
   this.state.rewardProgress=Math.round(((this.state.rewardProgress||0)+earned)*10)/10;
   while(this.state.rewardProgress>=REWARD_TARGET){
    this.state.rewardProgress=Math.round((this.state.rewardProgress-REWARD_TARGET)*10)/10;
    this.state.rewards++;
    reward=true;
   }
  }
  this.onState();if(reward)this.onReward();return{correct,answer,reward};
 }
 next(){this.index++;this.selected=null;this.indices.clear();this.answered=false;return this.index<this.questions.length;}
 previous(){if(this.index>0){this.index--;this.selected=null;this.indices.clear();this.answered=false;}return this.index>=0;}
 finish(){if(this.mode!=="woordtrainer"){this.state.streak++;this.state.progress[this.mode].sessions++;this.state.history.push({date:new Date().toLocaleDateString("nl-NL"),mode:MODE_LABELS[this.mode],level:LEVEL_LABELS[this.level],score:`${this.score} / ${this.questions.length}`});this.onState();}}
}
