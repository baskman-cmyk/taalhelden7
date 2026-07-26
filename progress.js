import { MODE_LABELS, PROGRESS_MODES } from "./config.js";
export function renderProgress(state,overview,history){
  overview.innerHTML=PROGRESS_MODES.map(mode=>{
    const p=state.progress?.[mode]||{answered:0,correct:0,sessions:0};
    const percent=p.answered?Math.round(p.correct/p.answered*100):0;
    const pointsText=mode==="leesavontuur"?` · ${p.points||p.correct||0} punten`:"";
    return `<article class="progress-card"><div><strong>${MODE_LABELS[mode]}</strong><span>${p.correct} van ${p.answered} goed</span></div><div class="meter"><div style="width:${percent}%"></div></div><small>${percent}% · ${p.sessions} sessies${pointsText}</small></article>`;
  }).join("");
  const rows=(state.history||[]).slice(-20).reverse();
  history.innerHTML=rows.length?rows.map(x=>`<tr><td>${x.date}</td><td>${x.mode}</td><td>${x.level}</td><td>${x.score}</td></tr>`).join(""):`<tr><td colspan="4">Nog geen oefeningen afgerond.</td></tr>`;
}
