(function () {
  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function ensureGlobalResponsiveLayout() {
    if (document.getElementById("youteach-global-responsive-layout")) return;

    const style = document.createElement("style");
    style.id = "youteach-global-responsive-layout";
    style.textContent = `
      .active-group-identity {
        display:inline-flex !important;
        align-items:center !important;
        gap:5px !important;
        padding:4px 8px !important;
        margin-left:8px !important;
        border:1px solid #cbd5e1 !important;
        border-radius:999px !important;
        background:#fff !important;
        color:#334155 !important;
        font-size:12px !important;
        font-weight:800 !important;
        cursor:pointer !important;
        touch-action:manipulation !important;
      }
      .active-group-identity:hover,
      .active-group-identity:focus-visible {
        border-color:#2563eb !important;
        color:#1d4ed8 !important;
        outline:none !important;
      }

      /* Hamburger space belongs only to the title bar.
         Everything below the title uses the full page width. */
      .hamburger-btn {
        top:8px !important;
        left:8px !important;
        width:44px !important;
        height:44px !important;
      }

      .hamburger-btn + .menu-shell {
        display:block !important;
        grid-template-columns:1fr !important;
        width:100% !important;
        min-width:0 !important;
      }

      .hamburger-btn + .menu-shell .main-content {
        width:100% !important;
        max-width:none !important;
        min-width:0 !important;
        margin:0 !important;
        padding-top:8px !important;
        padding-left:16px !important;
        padding-right:16px !important;
      }

      .hamburger-btn + .menu-shell .main-content > .topbar,
      .hamburger-btn + .menu-shell .main-content .topbar {
        width:100% !important;
        max-width:100% !important;
        min-width:0 !important;
        margin-left:0 !important;
        margin-right:0 !important;
        padding-left:58px !important;
        min-height:52px !important;
      }

      .hamburger-btn + .menu-shell .main-content > .topbar + *,
      .hamburger-btn + .menu-shell .main-content .topbar + * {
        margin-left:0 !important;
      }

      @media (min-width:769px) and (max-width:1100px),
             (orientation:portrait) and (min-width:769px) and (max-width:1200px) {
        html,
        body {
          width:100% !important;
          max-width:100% !important;
        }

        body {
          overflow-x:hidden !important;
        }

        .main-content > * {
          min-width:0 !important;
          max-width:100% !important;
        }

        .summary-grid {
          grid-template-columns:repeat(2,minmax(0,1fr)) !important;
        }

        .landing-grid,
        .two-home-cards,
        .student-info-grid,
        .two-columns {
          grid-template-columns:repeat(2,minmax(0,1fr)) !important;
        }

        .panel-card,
        .summary-card,
        .info-card,
        .landing-card,
        .auth-card {
          min-width:0 !important;
          max-width:100% !important;
        }

        .table-wrap {
          width:100% !important;
          max-width:100% !important;
          overflow-x:auto !important;
        }

        img,
        video,
        canvas,
        iframe {
          max-width:100%;
        }

        .summary-card strong,
        .landing-link-card h2,
        .panel-card h2,
        .panel-card h3 {
          word-break:normal !important;
          overflow-wrap:break-word !important;
        }
      }

      @media (max-width:768px) {
        html,
        body,
        .menu-shell,
        .main-content {
          width:100% !important;
          max-width:100% !important;
          min-width:0 !important;
        }

        .hamburger-btn + .menu-shell .main-content {
          padding-top:8px !important;
          padding-left:12px !important;
          padding-right:12px !important;
        }

        .hamburger-btn + .menu-shell .main-content > .topbar,
        .hamburger-btn + .menu-shell .main-content .topbar {
          padding-left:54px !important;
          min-height:50px !important;
        }

        .main-content > * {
          min-width:0 !important;
          max-width:100% !important;
        }

        .panel-card,
        .summary-card,
        .info-card,
        .landing-card,
        .auth-card {
          min-width:0 !important;
          max-width:100% !important;
        }

        .active-group-identity {
          display:inline !important;
          padding:0 !important;
          margin-left:8px !important;
          background:transparent !important;
          border:0 !important;
          border-radius:0 !important;
          box-shadow:none !important;
          color:#475569 !important;
          font-size:12px !important;
          font-weight:800 !important;
          white-space:nowrap !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function getBestIdentityText() {
    const sources = [
      document.getElementById("studentIdentity"),
      document.getElementById("teacherIdentity"),
      document.getElementById("studentName")
    ].filter(Boolean);

    for (const source of sources) {
      const text = (source.textContent || "").trim();
      if (text && text.toLowerCase() !== "student" && text.toLowerCase() !== "teacher") {
        return text;
      }
    }
    return "";
  }

  ready(() => {
    ensureGlobalResponsiveLayout();

    const sidebar = document.getElementById("sidebar");
    const menuToggle = document.getElementById("menuToggle");
    const sidebarIdentity = document.getElementById("sidebarIdentity");

    if (!sidebar || !menuToggle) return;

    function ensureAssignmentsLink() {
      const links = sidebar.querySelector(".sidebar-links");
      const brandLabel = (sidebar.querySelector(".brand p")?.textContent || "").toLowerCase();
      if (!links || links.querySelector('a[href="student-assignments.html"], a[href="teacher-assignments.html"]')) return;

      const link = document.createElement("a");
      link.className = "sidebar-link";

      if (brandLabel.includes("student")) {
        link.href = "student-assignments.html";
        link.textContent = "My Assignments";
        const before = links.querySelector('a[href="student-summary.html"]');
        links.insertBefore(link, before || links.querySelector("button"));
      } else if (brandLabel.includes("teacher")) {
        link.href = "teacher-assignments.html";
        link.textContent = "Assignments";
        const before = links.querySelector('a[href="/points"], a[href="teacher-points.html"]');
        links.insertBefore(link, before || links.querySelector("button"));
      }
    }

    function ensureExamBankNavigation() {
      const links = sidebar.querySelector(".sidebar-links");
      const brandLabel = (sidebar.querySelector(".brand p")?.textContent || "").toLowerCase();
      if (!links || !brandLabel.includes("teacher")) return;

      [
        'a[href="exam-question-bank.html"]',
        'a[href="exam-creator.html"]',
        'a[href="answer-sheet-creator.html"]'
      ].forEach((selector) => {
        links.querySelectorAll(selector).forEach((link) => link.remove());
      });

      if (!links.querySelector('a[href="exam-bank.html"]')) {
        const link = document.createElement("a");
        link.className = "sidebar-link";
        link.href = "exam-bank.html";
        link.textContent = "Exam Bank";
        const before = links.querySelector('a[href="/points"], a[href="teacher-points.html"]');
        links.insertBefore(link, before || links.querySelector("button"));
      }

      const homeTools = document.querySelector(".teacher-home-tools");
      if (homeTools) {
        [
          'a[href="exam-question-bank.html"]',
          'a[href="exam-creator.html"]',
          'a[href="answer-sheet-creator.html"]'
        ].forEach((selector) => {
          homeTools.querySelectorAll(selector).forEach((card) => card.remove());
        });

        if (!homeTools.querySelector('a[href="exam-bank.html"]')) {
          const card = document.createElement("a");
          card.className = "landing-link-card";
          card.href = "exam-bank.html";
          card.innerHTML = "<h2>Exam Bank</h2><p>Upload, classify, search and retrieve original exam files.</p>";
          const before = homeTools.querySelector('a[href="/points"], a[href="teacher-points.html"]');
          homeTools.insertBefore(card, before || null);
        }
      }
    }

    ensureAssignmentsLink();
    ensureExamBankNavigation();

    function syncIdentity() {
      const identityText = getBestIdentityText();
      if (sidebarIdentity && identityText) {
        sidebarIdentity.textContent = identityText;
      }
    }

    function openMenu() {
      sidebar.classList.add("sidebar-open");
      document.body.classList.add("sidebar-lock");
      syncIdentity();

      const width = sidebar.getBoundingClientRect().width || 320;
      menuToggle.style.left = Math.max(14, width - 66) + "px";
      menuToggle.style.top = "8px";
      menuToggle.style.zIndex = "2400";
    }

    function closeMenu() {
      sidebar.classList.remove("sidebar-open");
      document.body.classList.remove("sidebar-lock");

      menuToggle.style.left = "";
      menuToggle.style.top = "";
      menuToggle.style.zIndex = "";
    }

    menuToggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (sidebar.classList.contains("sidebar-open")) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    sidebar.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    document.addEventListener("click", (e) => {
      if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
        closeMenu();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });

    const passwordInputs = Array.from(document.querySelectorAll('input[type="password"]'));
    passwordInputs.forEach((input) => {
      if (input.dataset.toggleReady === "1") return;
      input.dataset.toggleReady = "1";

      const wrapper = document.createElement("div");
      wrapper.style.position = "relative";
      wrapper.style.display = "block";
      wrapper.style.width = "100%";

      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Show";
      btn.style.position = "absolute";
      btn.style.right = "10px";
      btn.style.top = "50%";
      btn.style.transform = "translateY(-50%)";
      btn.style.border = "1px solid #94a3b8";
      btn.style.background = "#ffffff";
      btn.style.color = "#0f172a";
      btn.style.borderRadius = "10px";
      btn.style.padding = "6px 10px";
      btn.style.fontSize = "12px";
      btn.style.fontWeight = "700";
      btn.style.cursor = "pointer";
      btn.style.zIndex = "5";

      btn.addEventListener("click", () => {
        const showing = input.type === "text";
        input.type = showing ? "password" : "text";
        btn.textContent = showing ? "Show" : "Hide";
      });

      wrapper.appendChild(btn);
    });

    const sharedGroupsState = {
      groups: {},
      students: {},
      pending: {},
      markedGroup: "",
      subscriptionsReady: false,
      studentInGroup: null
    };

    function groupPopupEscape(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char]));
    }

    function ensureGroupsDialog() {
      let dialog = document.getElementById("groupsDialog");
      if (dialog) return dialog;

      if (!document.getElementById("sharedGroupsDialogStyles")) {
        const style = document.createElement("style");
        style.id = "sharedGroupsDialogStyles";
        style.textContent = `
          #groupsDialog{border:0;padding:0;background:transparent;max-width:none}
          #groupsDialog::backdrop{background:rgba(15,23,42,.5)}
          #groupsDialog .modal-card{width:min(900px,94vw);max-height:84vh;overflow:auto;background:#fff;border-radius:16px;padding:16px;box-shadow:0 24px 70px rgba(15,23,42,.28)}
          #groupsDialog .modal-head,#groupsDialog .management-head,#groupsDialog .group-context-actions{display:flex;align-items:center;justify-content:space-between;gap:10px}
          #groupsDialog .management-head{margin-top:8px}
          #groupsDialog .status-text{font-size:12px;color:#64748b}
          #groupsDialog .group-context-actions{justify-content:flex-start;margin:10px 0;padding:8px;border:1px solid #dbeafe;border-radius:10px;background:#eff6ff}
          #groupsDialog .table-wrap{overflow:auto;margin-top:8px}
          #groupsDialog .data-table{width:100%;border-collapse:collapse;min-width:650px}
          #groupsDialog th,#groupsDialog td{padding:8px;border-bottom:1px solid #e2e8f0;text-align:left;font-size:12px}
          #groupsDialog th{background:#f8fafc}
          #groupsDialog .group-select-button{width:100%;text-align:left;border:0;background:transparent;padding:5px 4px;font-weight:800;cursor:pointer}
          #groupsDialog tr.selected-group-row{background:#eff6ff}
          #groupsDialog button{cursor:pointer}
        `;
        document.head.appendChild(style);
      }

      dialog = document.createElement("dialog");
      dialog.id = "groupsDialog";
      dialog.dataset.sharedWorkingGroupSelector = "1";
      dialog.innerHTML = `
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
          </div>
          <div id="selectedGroupActions" class="group-context-actions" hidden>
            <strong id="selectedGroupActionLabel"></strong>
            <button id="selectPopupGroupBtn" type="button">Select</button>
          </div>
          <div class="table-wrap">
            <table class="data-table groups-table">
              <thead><tr><th>Group</th><th>Students</th><th>Pending</th><th>Blocks</th><th>Evaluation</th></tr></thead>
              <tbody id="groupsTableBody"><tr><td colspan="5">Loading groups...</td></tr></tbody>
            </table>
          </div>
        </div>
      `;
      document.body.appendChild(dialog);

      dialog.querySelector("#closeGroupsDialogBtn").addEventListener("click", () => dialog.close());
      dialog.querySelector("#groupsTableBody").addEventListener("click", (event) => {
        const button = event.target.closest("[data-popup-group]");
        if (!button) return;
        sharedGroupsState.markedGroup = String(button.dataset.popupGroup || "");
        renderSharedGroupsDialog();
      });
      dialog.querySelector("#groupsTableBody").addEventListener("dblclick", (event) => {
        const row = event.target.closest("[data-popup-group-row]");
        const groupName = String(row?.dataset.popupGroupRow || "");
        if (!groupName) return;
        sharedGroupsState.markedGroup = groupName;
        selectSharedWorkingGroup();
      });
      dialog.querySelector("#selectPopupGroupBtn").addEventListener("click", selectSharedWorkingGroup);
      return dialog;
    }

    function sharedGroupStudentCount(groupName) {
      if (typeof sharedGroupsState.studentInGroup !== "function") return 0;
      return Object.values(sharedGroupsState.students || {})
        .filter((student) => sharedGroupsState.studentInGroup(student, groupName))
        .length;
    }

    function sharedGroupPendingCount(groupName) {
      return Object.values(sharedGroupsState.pending?.[groupName] || {})
        .filter((request) => request?.status === "pending")
        .length;
    }

    function sharedGroupEvaluationSummary(group) {
      const criteria = Object.values(group?.evaluationCriteria || {}).filter(Boolean);
      if (!criteria.length) return "Evaluation setup required";
      return criteria.map((criterion) =>
        `${String(criterion?.name || "Category")} ${Number(criterion?.weight || 0)}%`
      ).join(" · ");
    }

    function renderSharedGroupsDialog() {
      const dialog = document.getElementById("groupsDialog");
      if (!dialog?.dataset.sharedWorkingGroupSelector) return;
      const body = dialog.querySelector("#groupsTableBody");
      const actions = dialog.querySelector("#selectedGroupActions");
      const label = dialog.querySelector("#selectedGroupActionLabel");
      const selectButton = dialog.querySelector("#selectPopupGroupBtn");
      const names = Object.keys(sharedGroupsState.groups || {})
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

      body.innerHTML = names.length ? names.map((groupName) => {
        const group = sharedGroupsState.groups[groupName] || {};
        const selected = groupName === sharedGroupsState.markedGroup;
        return `
          <tr class="${selected ? "selected-group-row" : ""}" data-popup-group-row="${groupPopupEscape(groupName)}">
            <td><button class="group-select-button" type="button" data-popup-group="${groupPopupEscape(groupName)}" aria-pressed="${String(selected)}"><span>${groupPopupEscape(groupName)}</span></button></td>
            <td>${sharedGroupStudentCount(groupName)}</td>
            <td>${sharedGroupPendingCount(groupName)}</td>
            <td>${Number(group?.evaluationUnitCount || 0) || "—"}</td>
            <td>${groupPopupEscape(sharedGroupEvaluationSummary(group))}</td>
          </tr>
        `;
      }).join("") : '<tr><td colspan="5">No groups yet.</td></tr>';

      const validSelection = Boolean(
        sharedGroupsState.markedGroup &&
        sharedGroupsState.groups?.[sharedGroupsState.markedGroup]
      );
      actions.hidden = !validSelection;
      label.textContent = validSelection ? sharedGroupsState.markedGroup : "";
      selectButton.disabled = !validSelection;
    }

    function selectSharedWorkingGroup() {
      const groupName = String(sharedGroupsState.markedGroup || "");
      if (!groupName || !sharedGroupsState.groups?.[groupName]) return;
      sessionStorage.setItem("youteachWorkingGroup", groupName);
      window.dispatchEvent(new CustomEvent("youteach:working-group-changed", {
        detail: { groupName }
      }));
      document.getElementById("groupsDialog")?.close();
    }

    async function ensureSharedGroupsData() {
      if (sharedGroupsState.subscriptionsReady) return;
      sharedGroupsState.subscriptionsReady = true;
      try {
        const [
          firebaseModule,
          groupStateModule,
          studentGroupsModule,
          databaseModule
        ] = await Promise.all([
          import("./firebase.js"),
          import("./group-state.js"),
          import("./student-groups.js"),
          import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js")
        ]);
        sharedGroupsState.studentInGroup = studentGroupsModule.studentInGroup;
        databaseModule.onValue(databaseModule.ref(firebaseModule.db, "groups"), (snapshot) => {
          sharedGroupsState.groups = groupStateModule.visibleGroups(snapshot.val() || {});
          const active = String(sessionStorage.getItem("youteachWorkingGroup") || "");
          if (!sharedGroupsState.groups?.[sharedGroupsState.markedGroup]) {
            sharedGroupsState.markedGroup = sharedGroupsState.groups?.[active]
              ? active
              : (Object.keys(sharedGroupsState.groups || {})[0] || "");
          }
          renderSharedGroupsDialog();
        });
        databaseModule.onValue(databaseModule.ref(firebaseModule.db, "students"), (snapshot) => {
          sharedGroupsState.students = snapshot.val() || {};
          renderSharedGroupsDialog();
        });
        databaseModule.onValue(databaseModule.ref(firebaseModule.db, "groupEnrollmentRequests"), (snapshot) => {
          sharedGroupsState.pending = snapshot.val() || {};
          renderSharedGroupsDialog();
        });
      } catch (error) {
        sharedGroupsState.subscriptionsReady = false;
        console.error("Could not load existing Groups popup data", error);
      }
    }

    async function openGroupsDialog() {
      const existingDialog = document.getElementById("groupsDialog");
      const existingOpenButton = document.getElementById("openGroupsDialogBtn");
      if (existingDialog && !existingDialog.dataset.sharedWorkingGroupSelector) {
        if (existingOpenButton) {
          existingOpenButton.click();
        } else if (!existingDialog.open) {
          existingDialog.showModal();
        }
        return;
      }

      const dialog = ensureGroupsDialog();
      const active = String(sessionStorage.getItem("youteachWorkingGroup") || "");
      if (active) sharedGroupsState.markedGroup = active;
      await ensureSharedGroupsData();
      renderSharedGroupsDialog();
      if (!dialog.open) dialog.showModal();
    }

    function syncActiveGroupIdentity() {
      const teacherIdentity = document.getElementById("teacherIdentity");
      if (!teacherIdentity) return;

      let groupIdentity = document.getElementById("activeGroupIdentity");
      if (!groupIdentity) {
        groupIdentity = document.createElement("button");
        groupIdentity.type = "button";
        groupIdentity.id = "activeGroupIdentity";
        groupIdentity.className = "active-group-identity";
        groupIdentity.title = "Change working group";
        groupIdentity.setAttribute("aria-haspopup", "dialog");
        groupIdentity.addEventListener("click", openGroupsDialog);
        teacherIdentity.insertAdjacentElement("afterend", groupIdentity);
      }

      const groupName = String(sessionStorage.getItem("youteachWorkingGroup") || "").trim();
      groupIdentity.textContent = groupName || "Select group";
      groupIdentity.hidden = false;
    }

    syncIdentity();
    syncActiveGroupIdentity();

    window.addEventListener("youteach:working-group-changed", syncActiveGroupIdentity);
    window.addEventListener("storage", (event) => {
      if (event.key === "youteachWorkingGroup") syncActiveGroupIdentity();
    });

    const identitySources = [
      document.getElementById("studentIdentity"),
      document.getElementById("teacherIdentity"),
      document.getElementById("studentName")
    ].filter(Boolean);

    identitySources.forEach((source) => {
      const observer = new MutationObserver(syncIdentity);
      observer.observe(source, { childList: true, subtree: true, characterData: true });
    });

    setTimeout(() => { syncIdentity(); syncActiveGroupIdentity(); }, 300);
    setTimeout(() => { syncIdentity(); syncActiveGroupIdentity(); }, 1000);
    setTimeout(() => { syncIdentity(); syncActiveGroupIdentity(); }, 2000);
  });
})();