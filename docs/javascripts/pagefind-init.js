// Pagefind UI — instantiate on load, wire header trigger to overlay
(function () {
  const overlay = document.getElementById("pagefind-overlay");
  const openBtn = document.getElementById("pagefind-open");
  const closeBtn = document.getElementById("pagefind-close");
  const mount = document.getElementById("pagefind-search");

  if (!overlay || !mount || typeof PagefindUI === "undefined") return;

  const isZh = document.documentElement.lang === "zh";

  // eslint-disable-next-line no-new, no-undef
  new PagefindUI({
    element: "#pagefind-search",
    showImages: false,
    showEmptyFilters: false,
    resetStyles: false,
    translations: isZh
      ? {
          placeholder: "搜索站点…",
          clear_search: "清除",
          load_more: "加载更多",
          search_label: "搜索",
          filters_label: "筛选",
          zero_results: "未找到 [SEARCH_TERM] 的结果",
          many_results: "找到 [COUNT] 个 [SEARCH_TERM] 的结果",
          one_result: "找到 [COUNT] 个 [SEARCH_TERM] 的结果",
          searching: "搜索中…",
        }
      : undefined,
  });

  function openOverlay() {
    overlay.classList.add("is-open");
    const input = overlay.querySelector(".pagefind-ui__search-input");
    if (input) input.focus({ preventScroll: true });
  }
  function closeOverlay() {
    overlay.classList.remove("is-open");
  }

  if (openBtn) openBtn.addEventListener("click", openOverlay);
  if (closeBtn) closeBtn.addEventListener("click", closeOverlay);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeOverlay();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && overlay.classList.contains("is-open")) closeOverlay();
    // Cmd+K / Ctrl+K shortcut
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openOverlay();
    }
  });
})();
