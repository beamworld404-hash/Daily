// 关注清单日报：深浅色切换、图表悬停提示、目录高亮。页面不依赖本脚本也能完整阅读。
(function () {
  "use strict";
  var root = document.documentElement;

  // 深浅色：跟随系统 → 浅 → 深 循环；选择保存在本机 localStorage。
  var btn = document.querySelector("[data-theme-toggle]");
  if (btn) {
    var label = function () {
      var t = root.dataset.theme;
      btn.querySelector(".theme-txt").textContent = t === "dark" ? "深色" : t === "light" ? "浅色" : "跟随系统";
    };
    label();
    btn.addEventListener("click", function () {
      var t = root.dataset.theme;
      var next = !t ? "light" : t === "light" ? "dark" : "";
      if (next) root.dataset.theme = next; else delete root.dataset.theme;
      try { next ? localStorage.setItem("daily-theme", next) : localStorage.removeItem("daily-theme"); } catch (e) {}
      label();
    });
  }

  // 图表悬停 / 键盘聚焦提示：读取 data-tip（以 | 分行，首行为标题）。
  var tip = document.createElement("div");
  tip.className = "tip";
  tip.setAttribute("role", "status");
  document.body.appendChild(tip);
  function show(el, x, y) {
    var lines = el.getAttribute("data-tip").split("|");
    tip.textContent = "";
    var b = document.createElement("b");
    b.textContent = lines[0];
    tip.appendChild(b);
    for (var i = 1; i < lines.length; i++) {
      var d = document.createElement("div");
      d.textContent = lines[i];
      tip.appendChild(d);
    }
    tip.classList.add("on");
    var r = tip.getBoundingClientRect();
    var left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x + 14));
    var top = y - r.height - 12;
    if (top < 8) top = y + 16;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  function hide() { tip.classList.remove("on"); }
  document.querySelectorAll("[data-tip]").forEach(function (el) {
    el.addEventListener("pointermove", function (e) { show(el, e.clientX, e.clientY); });
    el.addEventListener("pointerleave", hide);
    el.addEventListener("focus", function () {
      var r = el.getBoundingClientRect();
      show(el, r.left + r.width / 2, r.top + 20);
    });
    el.addEventListener("blur", hide);
  });
  window.addEventListener("scroll", hide, { passive: true });

  // 目录高亮当前节。
  var links = Array.prototype.slice.call(document.querySelectorAll(".toc a[href^='#']"));
  if (links.length && "IntersectionObserver" in window) {
    var map = {};
    links.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && map[en.target.id]) {
          links.forEach(function (a) { a.classList.remove("active"); });
          map[en.target.id].classList.add("active");
        }
      });
    }, { rootMargin: "-80px 0px -70% 0px" });
    Object.keys(map).forEach(function (id) {
      var s = document.getElementById(id);
      if (s) io.observe(s);
    });
  }
})();
