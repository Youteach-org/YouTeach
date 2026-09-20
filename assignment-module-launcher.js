const CONTEXT_KEY = "youteachAssignmentsModuleContext";

function ensureShell() {
  let overlay = document.getElementById("assignmentsModuleOverlay");
  if (overlay) return overlay;

  const style = document.createElement("style");
  style.id = "assignmentsModuleLauncherStyles";
  style.textContent = `
    .assignments-module-overlay{
      position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.56);
      display:grid;place-items:center;padding:18px
    }
    .assignments-module-overlay[hidden]{display:none!important}
    .assignments-module-shell{
      width:min(1180px,96vw);height:min(900px,94vh);background:#fff;
      border-radius:18px;box-shadow:0 24px 70px rgba(15,23,42,.28);
      overflow:hidden;display:grid;grid-template-rows:auto 1fr
    }
    .assignments-module-head{
      display:flex;align-items:center;justify-content:space-between;gap:12px;
      padding:10px 14px;border-bottom:1px solid #e2e8f0;background:#f8fafc
    }
    .assignments-module-head strong{font-size:17px;color:#0f172a}
    .assignments-module-close{
      border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:9px;
      min-width:38px;min-height:36px;font-size:20px;line-height:1;cursor:pointer
    }
    .assignments-module-frame{width:100%;height:100%;border:0;background:#f8fafc}
    @media(max-width:700px){
      .assignments-module-overlay{padding:0}
      .assignments-module-shell{width:100vw;height:100vh;border-radius:0}
    }
  `;
  document.head.appendChild(style);

  overlay = document.createElement("div");
  overlay.id = "assignmentsModuleOverlay";
  overlay.className = "assignments-module-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="assignments-module-shell" role="dialog" aria-modal="true" aria-label="Create Assignment">
      <div class="assignments-module-head">
        <strong>Create Assignment</strong>
        <button id="assignmentsModuleCloseBtn" class="assignments-module-close" type="button" aria-label="Close Create Assignment">×</button>
      </div>
      <iframe id="assignmentsModuleFrame" class="assignments-module-frame" title="Create Assignment"></iframe>
    </section>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector("#assignmentsModuleCloseBtn").addEventListener("click", closeAssignmentsModule);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeAssignmentsModule();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) closeAssignmentsModule();
  });

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== "youteach:assignment-created") return;
    window.dispatchEvent(new CustomEvent("youteach:assignment-created", { detail: event.data }));
    closeAssignmentsModule();
  });

  return overlay;
}

export function openAssignmentsModule(context = {}) {
  sessionStorage.setItem(CONTEXT_KEY, JSON.stringify({
    ...context,
    openedAt: Date.now()
  }));

  const overlay = ensureShell();
  const frame = overlay.querySelector("#assignmentsModuleFrame");
  frame.src = `assignment-create-module.html?opened=${Date.now()}`;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
}

export function closeAssignmentsModule() {
  const overlay = document.getElementById("assignmentsModuleOverlay");
  if (!overlay) return;
  overlay.hidden = true;
  const frame = overlay.querySelector("#assignmentsModuleFrame");
  if (frame) frame.src = "about:blank";
  document.body.style.overflow = "";
}

export function readAssignmentsModuleContext() {
  try {
    return JSON.parse(sessionStorage.getItem(CONTEXT_KEY) || "null");
  } catch (_) {
    return null;
  }
}
