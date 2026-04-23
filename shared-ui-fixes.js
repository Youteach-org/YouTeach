(function () {
  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  ready(() => {
    const sidebar = document.getElementById("sidebar");
    const menuToggle = document.getElementById("menuToggle");

    if (sidebar && menuToggle) {
      menuToggle.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        sidebar.classList.toggle("sidebar-open");
      });

      sidebar.addEventListener("click", (e) => {
        e.stopPropagation();
      });

      document.addEventListener("click", (e) => {
        const clickedInsideSidebar = sidebar.contains(e.target);
        const clickedMenuButton = menuToggle.contains(e.target);

        if (!clickedInsideSidebar && !clickedMenuButton) {
          sidebar.classList.remove("sidebar-open");
        }
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          sidebar.classList.remove("sidebar-open");
        }
      });
    }

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
      btn.setAttribute("aria-label", "Show password");
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

    const sidebarIdentity = document.getElementById("sidebarIdentity");
    if (sidebarIdentity) {
      const sources = [
        document.getElementById("studentIdentity"),
        document.getElementById("teacherIdentity"),
        document.getElementById("studentName")
      ].filter(Boolean);

      const syncSidebarIdentity = () => {
        for (const source of sources) {
          const text = (source.textContent || "").trim();
          if (text && text.toLowerCase() !== "student" && text.toLowerCase() !== "teacher") {
            sidebarIdentity.textContent = text;
            return;
          }
        }
      };

      syncSidebarIdentity();

      sources.forEach((source) => {
        const observer = new MutationObserver(syncSidebarIdentity);
        observer.observe(source, { childList: true, subtree: true, characterData: true });
      });

      setTimeout(syncSidebarIdentity, 300);
      setTimeout(syncSidebarIdentity, 1000);
      setTimeout(syncSidebarIdentity, 2000);
    }
  });
})();

// ===== MENU IDENTITY AUTO =====
(function(){
  const sidebarIdentity = document.getElementById("sidebarIdentity");
  if (!sidebarIdentity) return;

  const sources = [
    document.getElementById("studentIdentity"),
    document.getElementById("teacherIdentity"),
    document.getElementById("studentName")
  ].filter(Boolean);

  function updateName(){
    for (const s of sources){
      const t = (s.textContent || "").trim();
      if (t && t !== "Student" && t !== "Teacher"){
        sidebarIdentity.textContent = t;
        return;
      }
    }
  }

  updateName();
  setTimeout(updateName,500);
  setTimeout(updateName,1500);
})();