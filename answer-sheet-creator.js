import { db } from "./firebase.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";
import { normalizeTemplate, buildExamVersion, answerKeyForVersion } from "./exam-schema.js";

if(!requireTeacherAuth()) throw new Error("Teacher authentication required.");

const teacherIdentity=document.getElementById("teacherIdentity");
const logoutBtn=document.getElementById("logoutBtn");
const templateSelect=document.getElementById("templateSelect");
const versionSelect=document.getElementById("versionSelect");
const openLines=document.getElementById("openLines");
const refreshBtn=document.getElementById("refreshBtn");
const printBtn=document.getElementById("printBtn");
const sheetStatus=document.getElementById("sheetStatus");
const studentSheet=document.getElementById("studentSheet");
const teacherKey=document.getElementById("teacherKey");

let templates={};

teacherIdentity.textContent=getTeacherName();

function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function optionLetter(index){return String.fromCharCode(65+Number(index||0));}

function answerControl(item){
  const q=item.snapshot;
  if(q.type==="multiple-choice"){
    return `<div class="mc-options">${q.options.map((_,i)=>`<span class="bubble">${optionLetter(i)}</span>`).join("")}</div>`;
  }
  if(q.type==="true-false"){
    return '<div class="tf-options"><span class="bubble">T</span><span class="bubble">F</span></div>';
  }
  if(q.type==="matching"){
    return `<div class="match-lines">${q.matchingPairs.map((pair,i)=>`<div class="match-row"><span>${escapeHtml(pair.left||`Item ${i+1}`)}</span><span></span></div>`).join("")}</div>`;
  }
  const count=Math.max(1,Math.min(12,Number(openLines.value||4)));
  return `<div class="open-lines">${Array.from({length:count},()=>"<span></span>").join("")}</div>`;
}

function keyValue(entry,item){
  const q=item.snapshot;
  if(q.type==="multiple-choice"){
    const idx=Number(entry.answerKey);
    return Number.isInteger(idx)&&idx>=0 ? `${optionLetter(idx)}. ${escapeHtml(q.options[idx]||"")}` : "—";
  }
  if(q.type==="true-false") return entry.answerKey===true?"True":entry.answerKey===false?"False":"—";
  if(q.type==="matching") return q.matchingPairs.map((pair)=>`${escapeHtml(pair.left)} → ${escapeHtml(pair.right)}`).join("<br>");
  return escapeHtml(String(entry.answerKey||"Expected response not specified."));
}

function generate(){
  const id=templateSelect.value;
  if(!id||!templates[id]){
    studentSheet.innerHTML='<div class="sheet-head"><h2>Student Answer Sheet</h2><p>Select an exam template.</p></div>';
    teacherKey.innerHTML='<div class="sheet-head"><h2>Teacher Answer Key</h2><p>Select an exam template.</p></div>';
    sheetStatus.textContent="Select an exam template.";
    return;
  }

  const template=normalizeTemplate({...templates[id],id});
  const version=versionSelect.value;
  const built=buildExamVersion(template,version);
  const key=answerKeyForVersion(template,version);
  const keyByNumber=new Map(key.map((entry)=>[entry.number,entry]));

  studentSheet.innerHTML=`
    <div class="sheet-head">
      <h2>${escapeHtml(template.title)}</h2>
      <p>Answer Sheet · Version ${escapeHtml(version)} · ${built.totalQuestions} questions</p>
    </div>
    <div class="student-line">
      <span>Name:</span><span>Group:</span><span>Date:</span>
    </div>
    ${built.sections.map((section)=>`
      <section class="sheet-section">
        <h3>${escapeHtml(section.title)}</h3>
        ${section.instructions?`<div class="sheet-section-instructions">${escapeHtml(section.instructions)}</div>`:""}
        ${section.questions.map((item)=>`
          <div class="answer-item">
            <span class="answer-number">${item.number}.</span>
            <div>${answerControl(item)}</div>
          </div>
        `).join("")}
      </section>
    `).join("")}
  `;

  teacherKey.innerHTML=`
    <div class="sheet-head">
      <h2>${escapeHtml(template.title)}</h2>
      <p>Teacher Answer Key · Version ${escapeHtml(version)} · ${built.totalPoints} total points</p>
    </div>
    <table class="key-table">
      <thead><tr><th>#</th><th>Section</th><th>Type</th><th>Correct answer / expected response</th><th>Pts</th></tr></thead>
      <tbody>
        ${built.sections.flatMap((section)=>section.questions.map((item)=>{
          const entry=keyByNumber.get(item.number);
          return `<tr><td>${item.number}</td><td>${escapeHtml(section.title)}</td><td>${escapeHtml(item.snapshot.type)}</td><td>${keyValue(entry,item)}</td><td>${escapeHtml(item.snapshot.pointValue)}</td></tr>`;
        })).join("")}
      </tbody>
    </table>
  `;

  sheetStatus.textContent=`Generated from template ${template.title}, version ${version}. Numbering and key come from the same schema.`;
  sheetStatus.className="status-text ok";
}

function applyUrlSelection(){
  const params=new URLSearchParams(location.search);
  const template=params.get("template");
  const version=(params.get("version")||"A").toUpperCase();
  if(template&&templates[template])templateSelect.value=template;
  if(["A","B"].includes(version))versionSelect.value=version;
  if(templateSelect.value)generate();
}

templateSelect.addEventListener("change",generate);
versionSelect.addEventListener("change",generate);
openLines.addEventListener("input",generate);
refreshBtn.addEventListener("click",generate);
printBtn.addEventListener("click",()=>window.print());
logoutBtn.addEventListener("click",logoutTeacher);

onValue(ref(db,"examTemplates"),(snapshot)=>{
  templates=snapshot.val()||{};
  const current=templateSelect.value;
  const rows=Object.entries(templates).sort((a,b)=>String(a[1]?.title||"").localeCompare(String(b[1]?.title||"")));
  templateSelect.innerHTML='<option value="">Select exam...</option>'+rows.map(([id,t])=>`<option value="${escapeHtml(id)}">${escapeHtml(t.title||"Untitled exam")}</option>`).join("");
  if(current&&templates[current])templateSelect.value=current;
  applyUrlSelection();
});
