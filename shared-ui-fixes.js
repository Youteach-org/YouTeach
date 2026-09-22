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