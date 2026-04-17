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
      document.addEventListener("click", (e) => {
        const clickedInsideSidebar = sidebar.contains(e.target);
        const clickedMenuButton = menuToggle.contains(e.target);

        if (!clickedInsideSidebar && !clickedMenuButton) {
          sidebar.classList.remove("sidebar-open");
          document.body.classList.remove("sidebar-lock");
        }
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          sidebar.classList.remove("sidebar-open");
          document.body.classList.remove("sidebar-lock");
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
  });
})();