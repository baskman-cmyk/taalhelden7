import { MODES, LEVELS } from "./config.js?v=4.3.9";
import { EMBEDDED_DATA } from "./embeddedData.js?v=4.3.6";
import { buildGrammarQuestions } from "./grammar.js?v=4.3.6";
import { escapeRegExp, uniqueStrings, normalize } from "./utils.js?v=4.3.9";

const db=Object.fromEntries(LEVELS.map(level=>[level,Object.fromEntries(MODES.map(mode=>[mode,[]]))]));
const BAD_READING=[
  /de tekst gebruikt/i,/de lezer moet/i,/de eerste proef/i,/één duidelijke kern/i,
  /informatie uit verschillende zinnen combineren/i,/deze tekst is bedoeld/i,
  /de schrijver gebruikt/i,/voorbereiding veel invloed/i,/wat verandert er wanneer .*herschreven/i
];

const DISPLAY_NAMES=["Emma","Sophie","Julia","Tess","Noor","Sara","Mila","Eva","Daan","Sem","Finn","Lars","Bram","Luuk","Jesse","Amir","Aisha","Sofia","Liam","Maya"];
const SOURCE_NAMES=["Yara","Mila","Sara","Daan","Lina","Finn","Omar","Iris","Fleur","Noah","Bram","Sem","Amir","Sam","Mees","Timo","Sofie","Nora","Lisa","Lotte","Sanne","Tom","Jip","Max","Levi","Lucas","Anna","Eva","Julia","Tess","Noor","Emma","Sophie","Jesse","Luuk","Lars","Aisha","Sofia","Liam","Maya"];
function readingNameIndex(q){let h=0;for(const ch of `${q.text||""}|${q.question||""}`)h=(h*31+ch.charCodeAt(0))>>>0;return h%DISPLAY_NAMES.length;}
function standardizeReadingNames(q){
  const found=SOURCE_NAMES.filter(name=>new RegExp(`\\b${name}\\b`,"g").test(`${q.text||""} ${q.question||""} ${(q.options||[]).join(" ")}`));
  if(!found.length)return q;const replacements=new Map();let start=readingNameIndex(q);found.forEach((name,i)=>replacements.set(name,DISPLAY_NAMES[(start+i)%DISPLAY_NAMES.length]));
  const change=value=>{let out=String(value||"");for(const [oldName,newName] of replacements)out=out.replace(new RegExp(`\\b${oldName}\\b`,"g"),newName);return out;};
  return {...q,text:change(q.text),question:change(q.question),options:(q.options||[]).map(change),correct:change(q.correct),explanation:change(q.explanation)};
}
const clean=s=>String(s||"").replace(/\s+/g," ").trim();
const keyOf=q=>normalize(`${q.text||""}|${q.question||""}|${q.correct||""}`);
function dedupe(items,keyFn=keyOf){const seen=new Set();return (items||[]).filter(x=>{const k=keyFn(x);if(!k||seen.has(k))return false;seen.add(k);return true;});}
function safeReading(q){
  const combined=`${q?.text||""} ${q?.question||""}`;
  return q&&clean(q.text).length>35&&clean(q.question).length>5&&!BAD_READING.some(r=>r.test(combined))&&
    Array.isArray(q.options)&&(q.options.length===3||q.options.length===4)&&new Set(q.options).size===q.options.length&&q.options.includes(q.correct);
}
function repairReading(q){
  let text=clean(q.text);
  // Enkele duidelijk foutieve voornaamwoorden uit de brondata herstellen.
  text=text.replace(/Yara([^.!?]*\.)\s*Hij\b/g,"Yara$1 Zij").replace(/Yara([^.!?]*\.)\s*Zijn\b/g,"Yara$1 Haar");
  return {...q,text};
}

function expandReading(items,level){
  const out=[];
  for(const item of items||[]){
    if(item?.tekst&&Array.isArray(item.vragen)){
      item.vragen.forEach((v,i)=>{
        if(!v?.vraag||!Array.isArray(v.opties)||!v.antwoord)return;
        const idx="ABCD".indexOf(String(v.antwoord).toUpperCase());
        const correct=idx>=0?v.opties[idx]:v.antwoord;
        out.push({type:"choice",id:`${level}_${normalize(item.titel||item.tekst).slice(0,40)}_${i}`,textId:`${level}_${normalize(item.tekst)}`,title:clean(item.titel),text:clean(item.tekst),question:clean(v.vraag),options:v.opties.map(clean),correct:clean(correct),explanation:`Het juiste antwoord is: ${clean(correct)}.`});
      });
    } else out.push(item);
  }
  return out;
}
const simple=items=>dedupe((items||[]).filter(x=>x?.q&&Array.isArray(x.o)&&x.c!==undefined)
  .map(x=>({type:"choice",text:"",question:clean(x.q),options:x.o.map(clean),correct:clean(x.c)})));
const vocabulary7=items=>dedupe((Array.isArray(items)?items:[]).flatMap(item=>(item.vragen||[])
  .filter(q=>q?.vraag&&Array.isArray(q.opties)&&q.antwoord)
  .map(q=>({type:"choice",text:"",question:clean(q.vraag),options:q.opties.map(clean),correct:clean(q.antwoord)}))));
function word6(item){
  const q=clean(item.q),quoted=q.match(/['‘’"]([^'‘’"]+)['‘’"]/);if(quoted)return quoted[1].trim();
  let m=q.match(/^Wat is (?:een|de|het)\s+(.+?)\?$/i);if(m)return m[1].trim();
  m=q.match(/^Wat betekent\s+(.+?)\?$/i);if(m)return m[1].trim();
  return /^Welk woord past/i.test(q)?clean(item.c):"";
}
function meaningMaps(){
  const out={gr4:new Map(),gr5:new Map(),gr6:new Map(),gr7:new Map()};
  for(const level of ["gr4","gr5"]){
    for(const q of EMBEDDED_DATA.basis45[level]?.woordenschat||[]){
      const m=clean(q.question).match(/^Wat betekent ['‘’"](.+?)['‘’"]\?$/i);
      if(m&&q.correct)out[level].set(normalize(m[1]),clean(q.correct));
    }
  }
  for(const q of EMBEDDED_DATA.woordenschat6?.woordenschat||[]){const w=word6(q);if(w)out.gr6.set(normalize(w),clean(q.c));}
  for(const q of EMBEDDED_DATA.woordenschat7||[])if(q.woord&&q.betekenis)out.gr7.set(normalize(q.woord),clean(q.betekenis));
  return out;
}
const meanings=meaningMaps();
function normalizeSpelling(item,level){
  const nested=item?.spelling;
  const correct=clean(nested?.antwoord??item?.correct??item?.c);
  const options=nested?.opties??item?.options??item?.o;
  if(!correct||!Array.isArray(options)||!options.includes(correct))return null;
  let source=clean(item.tekst||item.text);
  const re=new RegExp(`\\b${escapeRegExp(correct)}\\b`,"i");
  let text="";
  if(source&&re.test(source)) text=source.replace(re,"..........");
  else {
    const meaning=meanings[level]?.get(normalize(correct));
    text=meaning?`Betekenis: ${meaning}`:"Kies de juiste spelling van het woord.";
  }
  return {type:"choice",text,question:"Welk woord is goed geschreven?",options:options.map(clean),correct,
    explanation:clean(nested?.uitleg||item.explanation)||`Je schrijft het woord als: ${correct}.`};
}
const TRAINER_MEANINGS_GR6={"architectuur":"De bouwkunst","authentiek":"betekent ongeveer hetzelfde als oorspronkelijk","berucht":"bekend om iets slechts of vervelends","dialect":"Een streektaal","eeuwenoud":"al vele eeuwen oud","exclusief":"zonder dat iets anders is meegerekend","gevel":"De voorkant van een gebouw","grachtengordel":"Grachten rondom het centrum","hedendaags":"betekent ongeveer hetzelfde als modern","historisch":"met de geschiedenis of het verleden te maken hebbend","internationaal":"Met meerdere landen te maken hebbend","levendig":"druk, vrolijk en vol beweging","monument":"Een beschermd oud gebouw","nationaal":"van of voor een heel land","oorspronkelijk":"betekent ongeveer hetzelfde als origineel","reserveren":"vooraf een plaats of tafel vastleggen","slenteren":"Langzaam rondlopen","statig":"betekent ongeveer hetzelfde als deftig","tarief":"Een vaste prijs","boeiend":"Interessant","catalogus":"Een lijst of boek met een overzicht van voorwerpen","eigendom":"betekent ongeveer hetzelfde als bezit","eindeloos":"zonder einde; het lijkt maar door te blijven gaan","exemplaar":"één voorwerp uit een grotere reeks","exposeren":"Tentoonstellen","gaaf":"heel en niet beschadigd","galerie":"ruimte waar kunst wordt getoond of verkocht","impressie":"Een eerste indruk","kenmerk":"betekent ongeveer hetzelfde als eigenschap","koestert":"zorgt liefdevol voor iets en bewaart het graag","kunstenaar":"Iemand die kunst maakt","liefhebber":"Iemand die ergens veel van houdt","origineel":"oorspronkelijk en niet nagemaakt","schoonheid":"Wat iets mooi maakt","tentoonstellen":"betekent ongeveer hetzelfde als exposeren","toelichting":"extra uitleg waardoor iets duidelijker wordt","uniek":"Er is er maar één","vitrinekast":"glazen kast waarin bijzondere voorwerpen worden getoond","waardevol":"betekent ongeveer hetzelfde als kostbaar","categorie":"Een groep dingen die bij elkaar horen","collectie":"verzameling voorwerpen die bij elkaar horen","compleet":"Er ontbreekt niets","detail":"Een klein onderdeel","expositie":"tentoonstelling van kunst of bijzondere voorwerpen","gewild":"betekent ongeveer hetzelfde als geliefd","liefhebberij":"Een hobby","object":"een ding of voorwerp","omvangrijk":"Groot","ordenen":"betekent ongeveer hetzelfde als sorteren","modern":"van deze tijd; eigentijds","passie":"iets wat je heel graag doet of belangrijk vindt","pronkstuk":"Een bijzonder of mooi voorwerp","rage":"Iets dat korte tijd erg populair is","samenstellen":"Een geheel maken uit verschillende delen","uitstallen":"voorwerpen netjes neerzetten zodat mensen ze kunnen zien","verzamelaar":"Iemand die dingen verzamelt","vondst":"Iets dat je gevonden hebt","zeldzaam":"iets dat maar weinig voorkomt","onderbrengen":"Iemand een veilige plek geven","overtocht":"reis over water naar de andere kant","passagier":"Iemand die meereist","passagiersschip":"Een schip dat mensen vervoert","reddingsactie":"actie om mensen of dieren uit gevaar te halen","scheepsramp":"ernstig ongeluk met een schip","schipperskind":"kind van ouders die op een schip werken of wonen","tragisch":"Heel verdrietig","veerboot":"boot die mensen en voertuigen heen en weer brengt","vergaan":"zinken, verdwijnen of helemaal kapotgaan","in nood zijn":"in gevaar of grote problemen zijn en hulp nodig hebben","passagiers":"mensen die met een voertuig of schip meereizen","afgezonderd":"apart en op afstand van anderen","ondergebracht":"tijdelijk een plek gegeven om te wonen of verblijven","afdalen":"Naar beneden gaan","begane grond":"laagste verdieping van een gebouw, op straatniveau","container":"Een grote bak voor goederen of afval","dassenburcht":"ondergronds gangenstelsel waarin dassen wonen","delfstof":"Een stof die uit de grond wordt gehaald","delven":"betekent ongeveer hetzelfde als opgraven","doorsnede":"Wat je aan de binnenkant ziet als iets is doorgesneden","edelmetaal":"Een kostbaar metaal zoals goud of zilver","gangenstelsel":"Een netwerk van gangen die met elkaar verbonden zijn","grondwater":"water dat onder de grond zit","kruipruimte":"Een lage ruimte onder een huis","mijn":"Een ondergrondse plaats waar delfstoffen worden gewonnen","mijnwerker":"iemand die onder de grond grondstoffen wint","onderaards":"betekent ongeveer hetzelfde als ondergronds","de ondergrondse":"De metro","opgraven":"iets voorzichtig uit de grond halen","schacht":"Een gang die recht naar beneden loopt","souterrain":"Een verdieping die gedeeltelijk onder de grond ligt","steenkool":"Een zwarte delfstof die als brandstof wordt gebruikt","vluchtroute":"veilige weg om bij gevaar een gebouw te verlaten","afvalwater":"Gebruikt en vervuild water","afvoer":"buis of opening waardoor water of afval wegstroomt","archeoloog":"Iemand die resten uit het verleden onderzoekt","beerput":"Een put waarin vroeger ontlasting werd opgevangen","drek":"betekent ongeveer hetzelfde als vieze modder","fossiel":"versteend overblijfsel of afdruk van een plant of dier","gewelf":"Een gebogen plafond","grondig":"betekent ongeveer hetzelfde als zorgvuldig","hemelwater":"Water uit regen, sneeuw of hagel","lozen":"betekent ongeveer hetzelfde als weg laten stromen","muf":"niet fris ruikend; bedompt of oud van geur","overlopen":"zo vol raken dat de inhoud over de rand stroomt","overtollig":"Meer dan nodig","riool":"Een stelsel van buizen waardoor afvalwater wegstroomt","smurrie":"Een vieze, kleverige stof","straatniveau":"De hoogte waarop de straat ligt","verontreinigd":"betekent ongeveer hetzelfde als vervuild","versteend":"In steen veranderd","waterpeil":"hoogte van het water","zuiveren":"betekent ongeveer hetzelfde als schoonmaken","balanceren":"In evenwicht proberen te blijven","beoefent":"doet een sport of activiteit regelmatig","conditie":"Hoe fit en gezond je lichaam is","duursport":"Een sport die je lang achter elkaar doet","fanatiek":"betekent ongeveer hetzelfde als gedreven","geblesseerd":"gewond geraakt tijdens sport of beweging","individuele sport":"Een sport die je alleen beoefent","pass":"Een bal naar een medespeler spelen","prof":"Iemand die van sport zijn beroep heeft gemaakt","puck":"platte harde schijf waarmee ijshockey wordt gespeeld","schakelen":"Van het ene naar het andere overgaan","sensationeel":"betekent ongeveer hetzelfde als spectaculair","serveren":"de bal bij tennis in het spel brengen","sportief":"Eerlijk spelen en goed tegen verlies kunnen","startblok":"Een blok waar een sprinter zich tegen afzet","stick":"lange stok waarmee je bij hockey de bal slaat","tackelen":"Een tegenstander stoppen","techniek":"De manier waarop je iets uitvoert","timing":"het precies juiste moment kiezen","aanbevelen":"betekent ongeveer hetzelfde als aanraden","aanloop":"Het stukje rennen om vaart te maken","actief":"veel bezig en in beweging","raadde":"gaf iemand advies","angsthaas":"Iemand die snel bang is","blessure":"Een verwonding tijdens het sporten","hindernis":"Iets waar je overheen of omheen moet","incasseren":"betekent ongeveer hetzelfde als verdragen","inspannen":"veel moeite doen om iets te bereiken","kick":"Een sterk gevoel van spanning en plezier","lef":"betekent ongeveer hetzelfde als durf","ontspannen":"rustig en niet gespannen","parcours":"De route van een wedstrijd","passief":"weinig actief zijn en zelf bijna niets doen","piste":"aangelegde route waarop mensen skiën","recreatief":"Voor ontspanning en plezier","roekeloos":"onvoorzichtig handelen zonder goed aan gevaar te denken","tempo":"De snelheid waarmee iets gebeurt","vrees":"betekent ongeveer hetzelfde als angst","waaghals":"iemand die gevaarlijke dingen durft te doen","aandrang":"Een sterk gevoel dat je iets moet doen","anus":"opening aan het einde van de darmen","bacterie":"Een piepklein organisme dat nuttig of schadelijk kan zijn","diarree":"Heel dunne ontlasting","dikke darm":"deel van de darm dat water uit voedselresten haalt","dunne darm":"Het deel van de darm waar voedingsstoffen worden opgenomen","enzym":"Een stof die helpt bij de vertering","gal":"Een sap dat helpt vetten te verteren","lever":"orgaan dat stoffen verwerkt en het bloed helpt schoonhouden","maag-darmkanaal":"De maag en darmen samen","ontlasting":"Poep","orgaan":"Een deel van het lichaam met een eigen taak","slokdarm":"buis waardoor eten van de mond naar de maag gaat","spijs":"Klaargemaakt eten","verstopping":"Moeilijk kunnen poepen","verteren":"betekent ongeveer hetzelfde als afbreken","voedingsstoffen":"stoffen in eten die je lichaam nodig heeft","calorie":"Een maat voor de hoeveelheid energie in eten","eetpatroon":"De gewoonte van wat en wanneer je eet","eiwit":"Een voedingsstof voor de opbouw van je lichaam","gevarieerd":"betekent ongeveer hetzelfde als afwisselend","in balans":"In evenwicht","koolhydraten":"voedingsstoffen die het lichaam energie geven","leveren":"Geven","vet opslaan":"Vet bewaren in het lichaam","pasta":"deegwaar zoals spaghetti, macaroni of penne","peulvrucht":"Een plant zoals een boon of erwt","vegetariër":"Iemand die geen vlees en vis eet","verbruiken":"betekent ongeveer hetzelfde als opmaken","verzadigd vet":"Een vet dat veel voorkomt in boter en vet vlees","vezels":"delen van plantaardig voedsel die goed zijn voor de darmen","vitamine":"Een stof die je lichaam nodig heeft om gezond te blijven","vleesvervanger":"Een product dat je in plaats van vlees kunt eten","voedzaam":"Rijk aan gezonde voedingsstoffen","voldaan":"betekent ongeveer hetzelfde als tevreden","zuivel":"producten die van melk zijn gemaakt","acteur":"Iemand die een rol speelt in een film of toneelstuk","auditie":"proef waarbij iemand laat zien of hij een rol kan spelen of zingen","auteur":"De schrijver van een boek of tekst","componist":"Iemand die muziek bedenkt en schrijft","decor":"De achtergrond en voorwerpen op een toneel","dolgelukkig":"betekent ongeveer hetzelfde als heel blij","geluidsman":"iemand die tijdens een opname of voorstelling het geluid regelt","hoofdrol":"De belangrijkste rol in een voorstelling","kleurrijk":"Met veel verschillende kleuren","langdradig":"onnodig lang en daardoor soms saai","ontroerend":"Een sterk gevoel oproepend","ontwerper":"Iemand die bedenkt hoe iets eruit moet zien","ovatie":"lang en enthousiast applaus","plankenkoorts":"Zenuwachtig zijn voor een optreden","podium":"Een verhoging waarop wordt opgetreden","première":"allereerste openbare voorstelling van een film of toneelstuk","regisseur":"Iemand die de leiding heeft over een film of toneelstuk","rekwisiet":"Een voorwerp dat tijdens een voorstelling wordt gebruikt","repeteren":"betekent ongeveer hetzelfde als oefenen","theatervoorstelling":"optreden of toneelstuk dat in een theater wordt gespeeld","aanraden":"betekent ongeveer hetzelfde als adviseren","afraden":"iemand adviseren om iets niet te doen","geluidseffect":"Een extra geluid dat een scène echter maakt","kritiek":"oordeel waarin iemand zegt wat goed of minder goed is","lovend":"betekent ongeveer hetzelfde als prijzend","negatief":"Afkeurend of ongunstig","noteren":"betekent ongeveer hetzelfde als opschrijven","pers":"journalisten die nieuws verzamelen en verspreiden","personage":"Een persoon in een verhaal of film","plot":"De verhaallijn van een verhaal","positief":"gunstig, hoopvol of goed","recensie":"geschreven beoordeling van een boek, film of voorstelling","recensent":"Iemand die recensies schrijft","repetitie":"Een oefening voor een voorstelling","roem":"Grote bekendheid","scenario":"tekst met scènes, gesprekken en aanwijzingen voor een film of toneelstuk","scène":"Een deel van een toneelstuk of film","theatergezelschap":"Een groep mensen die samen toneel speelt","voorspelbaar":"van tevoren gemakkelijk te verwachten","waardering":"positief gevoel of respect voor iets of iemand","afgelegen":"Ver weg van plaatsen waar veel mensen wonen","communiceren":"informatie of gedachten met elkaar uitwisselen","duurzaam":"Rekening houdend met natuur en toekomst","expeditie":"Een ontdekkingstocht","gids":"Iemand die anderen rondleidt","houtkap":"het omhakken van bomen voor hout","jungle":"Een dicht tropisch regenwoud","klamboe":"Een muskietennet voor over een bed","leefgebied":"De omgeving waarin een plant of dier leeft","lokaal":"betekent ongeveer hetzelfde als plaatselijk","natuurreservaat":"beschermd gebied voor planten en dieren","observeren":"Heel goed kijken naar wat er gebeurt","ongerept":"Nog niet door mensen veranderd","oorverdovend":"zo hard dat het bijna pijn doet aan je oren","opvangcentrum":"Een plek waar mensen of dieren verzorgd worden","regenwoud":"Een tropisch bos waar veel regen valt","spectaculair":"betekent ongeveer hetzelfde als indrukwekkend","tropen":"Warme gebieden rond de evenaar","verblijf":"de tijd of plaats waar iemand tijdelijk woont","verkennen":"Een gebied onderzoeken","avonturier":"Iemand die graag spannende reizen maakt","bevat":"heeft iets in zich","bloedzuiger":"Een dier dat bloed opzuigt","diervriendelijk":"Rekening houdend met het welzijn van dieren","eetbaar":"geschikt en veilig om te eten","expert":"iemand die heel veel van een onderwerp weet","huidirritatie":"Jeuk of rode plekken op de huid","inheems":"Van nature thuishorend in een gebied","insectenbeet":"plek waar een insect heeft gebeten of gestoken","klimplant":"Een plant die ergens tegenaan groeit","liaan":"Een lange slingerende plant in de jungle","ontsmet":"schoongemaakt zodat ziektekiemen worden gedood","paradijs":"Een prachtige plek","survivalgids":"Een boek met tips om te overleven","transpireren":"betekent ongeveer hetzelfde als zweten","vermijden":"Ervoor zorgen dat je ergens niet mee te maken krijgt","voorkomen":"Ervoor zorgen dat iets niet gebeurt","wemelde":"er waren heel veel kleine dieren dicht bij elkaar","wildernis":"Een groot natuurgebied waar weinig mensen komen"};
function trainerCards(level){
  if(level==="gr6")return dedupe((EMBEDDED_DATA.woordenschat6.woordenschat||[]).map(x=>{
    const w=word6(x);
    if(!w)return null;
    const meaning=TRAINER_MEANINGS_GR6[normalize(w)];
    if(!meaning)return null;
    return {type:"flashcard",word:w,meaning,example:""};
  }).filter(Boolean),x=>normalize(x.word));
  if(level==="gr7")return dedupe((EMBEDDED_DATA.woordenschat7||[]).map(x=>({type:"flashcard",word:x.woord,meaning:x.betekenis,example:x.voorbeeldzin||""})).filter(x=>x.word&&x.meaning),x=>normalize(x.word));
  return [...meanings[level].entries()].map(([word,meaning])=>({type:"flashcard",word,meaning,example:""}));
}
function fill(level,records){
  db[level].spelling=dedupe(records.map(x=>normalizeSpelling(x,level)).filter(Boolean),x=>normalize(x.correct));
  db[level].lezen=[];
  db[level].grammatica=records.flatMap(buildGrammarQuestions);
}
export async function loadDatabase(){
  const {basis45,taal,lezenLang,woordenschat6,woordenschat7,engels6,engels7}=EMBEDDED_DATA;
  for(const level of ["gr4","gr5"]){
    db[level].lezen=dedupe(expandReading(basis45[level]?.lezen||[],level).map(repairReading).map(standardizeReadingNames).filter(safeReading));
    db[level].spelling=dedupe((basis45[level]?.spelling||[]).map(x=>normalizeSpelling(x,level)).filter(Boolean),x=>normalize(x.correct));
    db[level].dictee=dedupe(basis45[level]?.dictee||[],x=>normalize(x.word||x.woord||""));
    db[level].grammatica=basis45[level]?.grammatica||[];
    db[level].woordenschat=dedupe(basis45[level]?.woordenschat||[]);
    db[level].engels=dedupe(basis45[level]?.engels||[]);
  }
  const records=Array.isArray(taal.spelling)?taal.spelling:[];
  fill("gr6",records.filter(x=>Number(x.id)<=220));fill("gr7",records.filter(x=>Number(x.id)>220));
  db.gr6.lezen=dedupe(expandReading(lezenLang.gr6||[],"gr6").map(repairReading).map(standardizeReadingNames).filter(safeReading));
  db.gr7.lezen=dedupe(expandReading(lezenLang.gr7||[],"gr7").map(repairReading).map(standardizeReadingNames).filter(safeReading));
  db.gr6.woordenschat=simple(woordenschat6.woordenschat);db.gr7.woordenschat=vocabulary7(woordenschat7);
  db.gr6.engels=simple(engels6.engels);db.gr7.engels=simple(engels7.engelsGroep7);
  db.gr6.dictee=uniqueStrings((woordenschat6.woordenschat||[]).map(word6).filter(Boolean)).map(word=>({type:"dictee",word}));
  db.gr7.dictee=uniqueStrings((woordenschat7||[]).map(x=>x.woord).filter(Boolean)).map(word=>({type:"dictee",word}));
  for(const level of LEVELS)db[level].woordtrainer=trainerCards(level);
  for(const level of LEVELS)for(const mode of MODES)if(!db[level][mode]?.length)throw new Error(`Geen data voor ${level}/${mode}`);
  return db;
}
