const page = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();

function getPrimaryLoginButton() {
  return (
    document.getElementById("loginBtn") ||
    document.querySelector('[data-login-primary="1"]') ||
    document.querySelector('button[type="submit"]') ||
    document.querySelector('form button') ||
    document.querySelector('button')
  );
}

function wireTeacherLoginRedirect() {
  const btn = getPrimaryLoginButton();

  const redirectIfTeacherSessionExists = () => {
    const raw = localStorage.getItem("youteachTeacherAuth") || sessionStorage.getItem("youteachTeacherAuth");
    if (!raw) return false;

    localStorage.setItem("youteachTeacherAuth", raw);
    sessionStorage.removeItem("youteachTeacherAuth");
    window.location.href = "buzzer.html";
    return true;
  };

  if (redirectIfTeacherSessionExists()) return;

  const runCheck = () => {
    let attempts = 0;
    const maxAttempts = 12;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (redirectIfTeacherSessionExists() || attempts >= maxAttempts) {
        clearInterval(timer);
      }
    }, 200);
  };

  if (btn) btn.addEventListener("click", runCheck);
  const form = document.querySelector("form");
  if (form) form.addEventListener("submit", runCheck);
}

document.addEventListener("DOMContentLoaded", () => {
  if (page === "teacher-login.html") {
    wireTeacherLoginRedirect();
  }
});

function addPasswordVisibilityToggle(input) {
  if (!input || input.dataset.visibilityToggleReady === "1") return;

  input.dataset.visibilityToggleReady = "1";

  const wrapper = document.createElement("div");
  wrapper.className = "password-field-wrap";

  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "password-visibility-toggle";
  toggle.setAttribute("aria-label", "Show password");
  toggle.setAttribute("title", "Show password");
  toggle.innerHTML = `
    <svg class="password-eye-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.3 12s3.4-6 9.7-6 9.7 6 9.7 6-3.4 6-9.7 6-9.7-6-9.7-6Z"></path>
      <circle cx="12" cy="12" r="2.8"></circle>
    </svg>
  `;

  toggle.addEventListener("click", () => {
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    toggle.classList.toggle("is-visible", !showing);
    toggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    toggle.setAttribute("title", showing ? "Show password" : "Hide password");
  });

  wrapper.appendChild(toggle);
}

function wirePasswordVisibilityToggles() {
  document
    .querySelectorAll('input[type="password"]')
    .forEach(addPasswordVisibilityToggle);
}

document.addEventListener("DOMContentLoaded", wirePasswordVisibilityToggles);


(function injectPasswordVisibilityStyles() {
  if (document.getElementById("password-visibility-styles")) return;

  const style = document.createElement("style");
  style.id = "password-visibility-styles";
  style.textContent = `
    .password-field-wrap {
      position: relative;
      width: 100%;
    }

    .password-field-wrap > input {
      padding-right: 46px !important;
    }

    .password-visibility-toggle {
      position: absolute;
      top: 50%;
      right: 7px;
      transform: translateY(-50%);
      width: 34px;
      height: 34px;
      min-width: 34px;
      padding: 0;
      margin: 0;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: #64748b;
      display: grid;
      place-items: center;
      cursor: pointer;
      z-index: 2;
    }

    .password-visibility-toggle:hover,
    .password-visibility-toggle:focus-visible {
      background: #eff6ff;
      color: #1d4ed8;
      outline: none;
    }

    .password-eye-icon {
      width: 20px;
      height: 20px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
      pointer-events: none;
    }

    .password-visibility-toggle.is-visible .password-eye-icon {
      color: #2563eb;
    }
  `;
  document.head.appendChild(style);
})();
