(function () {
  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
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
        const before = links.querySelector('a[href="teacher-points.html"]');
        links.insertBefore(link, before || links.querySelector("button"));
      }
    }

    ensureAssignmentsLink();

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
      menuToggle.style.top = "16px";
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

    syncIdentity();

    const identitySources = [
      document.getElementById("studentIdentity"),
      document.getElementById("teacherIdentity"),
      document.getElementById("studentName")
    ].filter(Boolean);

    identitySources.forEach((source) => {
      const observer = new MutationObserver(syncIdentity);
      observer.observe(source, { childList: true, subtree: true, characterData: true });
    });

    setTimeout(syncIdentity, 300);
    setTimeout(syncIdentity, 1000);
    setTimeout(syncIdentity, 2000);
  });
})();