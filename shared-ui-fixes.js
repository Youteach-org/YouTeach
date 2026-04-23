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

  function getMenuType(sidebar) {
    const label = sidebar?.querySelector(".brand p");
    return (label?.textContent || "Menu").trim();
  }

  function ensureFloatingHeader() {
    let header = document.getElementById("menuHeaderFloating");

    if (!header) {
      header = document.createElement("div");
      header.id = "menuHeaderFloating";
      header.className = "menu-header-floating";
      header.innerHTML =
        '<div class="menu-header-line1">☰ YouTeach</div>' +
        '<div class="menu-header-line2"></div>' +
        '<div class="menu-header-line3"></div>';
      document.body.appendChild(header);
    }

    return header;
  }

  ready(() => {
    const sidebar = document.getElementById("sidebar");
    const menuToggle = document.getElementById("menuToggle");
    const sidebarIdentity = document.getElementById("sidebarIdentity");

    if (!sidebar || !menuToggle) {
      return;
    }

    const floatingHeader = ensureFloatingHeader();

    function syncHeaderText() {
      const menuType = getMenuType(sidebar);
      const identityText = getBestIdentityText();

      const line2 = floatingHeader.querySelector(".menu-header-line2");
      const line3 = floatingHeader.querySelector(".menu-header-line3");

      if (line2) line2.textContent = menuType;
      if (line3) line3.textContent = identityText;

      if (sidebarIdentity && identityText) {
        sidebarIdentity.textContent = identityText;
      }
    }

    function openMenu() {
      sidebar.classList.add("sidebar-open");
      document.body.classList.add("sidebar-lock");
      syncHeaderText();
      floatingHeader.classList.add("show");
    }

    function closeMenu() {
      sidebar.classList.remove("sidebar-open");
      document.body.classList.remove("sidebar-lock");
      floatingHeader.classList.remove("show");
    }

    function toggleMenu() {
      if (sidebar.classList.contains("sidebar-open")) {
        closeMenu();
      } else {
        openMenu();
      }
    }

    menuToggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu();
    });

    sidebar.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    document.addEventListener("click", (e) => {
      const clickedInsideSidebar = sidebar.contains(e.target);
      const clickedMenuButton = menuToggle.contains(e.target);

      if (!clickedInsideSidebar && !clickedMenuButton) {
        closeMenu();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeMenu();
      }
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

    syncHeaderText();

    const identitySources = [
      document.getElementById("studentIdentity"),
      document.getElementById("teacherIdentity"),
      document.getElementById("studentName")
    ].filter(Boolean);

    identitySources.forEach((source) => {
      const observer = new MutationObserver(() => {
        syncHeaderText();
      });
      observer.observe(source, { childList: true, subtree: true, characterData: true });
    });

    setTimeout(syncHeaderText, 300);
    setTimeout(syncHeaderText, 1000);
    setTimeout(syncHeaderText, 2000);
  });
})();