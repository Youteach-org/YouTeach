import { db } from "./firebase.js";
import { ref, onValue, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { requireTeacherAuth, getTeacherName, logoutTeacher } from "./teacher-auth.js";
import {
  makeExamId,
  normalizeQuestion,
  snapshotQuestion,
  normalizeTemplate,
  validateTemplate,
  buildExamVersion,
  createExamInstance
} from "./exam-schema.js";

if (!requireTeacherAuth()) throw new Error("Teacher authentication required.");

const teacherIdentity=document.getElementById("teacherIdentity");
const logoutBtn=document.getElementById("logoutBtn");
const examTitle=document.getElementById("examTitle");
const examCourse=document.getElementById("examCourse");
const examUnit=document.getElementById("examUnit");
const versionBRule=document.getElementById("versionBRule");
const newTemplateBtn=document.getElementById("newTemplateBtn");
const saveTemplateBtn=document.getElementById("saveTemplateBtn");
const templateStatus=document.getElementById("templateStatus");
const templateList=document.getElementById("templateList");
const bankSearch=document.getElementById("bankSearch");
const bankType=document.getElementById("bankType");
const bankCourse=document.getElementById("bankCourse");
const bankTopic=document.getElementById("bankTopic");
const bankCount=document.getElementById("bankCount");
const bankList=document.getElementById("bankList");
const targetSectionSelect=document.getElementById("targetSectionSelect");
const addSectionBtn=document.getElementById("addSectionBtn");
const examSections=document.getElementById("examSections");
const examSummary=document.getElementById("examSummary");
const previewPanel=document.getElementById("previewPanel");
const previewTitle=document.getElementById("previewTitle");
const previewContent=document.getElementById("previewContent");
const previewABtn=document.getElementById("previewABtn");
const previewBBtn=document.getElementById("previewBBtn");
const openAnswerSheetBtn=document.getElementById("openAnswerSheetBtn");
const instanceVersion=document.getElementById("instanceVersion");
const instanceGroup=document.getElementById("instanceGroup");
const instanceDue=document.getElementById("instanceDue");
const createInstanceBtn=document.getElementById("createInstanceBtn");
const instanceStatus=document.getElementById("instanceStatus");

let questions={};
let templates={};
let groups={};
let assignments={};
let editingTemplateId="";
let sections=[];
let currentPreviewVersion="A";

teacherIdentity.textContent=getTeacherName();

function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function typeLabel(type){return ({"multiple-choice":"MC","true-false":"T/F","matching":"Matching","open-response":"Open"})[type]||type;}
function makeSection(title="Section"){return {id:makeExamId("section"),title,instructions:"",questions:[]};}

function resetTemplate(){
  editingTemplateId="";
  examTitle.value="";
  examCourse.value="";
  examUnit.value="";
  versionBRule.value="reverse-within-section";
  sections=[makeSection("Section 1")];
  templateStatus.textContent="";
  renderSections();
  renderTemplates();
}

function currentTemplate(){
  return normalizeTemplate({
    id:editingTemplateId||makeExamId("exam-template"),
    title:examTitle.value,
    course:examCourse.value,
    unit:examUnit.value,
    sections,
    versionRules:{A:"original",B:versionBRule.value},
    createdAt:editingTemplateId?templates?.[editingTemplateId]?.createdAt:Date.now(),
    createdBy:editingTemplateId?templates?.[editingTemplateId]?.createdBy:getTeacherName(),
    updatedAt:Date.now()
  });
}

function renderTargetSections(){
  targetSectionSelect.innerHTML=sections.map((s,i)=>`<option value="${escapeHtml(s.id)}">${i+1}. ${escapeHtml(s.title||"Section")}</option>`).join("");
}

function renderSections(){
  let qn=0;
  examSections.innerHTML=sections.length?sections.map((section,sectionIndex)=>`
    <article class="exam-section" data-section-id="${escapeHtml(section.id)}">
      <div class="exam-section-head">
        <input data-section-title value="${escapeHtml(section.title)}" placeholder="Section title">
        <textarea data-section-instructions placeholder="Section instructions">${escapeHtml(section.instructions||"")}</textarea>
        <button type="button" data-remove-section ${sections.length===1?"disabled":""}>Remove section</button>
      </div>
      <div class="selected-question-list">
        ${section.questions.length?section.questions.map((item,index)=>{
          qn+=1;
          return `
            <div class="selected-question" data-question-index="${index}">
              <span class="selected-number">${qn}</span>
              <div><strong>${escapeHtml(item.snapshot.prompt)}</strong><small>${escapeHtml(typeLabel(item.snapshot.type))} · ${escapeHtml(item.snapshot.pointValue)} pt${Number(item.snapshot.pointValue)===1?"":"s"}</small></div>
              <div class="selected-actions">
                <button type="button" data-move-up ${index===0?"disabled":""}>↑</button>
                <button type="button" data-move-down ${index===section.questions.length-1?"disabled":""}>↓</button>
                <button type="button" data-remove-selected>Remove</button>
              </div>
            </div>`;
        }).join(""):'<div class="status-text">Add questions from Question Bank.</div>'}
      </div>
    </article>
  `).join(""):'';
  renderTargetSections();
  const t=currentTemplate();
  const a=buildExamVersion(t,"A");
  examSummary.textContent=`${a.totalQuestions} questions · ${a.totalPoints} total points`;
}

function filteredQuestions(){
  const s=bankSearch.value.trim().toLowerCase();
  const type=bankType.value;
  const course=bankCourse.value.trim().toLowerCase();
  const topic=bankTopic.value.trim().toLowerCase();
  return Object.entries(questions).map(([id,raw])=>[id,normalizeQuestion({...raw,id})])
    .filter(([,q])=>q.active!==false)
    .filter(([,q])=>!s||[q.prompt,q.course,q.unit,q.topic,...q.tags].join(" ").toLowerCase().includes(s))
    .filter(([,q])=>!type||q.type===type)
    .filter(([,q])=>!course||q.course.toLowerCase().includes(course))
    .filter(([,q])=>!topic||q.topic.toLowerCase().includes(topic));
}

function renderBank(){
  const rows=filteredQuestions();
  bankCount.textContent=String(rows.length);
  bankList.innerHTML=rows.length?rows.map(([id,q])=>`
    <article class="bank-question">
      <h4>${escapeHtml(q.prompt)}</h4>
      <p>${escapeHtml(typeLabel(q.type))} · ${escapeHtml(q.pointValue)} pt${q.pointValue===1?"":"s"}${q.topic?` · ${escapeHtml(q.topic)}`:""}</p>
      <button type="button" data-add-bank-question="${escapeHtml(id)}">Add to exam</button>
    </article>
  `).join(""):'<div class="status-text">No matching questions.</div>';
}

function renderTemplates(){
  const rows=Object.entries(templates).sort((a,b)=>Number(b[1]?.updatedAt||0)-Number(a[1]?.updatedAt||0));
  templateList.innerHTML=rows.length?rows.map(([id,t])=>`<button type="button" data-load-template="${escapeHtml(id)}">${escapeHtml(t.title||"Untitled exam")}</button>`).join(""):'<span class="status-text">No saved templates yet.</span>';
}

function loadTemplate(id){
  const t=normalizeTemplate({...templates[id],id});
  editingTemplateId=id;
  examTitle.value=t.title;
  examCourse.value=t.course;
  examUnit.value=t.unit;
  versionBRule.value=t.versionRules.B||"reverse-within-section";
  sections=t.sections.map((section)=>({...section,questions:section.questions.map((q)=>({...q,snapshot:{...q.snapshot}}))}));
  renderSections();
  templateStatus.textContent="Template loaded.";
  templateStatus.className="status-text ok";
}

async function saveTemplate(){
  const {template,errors}=validateTemplate(currentTemplate());
  if(errors.length){
    templateStatus.textContent=errors.join(" ");
    templateStatus.className="status-text bad";
    return null;
  }
  const id=editingTemplateId||template.id||makeExamId("exam-template");
  const payload={...template,id,updatedAt:Date.now(),updatedBy:getTeacherName()};
  await set(ref(db,`examTemplates/${id}`),payload);
  editingTemplateId=id;
  templateStatus.textContent="Template saved.";
  templateStatus.className="status-text ok";
  return payload;
}

function renderPreview(version){
  const t=currentTemplate();
  const built=buildExamVersion(t,version);
  currentPreviewVersion=version;
  previewTitle.textContent=`Preview · Version ${version}`;
  previewContent.innerHTML=built.sections.map((section)=>`
    <section class="preview-section">
      <h4>${escapeHtml(section.title)}</h4>
      ${section.instructions?`<div class="status-text">${escapeHtml(section.instructions)}</div>`:""}
      ${section.questions.map((item)=>`
        <div class="preview-question">
          <strong>${item.number}.</strong>
          <span>${escapeHtml(item.snapshot.prompt)}</span>
          <span>${escapeHtml(item.snapshot.pointValue)} pts</span>
        </div>
      `).join("")}
    </section>
  `).join("");
  previewPanel.hidden=false;
  previewPanel.scrollIntoView({behavior:"smooth",block:"nearest"});
}

function compactTitle(value){
  const words=String(value||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g," ").trim().split(/\s+/).filter(Boolean);
  if(!words.length)return"EXAM";
  if(words.length===1)return words[0].slice(0,6);
  return words.slice(0,2).map(w=>w.slice(0,3)).join("").slice(0,6);
}
function compactGroup(value){
  const token=String(value||"ALL").normalize("NFD").replace(/[̀-ͯ]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g,"");
  return token.slice(0,6)||"ALL";
}
function dateCode(ms){
  const d=new Date(Number(ms)); if(Number.isNaN(d.getTime()))return"";
  return `${String(d.getDate()).padStart(2,"0")}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getFullYear()).slice(-2)}`;
}
function taskCode(title,group,dueAt){return `EX-${compactTitle(title)}-${compactGroup(group)}-${dateCode(dueAt)}`;}
function taskCodeExists(code){return Object.values(assignments||{}).some(a=>String(a?.code||"").toUpperCase()===String(code).toUpperCase());}

async function createInstance(){
  instanceStatus.textContent="";
  const dueAt=instanceDue.value?new Date(instanceDue.value).getTime():0;
  if(!dueAt){instanceStatus.textContent="Choose a due date.";instanceStatus.className="status-text bad";return;}
  let template;
  try{template=await saveTemplate();}catch(error){console.error(error);instanceStatus.textContent="Could not save template first.";instanceStatus.className="status-text bad";return;}
  if(!template)return;
  const code=taskCode(template.title,instanceGroup.value,dueAt);
  if(taskCodeExists(code)){instanceStatus.textContent="That Task Code already exists. Change group, title, or date.";instanceStatus.className="status-text bad";return;}

  const instance=createExamInstance({
    template,
    version:instanceVersion.value,
    groupName:instanceGroup.value,
    dueAt,
    title:template.title,
    createdBy:getTeacherName()
  });

  const assignmentId=makeExamId("assignment");
  const assignment={
    code,
    title:template.title,
    groupName:instanceGroup.value,
    instructions:"Submit your completed exam as one PDF file.",
    assignmentType:"Exam",
    assignmentTypeCode:"EX",
    examTemplateId:template.id,
    examInstanceId:instance.id,
    examVersion:instance.version,
    evaluationCriteria:{
      "exam-score":{
        id:"exam-score",
        type:"custom",
        title:"Exam score",
        description:"Overall exam performance based on the locked exam instance and its answer key.",
        maxPoints:100
      }
    },
    evaluationDistribution:"manual",
    evaluationNotes:"Use the locked exam instance/version and its answerKeySnapshot. Do not use an answer key from another version.",
    dueAt,
    active:true,
    storageProvider:"google-drive",
    createdAt:Date.now(),
    createdBy:getTeacherName()
  };

  instance.assignmentId=assignmentId;
  instance.taskCode=code;

  await Promise.all([
    set(ref(db,`examInstances/${instance.id}`),instance),
    set(ref(db,`assignments/${assignmentId}`),assignment)
  ]);

  instanceStatus.textContent=`Exam assignment created: ${code}`;
  instanceStatus.className="status-text ok";
}

bankList.addEventListener("click",(event)=>{
  const button=event.target.closest("[data-add-bank-question]"); if(!button)return;
  const id=button.dataset.addBankQuestion;
  const section=sections.find(s=>s.id===targetSectionSelect.value)||sections[0];
  const q=questions[id]; if(!section||!q)return;
  section.questions.push(snapshotQuestion({...q,id}));
  renderSections();
});

examSections.addEventListener("input",(event)=>{
  const card=event.target.closest("[data-section-id]"); if(!card)return;
  const section=sections.find(s=>s.id===card.dataset.sectionId); if(!section)return;
  if(event.target.matches("[data-section-title]"))section.title=event.target.value;
  if(event.target.matches("[data-section-instructions]"))section.instructions=event.target.value;
  renderTargetSections();
});
examSections.addEventListener("click",(event)=>{
  const card=event.target.closest("[data-section-id]"); if(!card)return;
  const sectionIndex=sections.findIndex(s=>s.id===card.dataset.sectionId); if(sectionIndex<0)return;
  const section=sections[sectionIndex];
  if(event.target.closest("[data-remove-section]")){sections.splice(sectionIndex,1);renderSections();return;}
  const qrow=event.target.closest("[data-question-index]"); if(!qrow)return;
  const index=Number(qrow.dataset.questionIndex);
  if(event.target.closest("[data-remove-selected]"))section.questions.splice(index,1);
  else if(event.target.closest("[data-move-up]")&&index>0)[section.questions[index-1],section.questions[index]]=[section.questions[index],section.questions[index-1]];
  else if(event.target.closest("[data-move-down]")&&index<section.questions.length-1)[section.questions[index+1],section.questions[index]]=[section.questions[index],section.questions[index+1]];
  renderSections();
});

addSectionBtn.addEventListener("click",()=>{sections.push(makeSection(`Section ${sections.length+1}`));renderSections();});
newTemplateBtn.addEventListener("click",resetTemplate);
saveTemplateBtn.addEventListener("click",()=>saveTemplate().catch((e)=>{console.error(e);templateStatus.textContent="Could not save template.";templateStatus.className="status-text bad";}));
templateList.addEventListener("click",(e)=>{const b=e.target.closest("[data-load-template]");if(b)loadTemplate(b.dataset.loadTemplate);});
for(const el of [bankSearch,bankCourse,bankTopic])el.addEventListener("input",renderBank);
bankType.addEventListener("change",renderBank);
previewABtn.addEventListener("click",()=>renderPreview("A"));
previewBBtn.addEventListener("click",()=>renderPreview("B"));
createInstanceBtn.addEventListener("click",()=>createInstance().catch((e)=>{console.error(e);instanceStatus.textContent="Could not create exam assignment.";instanceStatus.className="status-text bad";}));
openAnswerSheetBtn.addEventListener("click",()=>{
  if(!editingTemplateId){templateStatus.textContent="Save the template first.";return;}
  location.href=`answer-sheet-creator.html?template=${encodeURIComponent(editingTemplateId)}&version=${encodeURIComponent(currentPreviewVersion)}`;
});
logoutBtn.addEventListener("click",logoutTeacher);

onValue(ref(db,"examQuestionBank"),snap=>{questions=snap.val()||{};renderBank();});
onValue(ref(db,"examTemplates"),snap=>{templates=snap.val()||{};renderTemplates();});
onValue(ref(db,"groups"),snap=>{
  groups=snap.val()||{};
  const names=[...new Set(Object.values(groups).map(g=>String(g?.name||g?.groupName||"")).filter(Boolean))].sort();
  instanceGroup.innerHTML='<option value="ALL">All groups</option>'+names.map(n=>`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
});
onValue(ref(db,"assignments"),snap=>{assignments=snap.val()||{};});

resetTemplate();
