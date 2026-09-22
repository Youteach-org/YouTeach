import { db } from "./firebase.js";
import { visibleGroups } from "./group-state.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const WORKING_GROUP_KEY = "youteachWorkingGroup";
let groupsCache = {};
let markedGroup = "";
let unsubscribeGroups = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function ensureWorkingGroupDialog() {
  let dialog = document.getElementById("workingGroupDialog");
  if (dialog) return dialog;

  const style = document.createElement("style");
  style.id = "workingGroupDialogStyles";
  style.textContent = `
    #workingGroupDialog{border:0;padding:0;background:transparent;max-width:none}
    #workingGroupDialog::backdrop{background:rgba(15,23,42,.5)}
    .working-group-popup{width:min(620px,92vw);max-height:82vh;overflow:hidden;background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(15,23,42,.28);display:grid;grid-template-rows:auto minmax(0,1fr) auto}
    .working-group-popup-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid #e2e8f0}
    .working-group-popup-head h3{margin:0;font-size:18px}
    .working-group-popup-close{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:9px;width:36px;height:34px;font-size:20px;cursor:pointer}
    .working-group-popup-list{padding:10px;overflow:auto;display:grid;gap:6px}
    .working-group-choice{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 12px;border:1px solid #dbe3ee;border-radius:10px;background:#fff;color:#0f172a;text-align:left;font:inherit;font-weight:800;cursor:pointer}
    .working-group-choice:hover{background:#f8fafc;border-color:#93c5fd}
    .working-group-choice.selected{background:#eff6ff;border-color:#2563eb;color:#1d4ed8}
    .working-group-choice.active::after{content:"Active";font-size:10px;color:#166534;background:#dcfce7;padding:3px 6px;border-radius:999px}
    .working-group-popup-empty{padding:20px;color:#64748b;text-align:center}
    .working-group-popup-actions{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid #e2e8f0}
    .working-group-popup-actions button{border:1px solid #cbd5e1;border-radius:9px;padding:8px 13px;font:inherit;font-weight:800;cursor:pointer}
    #workingGroupCancelBtn{background:#fff;color:#334155}
    #workingGroupSelectBtn{background:#0f172a;color:#fff;border-color:#0f172a}
    #workingGroupSelectBtn:disabled{opacity:.45;cursor:not-allowed}
  `;
  document.head.appendChild(style);

  dialog = document.createElement("dialog");
  dialog.id = "workingGroupDialog";
  dialog.innerHTML = `
    <section class="working-group-popup" role="document">
      <div class="working-group-popup-head">
        <h3>Select Working Group</h3>
        <button id="workingGroupCloseBtn" class="working-group-popup-close" type="button" aria-label="Close">×</button>
      </div>
      <div id="workingGroupPopupList" class="working-group-popup-list"></div>
      <div class="working-group-popup-actions">
        <button id="workingGroupCancelBtn" type="button">Cancel</button>
        <button id="workingGroupSelectBtn" type="button">Select</button>
      </div>
    </section>
  `;
  document.body.appendChild(dialog);

  dialog.querySelector("#workingGroupCloseBtn").addEventListener("click", () => dialog.close());
  dialog.querySelector("#workingGroupCancelBtn").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.querySelector("#workingGroupPopupList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-working-group]");
    if (!button) return;
    markedGroup = String(button.dataset.workingGroup || "");
    renderWorkingGroups();
  });
  dialog.querySelector("#workingGroupSelectBtn").addEventListener("click", () => {
    if (!markedGroup || !groupsCache[markedGroup]) return;
    sessionStorage.setItem(WORKING_GROUP_KEY, markedGroup);
    window.dispatchEvent(new CustomEvent("youteach:working-group-changed", {
      detail: { groupName: markedGroup }
    }));
    dialog.close();
  });

  return dialog;
}

function renderWorkingGroups() {
  const dialog = ensureWorkingGroupDialog();
  const list = dialog.querySelector("#workingGroupPopupList");
  const selectBtn = dialog.querySelector("#workingGroupSelectBtn");
  const active = String(sessionStorage.getItem(WORKING_GROUP_KEY) || "");
  const groups = Object.keys(groupsCache || {})
    .sort((a,b) => a.localeCompare(b, undefined, { sensitivity:"base" }));

  list.innerHTML = groups.length
    ? groups.map((groupName) => `
        <button type="button"
          class="working-group-choice${groupName === markedGroup ? " selected" : ""}${groupName === active ? " active" : ""}"
          data-working-group="${escapeHtml(groupName)}"
          aria-pressed="${String(groupName === markedGroup)}">
          <span>${escapeHtml(groupName)}</span>
        </button>
      `).join("")
    : '<div class="working-group-popup-empty">No groups available.</div>';

  selectBtn.disabled = !markedGroup || !groupsCache[markedGroup];
}

function ensureGroupsSubscription() {
  if (unsubscribeGroups) return;
  unsubscribeGroups = onValue(ref(db, "groups"), (snapshot) => {
    groupsCache = visibleGroups(snapshot.val() || {});
    const active = String(sessionStorage.getItem(WORKING_GROUP_KEY) || "");
    if (!markedGroup || !groupsCache[markedGroup]) {
      markedGroup = groupsCache[active] ? active : (Object.keys(groupsCache)[0] || "");
    }
    renderWorkingGroups();
  });
}

export function openWorkingGroupDialog() {
  const dialog = ensureWorkingGroupDialog();
  ensureGroupsSubscription();
  const active = String(sessionStorage.getItem(WORKING_GROUP_KEY) || "");
  markedGroup = groupsCache[active] ? active : (Object.keys(groupsCache)[0] || active || "");
  renderWorkingGroups();
  if (!dialog.open) dialog.showModal();
}

window.youteachWorkingGroupPopup = { open: openWorkingGroupDialog };
