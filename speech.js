let cachedVoices=[];

function refreshVoices(){
  if(!("speechSynthesis" in window))return [];
  const voices=speechSynthesis.getVoices()||[];
  if(voices.length)cachedVoices=voices;
  return cachedVoices;
}

if("speechSynthesis" in window){
  refreshVoices();
  speechSynthesis.addEventListener?.("voiceschanged",refreshVoices);
}

function preferredVoice(lang){
  const prefix=String(lang||"").toLowerCase().split("-")[0];
  const voices=refreshVoices();
  const matching=voices.filter(v=>String(v.lang||"").toLowerCase().startsWith(prefix));
  if(!matching.length)return null;

  const preferredDutch=[
    "Google Nederlands","Xander","Claire","Colette","Ellen","Fenna",
    "Lotte","Sofie","Nederlands","Dutch"
  ];
  const preferredEnglish=[
    "Google UK English Female","Daniel","Samantha","Karen","Moira",
    "Microsoft Sonia","Microsoft Ryan"
  ];
  const preferred=prefix==="nl"?preferredDutch:preferredEnglish;

  return matching.find(v=>preferred.some(name=>v.name.toLowerCase().includes(name.toLowerCase())))
    || matching.find(v=>v.localService)
    || matching[0];
}

function speak(text,lang,rate,{pitch=1,volume=1}={}){
  if(!("speechSynthesis" in window))return false;
  speechSynthesis.cancel();
  const msg=new SpeechSynthesisUtterance(String(text||""));
  msg.lang=lang;
  msg.rate=rate;
  msg.pitch=pitch;
  msg.volume=volume;
  const voice=preferredVoice(lang);
  if(voice)msg.voice=voice;
  speechSynthesis.speak(msg);
  return true;
}

export function speakDutchWord(text,rate=.8,{intro=false}={}){
  const wordRate=Math.max(.62,Math.min(.88,rate-.1));
  if(!intro)return speak(text,"nl-NL",wordRate,{pitch:1,volume:1});
  if(!("speechSynthesis" in window))return false;
  speechSynthesis.cancel();
  const prompt=new SpeechSynthesisUtterance("Schrijf het woord op.");
  prompt.lang="nl-NL";
  prompt.rate=Math.max(.68,Math.min(.88,rate-.04));
  prompt.pitch=1;
  const voice=preferredVoice("nl-NL");
  if(voice)prompt.voice=voice;
  prompt.onend=()=>setTimeout(()=>speak(text,"nl-NL",wordRate,{pitch:1,volume:1}),450);
  speechSynthesis.speak(prompt);
  return true;
}

export function englishText(question){
  const m=String(question.question||"").match(/['‘’"]([^'‘’"]+)['‘’"]/);
  return /^Wat betekent/i.test(question.question||"")&&m?m[1]:String(question.correct||m?.[1]||"");
}

export function speakEnglish(text,rate=.85){
  return speak(text,"en-GB",Math.max(.65,rate-.05),{pitch:1,volume:1});
}
