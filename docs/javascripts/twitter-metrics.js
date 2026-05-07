// Social report readability — collapse inline engagement metrics by default.
(function () {
  const METRIC_TRIGGER = String.raw`[0-9０-９][0-9０-９,，.Kk万+]*\s*(?:score|upvotes?|votes?|points?|comments?|likes?|replies|bookmarks?|views?|retweets?|reposts?|quotes?|点赞|个赞|次点赞|赞同|赞成|回复|条回复|收藏数?|次收藏|个收藏|书签|个书签|浏览量|次浏览|观看量|次观看|转发|次转发|引用|次引用|评论|条评论|得分|分(?!钟))`;
  const LEADING_SCORE_TRIGGER = String.raw`\s*(?:\bscore\b\s*[:：]?\s*[0-9０-９]|得分\s*[0-9０-９])`;
  const METRIC_PATTERN = new RegExp(
    String.raw`(?:\((?=(?:${LEADING_SCORE_TRIGGER}|[^)]*${METRIC_TRIGGER}))[^()]{1,180}\)|（(?=(?:${LEADING_SCORE_TRIGGER}|[^）]*${METRIC_TRIGGER}))[^（）]{1,180}）|\[(?=(?:${LEADING_SCORE_TRIGGER}|[^\]]*${METRIC_TRIGGER}))[^\[\]]{1,100}\])`,
    "gi"
  );
  const STORAGE_KEY = "engagementMetricsVisible";
  const LEGACY_STORAGE_KEY = "twitterMetricsVisible";
  const SKIP_TAGS = new Set([
    "A",
    "BUTTON",
    "CODE",
    "INPUT",
    "KBD",
    "PRE",
    "SAMP",
    "SCRIPT",
    "STYLE",
    "TEXTAREA",
  ]);

  function getReportSource() {
    if (location.pathname.includes("/twitter/")) return "twitter";
    if (location.pathname.includes("/reddit/")) return "reddit";
    return "";
  }

  function isZh() {
    return document.documentElement.lang === "zh" || location.pathname.includes("/zh/");
  }

  function getStoredVisibility() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      if (value !== null) return value === "true";
      return localStorage.getItem(LEGACY_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  }

  function setStoredVisibility(value) {
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Ignore storage failures, e.g. strict privacy modes.
    }
  }

  function hasSkippedAncestor(node, root) {
    let element = node.parentElement;
    while (element && element !== root) {
      if (SKIP_TAGS.has(element.tagName) || element.classList.contains("engagement-metrics")) {
        return true;
      }
      element = element.parentElement;
    }
    return false;
  }

  function metricIcon() {
    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");
    svg.setAttribute("class", "engagement-metrics__icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("stroke-width", "2.2");

    ["M4 19h16", "M7 16V10", "M12 16V5", "M17 16v-8"].forEach(function (d) {
      const path = document.createElementNS(namespace, "path");
      path.setAttribute("d", d);
      svg.append(path);
    });

    return svg;
  }

  function metricAriaLabel(metricText, langZh, source) {
    if (source === "reddit") {
      return langZh
        ? "显示 Reddit 互动数据：" + metricText
        : "Show Reddit engagement metrics: " + metricText;
    }

    return langZh
      ? "显示推文互动数据：" + metricText
      : "Show tweet engagement metrics: " + metricText;
  }

  function metricButton(metricText, langZh, source) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "engagement-metrics";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", metricAriaLabel(metricText, langZh, source));
    button.title = metricText;

    const details = document.createElement("span");
    details.className = "engagement-metrics__details";
    details.textContent = metricText;

    button.append(metricIcon(), details);
    return button;
  }

  function replaceMetricTextNode(node, langZh, source) {
    const text = node.nodeValue;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    let count = 0;

    METRIC_PATTERN.lastIndex = 0;
    while ((match = METRIC_PATTERN.exec(text)) !== null) {
      if (match.index > lastIndex) {
        fragment.append(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      fragment.append(metricButton(match[0], langZh, source));
      lastIndex = match.index + match[0].length;
      count += 1;
    }

    if (lastIndex < text.length) {
      fragment.append(document.createTextNode(text.slice(lastIndex)));
    }

    if (count > 0) {
      node.parentNode.replaceChild(fragment, node);
    }

    return count;
  }

  function wrapMetrics(root, langZh, source) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!METRIC_PATTERN.test(node.nodeValue)) {
          METRIC_PATTERN.lastIndex = 0;
          return NodeFilter.FILTER_REJECT;
        }
        METRIC_PATTERN.lastIndex = 0;
        return hasSkippedAncestor(node, root)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    });

    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    return nodes.reduce(function (total, node) {
      return total + replaceMetricTextNode(node, langZh, source);
    }, 0);
  }

  function toolbarButtonText(visible, count, langZh, source) {
    if (source === "reddit") {
      return visible
        ? (langZh ? "隐藏 Reddit 数据" : "Hide Reddit stats")
        : (langZh ? "显示 Reddit 数据" : "Show Reddit stats") + " (" + count + ")";
    }

    return visible
      ? (langZh ? "隐藏推文数据" : "Hide tweet stats")
      : (langZh ? "显示推文数据" : "Show tweet stats") + " (" + count + ")";
  }

  function toolbarHintText(langZh, source) {
    if (source === "reddit") {
      return langZh
        ? "已自动收起 Reddit 互动数据，减少阅读噪音。"
        : "Reddit engagement metrics are collapsed to reduce reading noise.";
    }

    return langZh
      ? "已自动收起推文互动数据，减少阅读噪音。"
      : "Tweet engagement metrics are collapsed to reduce reading noise.";
  }

  function updateToolbarButton(button, count, langZh, source) {
    const visible = document.documentElement.classList.contains("engagement-metrics-visible");
    button.setAttribute("aria-pressed", String(visible));
    button.textContent = toolbarButtonText(visible, count, langZh, source);
  }

  function addToolbar(root, count, langZh, source) {
    const toolbar = document.createElement("div");
    toolbar.className = "engagement-metrics-toolbar";

    const hint = document.createElement("span");
    hint.className = "engagement-metrics-toolbar__hint";
    hint.textContent = toolbarHintText(langZh, source);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "engagement-metrics-toolbar__button";
    updateToolbarButton(button, count, langZh, source);

    button.addEventListener("click", function () {
      const nextVisible = !document.documentElement.classList.contains("engagement-metrics-visible");
      document.documentElement.classList.toggle("engagement-metrics-visible", nextVisible);
      setStoredVisibility(nextVisible);
      updateToolbarButton(button, count, langZh, source);
    });

    toolbar.append(hint, button);

    const heading = root.querySelector("h1");
    if (heading) {
      heading.insertAdjacentElement("afterend", toolbar);
    } else {
      root.prepend(toolbar);
    }
  }

  function initEngagementMetrics() {
    const source = getReportSource();
    if (!source) return;

    const root = document.querySelector(".md-content .md-typeset");
    if (!root || root.dataset.engagementMetricsProcessed === "true") return;

    const langZh = isZh();
    document.documentElement.classList.toggle("engagement-metrics-visible", getStoredVisibility());

    const count = wrapMetrics(root, langZh, source);
    if (count === 0) return;

    root.dataset.engagementMetricsProcessed = "true";
    root.addEventListener("click", function (event) {
      const button = event.target.closest(".engagement-metrics");
      if (!button || !root.contains(button)) return;

      const expanded = !button.classList.contains("is-expanded");
      button.classList.toggle("is-expanded", expanded);
      button.setAttribute("aria-expanded", String(expanded));
    });

    addToolbar(root, count, langZh, source);
  }

  if (typeof document$ !== "undefined") {
    document$.subscribe(initEngagementMetrics);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEngagementMetrics);
  } else {
    initEngagementMetrics();
  }
})();
