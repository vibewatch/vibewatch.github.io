// Newsletter subscription — dialog with Cloudflare Worker API
(function () {
  const API_URL = "https://newsletter-worker.wlfjck.workers.dev";

  const overlay = document.getElementById("subscribe-overlay");
  const dialog = document.getElementById("subscribe-dialog");
  const openBtn = document.getElementById("subscribe-open");
  const closeBtn = document.getElementById("subscribe-close");
  const form = document.getElementById("newsletter-form");
  const input = document.getElementById("newsletter-email");
  const btn = document.getElementById("newsletter-btn");
  const msg = document.getElementById("newsletter-msg");

  if (!form || !overlay) return;

  const isZh = document.documentElement.lang === "zh";
  const btnLabel = isZh ? "订阅" : "Subscribe";

  const i18n = {
    confirmed:    isZh ? "✓ 订阅已确认！欢迎加入。"       : "✓ Subscription confirmed! Welcome aboard.",
    already:      isZh ? "你已经订阅过了。"                : "You're already subscribed.",
    networkError: isZh ? "网络错误，请稍后重试。"          : "Network error. Please try again.",
    fallbackError:isZh ? "出了点问题"                      : "Something went wrong",
  };

  // Open / close dialog
  function openDialog() {
    overlay.classList.add("is-open");
    input.focus({ preventScroll: true });
  }
  function closeDialog() {
    overlay.classList.remove("is-open");
  }

  if (openBtn) openBtn.addEventListener("click", openDialog);
  if (closeBtn) closeBtn.addEventListener("click", closeDialog);

  // Close on overlay click (not dialog body)
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeDialog();
  });

  // Close on Escape
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && overlay.classList.contains("is-open")) closeDialog();
  });

  // Show confirmation message if redirected from confirm link
  const params = new URLSearchParams(window.location.search);
  if (params.get("subscribed") === "confirmed") {
    openDialog();
    showMsg(i18n.confirmed, "success");
    window.history.replaceState({}, "", window.location.pathname);
  } else if (params.get("subscribed") === "already") {
    openDialog();
    showMsg(i18n.already, "success");
    window.history.replaceState({}, "", window.location.pathname);
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const email = input.value.trim();
    if (!email) return;

    btn.disabled = true;
    btn.textContent = "…";
    hideMsg();

    try {
      const resp = await fetch(API_URL + "/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email }),
      });

      const data = await resp.json();

      if (resp.ok) {
        showMsg("✓ " + data.message, "success");
        input.value = "";
      } else {
        showMsg(data.error || i18n.fallbackError, "error");
      }
    } catch {
      showMsg(i18n.networkError, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = btnLabel;
    }
  });

  function showMsg(text, type) {
    msg.textContent = text;
    msg.className = "subscribe-dialog__msg subscribe-dialog__msg--" + type;
  }

  function hideMsg() {
    msg.textContent = "";
    msg.className = "subscribe-dialog__msg";
  }
})();
