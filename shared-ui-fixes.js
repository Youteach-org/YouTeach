(function () {
  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  ready(() => {
    const sidebar =
      document.getElementById("sidebar") ||
      document.querySelector(".sidebar") ||
      document.querySelector(".collapsible-sidebar");

    const menuToggle = document.getElementById("menuToggle");

    if (!sidebar || !menuToggle) return;

    function lockBody() {
      if (sidebar.classList.contains("sidebar-open")) {
        document.body.classList.add("sidebar-lock");
      } else {
        document.body.classList.remove("sidebar-lock");
      }
    }

    function openSidebar() {
      sidebar.classList.add("sidebar-open");
      sidebar.style.transform = "translateX(0)";
      sidebar.style.left = "0";
      sidebar.style.visibility = "visible";
      sidebar.style.pointerEvents = "auto";
      lockBody();
    }

    function closeSidebar() {
      sidebar.classList.remove("sidebar-open");
      sidebar.style.transform = "";
      sidebar.style.visibility = "";
      sidebar.style.pointerEvents = "";
      lockBody();
    }

    function toggleSidebar() {
      if (sidebar.classList.contains("sidebar-open")) {
        closeSidebar();
      } else {
        openSidebar();
      }
    }

    # remove old inline onclick if any
    menuToggle.onclick = null;

    # clone button to wipe previous listeners that might be breaking it
    const freshToggle = menuToggle.cloneNode(true);
    menuToggle.parentNode.replaceChild(freshToggle, menuToggle);

    freshToggle.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleSidebar();
    }, true);

    sidebar.addEventListener("click", function (e) {
      e.stopPropagation();
    }, true);

    document.addEventListener("click", function (e) {
      const clickedInsideSidebar = sidebar.contains(e.target);
      const clickedMenuButton = freshToggle.contains(e.target);

      if (!clickedInsideSidebar && !clickedMenuButton) {
        closeSidebar();
      }
    }, true);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        closeSidebar();
      }
    }, true);

    window.addEventListener("resize", function () {
      if (window.innerWidth > 768) {
        closeSidebar();
      }
    });

    # password toggle visible
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
      btn.innerHTML = '<span style="font-size:14px;line-height:1;">👁</span> <span style="font-size:12px;">Show</span>';
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
      btn.style.display = "inline-flex";
      btn.style.alignItems = "center";
      btn.style.gap = "6px";
      btn.style.boxShadow = "0 1px 4px rgba(15,23,42,0.08)";

      btn.addEventListener("click", () => {
        const showing = input.type === "text";
        input.type = showing ? "password" : "text";
        btn.innerHTML = showing
          ? '<span style="font-size:14px;line-height:1;">👁</span> <span style="font-size:12px;">Show</span>'
          : '<span style="font-size:14px;line-height:1;">🙈</span> <span style="font-size:12px;">Hide</span>';
      });

      wrapper.appendChild(btn);
    });

    const loginBtn =
      document.getElementById("loginBtn") ||
      document.querySelector('[data-login-primary="1"]') ||
      document.querySelector('button[type="submit"]') ||
      document.querySelector('form button');

    if (loginBtn) {
      const loginScope = document.querySelector("form") || document;
      loginScope.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        const tag = (e.target.tagName || "").toLowerCase();
        if (tag === "textarea") return;
        e.preventDefault();
        loginBtn.click();
      });
    }
  });
})();