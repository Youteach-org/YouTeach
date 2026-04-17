(function () {
  const page = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  const isTeacherPage = page.startsWith("teacher") || page === "buzzer.html";
  const isStudentPage = page.startsWith("student");
  const isLoginPage = page === "student.html" || page === "teacher-login.html";

  function lockBodyWhenSidebarOpen(sidebar) {
    if (!sidebar) return;
    if (sidebar.classList.contains("sidebar-open")) {
      document.body.classList.add("sidebar-lock");
    } else {
      document.body.classList.remove("sidebar-lock");
    }
  }

  function initSidebarOutsideClose() {
    const sidebar = document.getElementById("sidebar");
    const menuToggle = document.getElementById("menuToggle");
    if (!sidebar || !menuToggle) return;

    const closeSidebar = () => {
      sidebar.classList.remove("sidebar-open");
      lockBodyWhenSidebarOpen(sidebar);
    };

    const toggleSidebar = (e) => {
      e.stopPropagation();
      sidebar.classList.toggle("sidebar-open");
      lockBodyWhenSidebarOpen(sidebar);
    };

    menuToggle.addEventListener("click", toggleSidebar);

    sidebar.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    document.addEventListener("click", (e) => {
      const clickedInsideSidebar = sidebar.contains(e.target);
      const clickedMenuButton = menuToggle.contains(e.target);
      if (!clickedInsideSidebar && !clickedMenuButton) {
        closeSidebar();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeSidebar();
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 768) {
        sidebar.classList.remove("sidebar-open");
        lockBodyWhenSidebarOpen(sidebar);
      }
    });
  }

  function initPasswordToggles() {
    const passwordInputs = Array.from(document.querySelectorAll('input[type="password"]'));
    passwordInputs.forEach((input, index) => {
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
      btn.style.border = "1px solid #cbd5e1";
      btn.style.background = "#fff";
      btn.style.borderRadius = "10px";
      btn.style.padding = "6px 10px";
      btn.style.fontSize = "12px";
      btn.style.cursor = "pointer";
      btn.style.zIndex = "2";

      btn.addEventListener("click", () => {
        const showing = input.type === "text";
        input.type = showing ? "password" : "text";
        btn.textContent = showing ? "Show" : "Hide";
      });

      wrapper.appendChild(btn);
    });
  }

  function getPrimaryLoginButton() {
    return (
      document.getElementById("loginBtn") ||
      document.querySelector('[data-login-primary="1"]') ||
      document.querySelector('button[type="submit"]') ||
      document.querySelector('form button') ||
      document.querySelector('button')
    );
  }

  function initEnterToLogin() {
    const loginBtn = getPrimaryLoginButton();
    if (!loginBtn) return;

    const loginScope = document.querySelector("form") || document;
    loginScope.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "textarea") return;
      e.preventDefault();
      loginBtn.click();
    });
  }

  function initLogoutRedirectOverride() {
    const logoutBtn = document.getElementById("logoutBtn");
    if (!logoutBtn) return;

    logoutBtn.addEventListener("click", () => {
      window.setTimeout(() => {
        if (isTeacherPage) {
          window.location.href = "teacher-login.html";
        } else if (isStudentPage) {
          window.location.href = "student.html";
        }
      }, 80);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initSidebarOutsideClose();
    initPasswordToggles();
    if (isLoginPage) {
      initEnterToLogin();
    }
    initLogoutRedirectOverride();
  });
})();