import { db } from "./firebase.js";
import {
  ref,
  onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { visibleGroups } from "./group-state.js";
import { studentInGroup } from "./student-groups.js";
import { groupEvaluationConfig } from "./group-evaluation-model.js";

const WORKING_GROUP_KEY = "youteachWorkingGroup";

const standaloneState = {
  groups: {},
  students: {},
  pendingRequests: {},
  markedGroup: "",
  subscriptionsReady: false,
  bound: false
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function ensureGroupsDialogStyles() {
  if (document.getElementById("groups-dialog-canonical-styles")) return;

  const style = document.createElement("style");
  style.id = "groups-dialog-canonical-styles";
  style.textContent = `
    #groupsDialog{
      border:0;
      border-radius:14px;
      padding:0;
      width:min(720px,calc(100vw - 28px));
      max-width:calc(100vw - 28px);
      box-shadow:0 22px 70px rgba(15,23,42,.35);
      background:#fff;
    }
    #groupsDialog::backdrop{background:rgba(15,23,42,.55)}
    #groupsDialog .modal-card{padding:18px;display:grid;gap:13px;background:#fff}
    #groupsDialog .modal-head{display:flex;justify-content:space-between;align-items:center;gap:10px}
    #groupsDialog .modal-head h3{margin:0}
    #groupsDialog .modal-close{background:#e2e8f0;color:#0f172a}
    #groupsDialog .management-head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
    #groupsDialog .management-head-actions,
    #groupsDialog .group-context-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    #groupsDialog .status-text{font-size:11px;color:#64748b;line-height:1.35}
    #groupsDialog .table-wrap{overflow-x:auto;margin-top:8px}
    #groupsDialog .data-table{width:100%;border-collapse:collapse;min-width:650px}
    #groupsDialog .data-table th,
    #groupsDialog .data-table td{padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}
    #groupsDialog .data-table th{font-size:11px;font-weight:900;color:#334155;background:#f8fafc}
    #groupsDialog .groups-table .group-select-button{
      display:flex;
      align-items:center;
      gap:7px;
      background:transparent;
      color:#1d4ed8;
      border:0;
      padding:0;
      font-weight:900;
      text-align:left;
      box-shadow:none;
      cursor:pointer;
    }
    #groupsDialog .groups-table .group-select-button:hover,
    #groupsDialog .groups-table .group-select-button:focus-visible{
      color:#1e40af;
      text-decoration:underline;
      outline:none;
    }
    #groupsDialog .groups-table tr.selected-group-row{background:#eff6ff}
    #groupsDialog .group-context-actions{
      margin-top:9px;
      padding:8px;
      border-radius:8px;
      background:#f8fafc;
      border:1px solid #dbe3ee;
    }
    #groupsDialog .group-evaluation-summary{font-size:11px;color:#475569;line-height:1.35}
    #groupsDialog .setup-required{font-weight:800;color:#b45309}
    #groupsDialog .delete-group-btn{background:#b91c1c;color:#fff}
    @media(max-width:760px){
      #groupsDialog{width:calc(100vw - 20px);max-width:calc(100vw - 20px)}
      #groupsDialog .modal-card{padding:14px}
    }
  `;
  document.head.appendChild(style);
}

const GROUPS_DIALOG_HTML = `
<dialog id="groupsDialog">
  <div class="modal-card">
    <div class="modal-head">
      <h3>Groups</h3>
      <button id="closeGroupsDialogBtn" class="modal-close" type="button">Close</button>
    </div>

    <div class="management-head">
      <div>
        <h3>Groups</h3>
        <div class="status-text">Click a group to mark it, then use Select to make it the active group.</div>
      </div>
      <div class="management-head-actions">
        <button id="openCreateGroupDialogBtn" type="button">+ Create Group</button>
      </div>
    </div>

    <div id="selectedGroupActions" class="group-context-actions" hidden>
      <strong id="selectedGroupActionLabel"></strong>
      <button id="selectPopupGroupBtn" type="button">Select</button>
      <button id="openGroupEvaluationDialogBtn" type="button">Blocks &amp; Criteria</button>
      <button id="deleteSelectedGroupBtn" class="delete-group-btn" type="button">Delete Group</button>
    </div>

    <div class="table-wrap" style="margin-top:8px;">
      <table class="data-table groups-table">
        <thead>
          <tr>
            <th>Group</th>
            <th>Students</th>
            <th>Pending</th>
            <th>Blocks</th>
            <th>Evaluation</th>
          </tr>
        </thead>
        <tbody id="groupsTableBody">
          <tr><td colspan="5">No groups yet.</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</dialog>
`;

export function ensureGroupsDialog() {
  ensureGroupsDialogStyles();

  let dialog = document.getElementById("groupsDialog");
  if (dialog) return dialog;

  const holder = document.createElement("div");
  holder.innerHTML = GROUPS_DIALOG_HTML.trim();
  dialog = holder.firstElementChild;
  document.body.appendChild(dialog);
  return dialog;
}

function studentCountForGroup(students, groupName) {
  return Object.values(students || {})
    .filter((student) => studentInGroup(student, groupName))
    .length;
}

function pendingCountForGroup(pendingRequests, groupName) {
  return Object.values(pendingRequests?.[groupName] || {})
    .filter((request) => String(request?.status || "pending") === "pending")
    .length;
}

export function renderGroupsDialog({
  groups = {},
  students = {},
  pendingRequests = {},
  markedGroup = ""
} = {}) {
  const dialog = ensureGroupsDialog();
  const tableBody = dialog.querySelector("#groupsTableBody");
  const selectedGroupActions = dialog.querySelector("#selectedGroupActions");
  const selectedGroupActionLabel = dialog.querySelector("#selectedGroupActionLabel");
  const names = Object.keys(groups || {})
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  if (!names.length) {
    tableBody.innerHTML = '<tr><td colspan="5">No groups yet.</td></tr>';
  } else {
    tableBody.innerHTML = names.map((groupName) => {
      const group = groups[groupName] || {};
      const config = groupEvaluationConfig(group);
      const selected = groupName === markedGroup;
      const evaluationSummary = config.configured
        ? config.criteria.map((criterion) =>
            `${escapeHtml(criterion.name)} ${criterion.weight}%`
          ).join(" · ")
        : '<span class="setup-required">Evaluation setup required</span>';

      return `
        <tr class="${selected ? "selected-group-row" : ""}" data-popup-group-row="${escapeHtml(groupName)}">
          <td>
            <button class="group-select-button" type="button" data-popup-group="${escapeHtml(groupName)}"
              aria-pressed="${String(selected)}">
              <span>${escapeHtml(groupName)}</span>
            </button>
          </td>
          <td>${studentCountForGroup(students, groupName)}</td>
          <td>${pendingCountForGroup(pendingRequests, groupName)}</td>
          <td>${config.configured ? config.unitCount : "—"}</td>
          <td class="group-evaluation-summary">${evaluationSummary}</td>
        </tr>
      `;
    }).join("");
  }

  const hasGroup = Boolean(markedGroup && groups?.[markedGroup]);
  selectedGroupActions.hidden = !hasGroup;
  selectedGroupActionLabel.textContent = hasGroup ? `Marked: ${markedGroup}` : "";
  return dialog;
}

function managementUrl(action, groupName = "") {
  const url = new URL("/group-mangement", window.location.origin);
  if (action) url.searchParams.set("action", action);
  if (groupName) url.searchParams.set("group", groupName);
  return url.toString();
}

function selectStandaloneGroup() {
  const groupName = String(standaloneState.markedGroup || "");
  if (!groupName || !standaloneState.groups[groupName]) return;

  sessionStorage.setItem(WORKING_GROUP_KEY, groupName);
  window.dispatchEvent(new CustomEvent("youteach:working-group-changed", {
    detail: { groupName }
  }));
  ensureGroupsDialog().close();
}

function renderStandaloneDialog() {
  renderGroupsDialog({
    groups: standaloneState.groups,
    students: standaloneState.students,
    pendingRequests: standaloneState.pendingRequests,
    markedGroup: standaloneState.markedGroup
  });
}

function bindStandaloneDialog() {
  if (standaloneState.bound) return;
  standaloneState.bound = true;

  const dialog = ensureGroupsDialog();
  const tableBody = dialog.querySelector("#groupsTableBody");

  dialog.querySelector("#closeGroupsDialogBtn").addEventListener("click", () => {
    standaloneState.markedGroup = "";
    dialog.close();
  });

  tableBody.addEventListener("click", (event) => {
    const groupButton = event.target.closest("[data-popup-group]");
    if (!groupButton) return;
    const groupName = String(groupButton.dataset.popupGroup || "");
    if (!standaloneState.groups[groupName]) return;
    standaloneState.markedGroup = groupName;
    renderStandaloneDialog();
  });

  tableBody.addEventListener("dblclick", (event) => {
    const groupButton = event.target.closest("[data-popup-group]");
    const groupRow = event.target.closest("[data-popup-group-row]");
    const groupName = String(
      groupButton?.dataset.popupGroup ||
      groupRow?.dataset.popupGroupRow ||
      ""
    );
    if (!groupName || !standaloneState.groups[groupName]) return;
    standaloneState.markedGroup = groupName;
    selectStandaloneGroup();
  });

  dialog.querySelector("#selectPopupGroupBtn").addEventListener("click", selectStandaloneGroup);

  dialog.querySelector("#openCreateGroupDialogBtn").addEventListener("click", () => {
    dialog.close();
    window.location.href = managementUrl("create");
  });

  dialog.querySelector("#openGroupEvaluationDialogBtn").addEventListener("click", () => {
    const groupName = String(standaloneState.markedGroup || "");
    if (!groupName) return;
    dialog.close();
    window.location.href = managementUrl("evaluation", groupName);
  });

  dialog.querySelector("#deleteSelectedGroupBtn").addEventListener("click", () => {
    const groupName = String(standaloneState.markedGroup || "");
    if (!groupName) return;
    dialog.close();
    window.location.href = managementUrl("delete", groupName);
  });
}

function ensureStandaloneSubscriptions() {
  if (standaloneState.subscriptionsReady) return;
  standaloneState.subscriptionsReady = true;

  onValue(ref(db, "groups"), (snapshot) => {
    standaloneState.groups = visibleGroups(snapshot.val() || {});
    if (
      standaloneState.markedGroup &&
      !standaloneState.groups[standaloneState.markedGroup]
    ) {
      standaloneState.markedGroup = "";
    }
    renderStandaloneDialog();
  });

  onValue(ref(db, "students"), (snapshot) => {
    standaloneState.students = snapshot.val() || {};
    renderStandaloneDialog();
  });

  onValue(ref(db, "groupEnrollmentRequests"), (snapshot) => {
    standaloneState.pendingRequests = snapshot.val() || {};
    renderStandaloneDialog();
  });
}

export async function openWorkingGroupDialog() {
  const dialog = ensureGroupsDialog();
  bindStandaloneDialog();
  ensureStandaloneSubscriptions();
  standaloneState.markedGroup = "";
  renderStandaloneDialog();
  if (!dialog.open) dialog.showModal();
}
