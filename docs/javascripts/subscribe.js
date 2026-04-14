// Newsletter subscription — calls Cloudflare Worker API
(function () {
  const API_URL = "https://newsletter-worker.wlfjck.workers.dev";

  const form = document.getElementById("newsletter-form");
  const input = document.getElementById("newsletter-email");
  const btn = document.getElementById("newsletter-btn");
  const msg = document.getElementById("newsletter-msg");
  const bar = document.getElementById("newsletter-bar");

  if (!form) return;

  const isZh = document.documentElement.lang === "zh";
  const btnLabel = isZh ? "订阅" : "Subscribe";

  const i18n = {
    confirmed:    isZh ? "✓ 订阅已确认！欢迎加入。"       : "✓ Subscription confirmed! Welcome aboard.",
    already:      isZh ? "你已经订阅过了。"                : "You're already subscribed.",
    networkError: isZh ? "网络错误，请稍后重试。"          : "Network error. Please try again.",
    fallbackError:isZh ? "出了点问题"                      : "Something went wrong",
  };

  // Show confirmation message if redirected from confirm link
  const params = new URLSearchParams(window.location.search);
  if (params.get("subscribed") === "confirmed") {
    showMsg(i18n.confirmed, "success");
    window.history.replaceState({}, "", window.location.pathname);
  } else if (params.get("subscribed") === "already") {
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
    msg.className = "newsletter-msg newsletter-msg--" + type;
  }

  function hideMsg() {
    msg.textContent = "";
    msg.className = "newsletter-msg";
  }
})();
