// Newsletter subscription — calls Cloudflare Worker API
(function () {
  const API_URL = "https://newsletter-worker.wlfjck.workers.dev";

  const form = document.getElementById("newsletter-form");
  const input = document.getElementById("newsletter-email");
  const btn = document.getElementById("newsletter-btn");
  const msg = document.getElementById("newsletter-msg");
  const bar = document.getElementById("newsletter-bar");

  if (!form) return;

  // Show confirmation message if redirected from confirm link
  const params = new URLSearchParams(window.location.search);
  if (params.get("subscribed") === "confirmed") {
    showMsg("✓ Subscription confirmed! Welcome aboard.", "success");
    // Clean URL
    window.history.replaceState({}, "", window.location.pathname);
  } else if (params.get("subscribed") === "already") {
    showMsg("You're already subscribed.", "success");
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
        showMsg(data.error || "Something went wrong", "error");
      }
    } catch {
      showMsg("Network error. Please try again.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Subscribe";
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
