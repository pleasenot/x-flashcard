(() => {
  "use strict";

  const CAT_ORDER = ["全部", "AI视频", "搞钱玩法", "小程序", "AI工具", "羊毛福利", "运营起号", "待分类"];

  const state = {
    cards: [],
    filter: "全部",
    query: "",
    index: 0,
    flipped: false,
    dragging: false,
  };

  const articleCache = new Map();
  const els = {};
  let lastFocus = null;
  let drag = null;

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));

  function formatCount(n) {
    if (n == null || n === "") return null;
    const num = Number(n);
    if (!Number.isFinite(num)) return null;
    if (num === 0) return "0";
    if (Math.abs(num) < 10000) return num.toLocaleString("zh-CN");
    if (Math.abs(num) < 1e8) {
      const v = num / 10000;
      const digits = v >= 100 ? 0 : 1;
      return `${v.toFixed(digits).replace(/\.0$/, "")}万`;
    }
    return `${(num / 1e8).toFixed(1).replace(/\.0$/, "")}亿`;
  }

  const dateFmt = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Kuala_Lumpur",
  });

  function formatDate(iso) {
    if (!iso) return "";
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return esc(iso);
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00+08:00`);
    if (Number.isNaN(d.getTime())) return esc(iso);
    return dateFmt.format(d);
  }

  function mono(name) {
    const t = String(name || "").trim();
    if (!t) return "藏";
    const ch = t[0];
    return /[a-z]/i.test(ch) ? ch.toUpperCase() : ch;
  }

  function filtered() {
    const q = state.query.trim().toLowerCase();
    return state.cards.filter((c) => {
      const cat = c.cat || "待分类";
      if (state.filter !== "全部" && cat !== state.filter) return false;
      if (!q) return true;
      const hay = [c.title, c.author, c.handle, c.summary, c.note, cat]
        .filter(Boolean)
        .join("\n")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  function counts() {
    const all = {};
    for (const c of state.cards) {
      const cat = c.cat || "待分类";
      all[cat] = (all[cat] || 0) + 1;
    }
    all["全部"] = state.cards.length;
    if (state.query.trim()) {
      const vis = filtered();
      const qCounts = { 全部: vis.length };
      for (const c of vis) {
        const cat = c.cat || "待分类";
        qCounts[cat] = (qCounts[cat] || 0) + 1;
      }
      return { base: all, shown: qCounts, scoped: true };
    }
    return { base: all, shown: all, scoped: false };
  }

  function usedCats() {
    const present = new Set(state.cards.map((c) => c.cat || "待分类"));
    return CAT_ORDER.filter((c) => c === "全部" || present.has(c));
  }

  function renderChips() {
    const { shown } = counts();
    els.chips.innerHTML = usedCats()
      .map((cat) => {
        const n = shown[cat] || 0;
        const active = state.filter === cat;
        return `<button type="button" class="chip${active ? " is-active" : ""}" aria-pressed="${active}" data-cat="${esc(cat)}">${esc(cat)}<span class="chip-count">${n}</span></button>`;
      })
      .join("");
  }

  function statItem(icon, value, label) {
    const text = formatCount(value);
    if (text == null) return "";
    return `<span class="stat" title="${esc(label)}">${icon}<span>${text}</span></span>`;
  }

  const ICONS = {
    like: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12.6 20.4c-.3.2-.8.2-1.1 0C8.2 18.3 3 14.2 3 9.4 3 6.6 5.2 4.5 8 4.5c1.6 0 3 .7 4 1.9a5.1 5.1 0 0 1 4-1.9c2.8 0 5 2.1 5 4.9 0 4.8-5.2 8.9-8.4 11Z"/></svg>',
    save: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M7 3.5h10c1 0 1.8.8 1.8 1.8v14.4a.8.8 0 0 1-1.25.66L12 16.6 6.45 20.4A.8.8 0 0 1 5.2 19.7V5.3C5.2 4.3 6 3.5 7 3.5Z"/></svg>',
    view: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 6.5c4.4 0 8.1 3 9.7 5.1a1.5 1.5 0 0 1 0 1.8C20.1 15.5 16.4 18.5 12 18.5S3.9 15.5 2.3 13.4a1.5 1.5 0 0 1 0-1.8C3.9 9.5 7.6 6.5 12 6.5Zm0 2.2A3.8 3.8 0 1 0 15.8 12 3.8 3.8 0 0 0 12 8.7Z"/></svg>',
  };

  function mediaItems(card) {
    const items = [];
    if (card.cover) items.push({ src: card.cover, alt: `${card.title} 封面` });
    (card.media || []).forEach((m, i) => {
      if (card.cover && m.src === card.cover) return;
      items.push({ src: m.src, alt: `${card.title} 配图 ${i + 1}` });
    });
    return items;
  }

  function mediaButtons(card) {
    const show = mediaItems(card);
    if (!show.length) return "";
    return `<div class="media-strip">${show
      .map((m) => `<button type="button" class="media-btn" data-full="${esc(m.src)}" aria-label="${esc(m.alt)}"><img src="${esc(m.src)}" alt="" width="74" height="74" loading="lazy"></button>`)
      .join("")}</div>`;
  }

  function coverBlock(card) {
    if (card.cover) {
      return `<div class="cover"><img src="${esc(card.cover)}" alt="" width="${card.coverWidth || 1200}" height="${card.coverHeight || 480}" draggable="false"></div>`;
    }
    const m = esc(mono(card.author));
    return `<div class="cover"><div class="cover-fallback"><span class="fallback-watermark" aria-hidden="true">${m}</span><span class="fallback-cat">${esc(card.cat || "待分类")}</span><span class="fallback-mono" aria-hidden="true">${m}</span></div></div>`;
  }

  function frontHTML(card) {
    const stats = [
      statItem(ICONS.like, card.likes, "点赞"),
      statItem(ICONS.save, card.saves, "收藏"),
      statItem(ICONS.view, card.views, "浏览"),
    ].join("");
    return `
      <div class="card-face card-front">
        ${coverBlock(card)}
        <div class="card-body">
          <div class="card-meta">
            <span class="cat-pill">${esc(card.cat || "待分类")}</span>
            <time datetime="${esc(card.date)}">${formatDate(card.date)}</time>
          </div>
          <h2 class="card-title">${esc(card.title)}</h2>
          <p class="card-summary">${esc(card.summary)}</p>
          <div class="card-footer">
            <div class="author">
              <span class="author-mono" aria-hidden="true">${esc(mono(card.author))}</span>
              <div class="author-text">
                <div class="author-name">${esc(card.author)}</div>
                <div class="author-handle" translate="no">@${esc(card.handle)}</div>
              </div>
            </div>
            ${stats ? `<div class="stats">${stats}</div>` : ""}
            <span class="flip-hint">点按翻转</span>
          </div>
        </div>
      </div>`;
  }

  function backHTML(card) {
    const note = card.note
      ? `<div class="note"><span class="note-label">笔记</span>${esc(card.note)}</div>`
      : "";
    const body = card.bodyHtml
      ? `<div class="excerpt excerpt-html">${card.bodyHtml}</div>`
      : card.excerpt
        ? `<p class="excerpt">${esc(card.excerpt)}${card.hasArticle ? "…" : ""}</p>`
        : card.summary
          ? `<p class="excerpt">${esc(card.summary)}</p>`
          : "";
    const readBtn = card.hasArticle
      ? `<button type="button" class="action-btn primary js-read">阅读全文</button>`
      : "";
    const linkClass = card.hasArticle ? "action-btn" : "action-btn primary";
    return `
      <div class="card-face card-back">
        <div class="back-scroll">
          <p class="back-kicker"><span class="cat-pill">${esc(card.cat || "待分类")}</span><time datetime="${esc(card.date)}">${formatDate(card.date)}</time></p>
          <h2 class="back-title">${esc(card.title)}</h2>
          ${note}
          ${body}
          ${mediaButtons(card)}
        </div>
        <div class="back-actions">
          ${readBtn}
          <a class="${linkClass}" href="${esc(card.url)}" target="_blank" rel="noopener noreferrer">打开原帖</a>
          <button type="button" class="action-btn js-unflip">返回正面</button>
        </div>
      </div>`;
  }

  function cardTemplate(card, slot, flipped) {
    return `<article class="card-slot" data-slot="${slot}" data-id="${esc(card.id)}">
      <div class="card${flipped && slot === 0 ? " is-flipped" : ""}" data-cat="${esc(card.cat || "待分类")}" role="button" aria-pressed="${flipped && slot === 0}" tabindex="-1" aria-label="${esc(card.title)}，点按翻转">
        <div class="card-inner">
          ${frontHTML(card)}
          ${backHTML(card)}
        </div>
      </div>
    </article>`;
  }


  function syncUrl() {
    const params = new URLSearchParams();
    const card = currentCard();
    if (state.filter && state.filter !== "全部") params.set("cat", state.filter);
    if (state.query.trim()) params.set("q", state.query.trim());
    if (card) params.set("id", card.id);
    if (state.flipped) params.set("flip", "1");
    if (els.reader && els.reader.open) params.set("read", "1");
    const theme = currentTheme();
    if (theme === "light" || theme === "dark") params.set("theme", theme);
    const qs = params.toString();
    const url = qs ? `${location.pathname}?${qs}` : location.pathname;
    try { history.replaceState(null, "", url); } catch (e) {}
  }

  function renderDeck() {
    const list = filtered();
    const empty = list.length === 0;
    document.body.classList.toggle("is-empty", empty);
    els.empty.hidden = !empty;

    const total = state.cards.length;
    const vis = list.length;
    const q = state.query.trim();
    if (q) {
      els.brandSub.textContent = vis ? `找到 ${vis} 张，共 ${total} 张` : `未找到匹配，共 ${total} 张`;
    } else if (state.filter === "全部") {
      els.brandSub.textContent = `已收藏 ${total} 张`;
    } else {
      els.brandSub.textContent = `${state.filter} ${vis} 张，共 ${total} 张`;
    }

    if (empty) {
      els.deck.innerHTML = "";
      els.pagerCount.textContent = "0 / 0";
      els.prevBtn.disabled = true;
      els.nextBtn.disabled = true;
      els.pagerThumb.style.width = "0%";
      return;
    }

    if (state.index >= list.length) state.index = 0;
    if (state.index < 0) state.index = list.length - 1;

    const slots = [];
    for (const s of [-1, 0, 1, 2]) {
      const i = state.index + s;
      if (i < 0 || i >= list.length) continue;
      slots.push(cardTemplate(list[i], s, state.flipped && s === 0));
    }
    els.deck.innerHTML = slots.join("");

    const pos = state.index + 1;
    els.pagerCount.textContent = `${pos} / ${list.length}`;
    const w = Math.max(100 / list.length, 14);
    els.pagerThumb.style.width = `${w}%`;
    els.pagerThumb.style.transform = "none";
    const left = list.length <= 1 ? 0 : (state.index / (list.length - 1)) * (100 - w);
    els.pagerThumb.style.left = `${left}%`;

    els.prevBtn.disabled = state.index <= 0;
    els.nextBtn.disabled = state.index >= list.length - 1;
    syncUrl();
  }

  function go(delta) {
    const list = filtered();
    if (!list.length) return;
    const next = state.index + delta;
    if (next < 0 || next >= list.length) return;
    state.index = next;
    state.flipped = false;
    renderDeck();
  }

  function currentCard() {
    const list = filtered();
    return list[state.index] || null;
  }

  function toggleFlip(force) {
    const cardEl = els.deck.querySelector('.card-slot[data-slot="0"] .card');
    if (!cardEl) return;
    state.flipped = typeof force === "boolean" ? force : !state.flipped;
    cardEl.classList.toggle("is-flipped", state.flipped);
    cardEl.setAttribute("aria-pressed", String(state.flipped));
    syncUrl();
  }

  async function openReader(card) {
    lastFocus = document.activeElement;
    els.readerKicker.innerHTML = `<span class="cat-pill">${esc(card.cat || "待分类")}</span><time datetime="${esc(card.date)}">${formatDate(card.date)}</time><span class="reader-handle" translate="no">@${esc(card.handle)}</span>`;
    els.readerTitle.textContent = card.title;
    els.readerBody.innerHTML = `<p class="reader-aside">正在载入全文…</p>`;
    els.readerFoot.innerHTML = `<a class="action-btn primary" href="${esc(card.url)}" target="_blank" rel="noopener noreferrer">打开原帖</a>`;
    if (!els.reader.open) els.reader.showModal();
    syncUrl();

    let html = card.bodyHtml || "";
    let omitted = !!card.omittedCode;
    if (card.hasArticle) {
      if (!articleCache.has(card.id)) {
        try {
          const res = await fetch(`data/articles/${card.id}.json`);
          if (!res.ok) throw new Error("load failed");
          articleCache.set(card.id, await res.json());
        } catch (err) {
          els.readerBody.innerHTML = `<p>全文暂时无法载入。请改看<a href="${esc(card.url)}" target="_blank" rel="noopener noreferrer">原帖</a>。</p>`;
          return;
        }
      }
      const data = articleCache.get(card.id);
      html = data.html || "";
      omitted = omitted || !!data.omittedCode;
    }
    const note = card.note
      ? `<div class="reader-note"><span class="note-label">笔记</span>${esc(card.note)}</div>`
      : "";
    const aside = omitted
      ? `<p class="reader-aside">原文中的部分代码块未能按顺序还原，完整内容请查看原帖。</p>`
      : "";
    if (!html) html = `<p>${esc(card.summary || "这篇收藏没有本地全文，请打开原帖阅读。")}</p>`;
    els.readerBody.innerHTML = note + html + aside;
    els.readerBody.scrollTop = 0;
  }

  function openLightbox(src, alt) {
    lastFocus = document.activeElement;
    els.lightboxImg.src = src;
    els.lightboxImg.alt = alt || "配图";
    if (!els.lightbox.open) els.lightbox.showModal();
  }

  /* Theme */
  function currentTheme() {
    return document.documentElement.dataset.theme || "system";
  }
  function applyTheme(next) {
    if (next === "system") {
      delete document.documentElement.dataset.theme;
      try { localStorage.removeItem("x-flashcards-theme"); } catch (e) {}
    } else {
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("x-flashcards-theme", next); } catch (e) {}
    }
    const isDark =
      next === "dark" ||
      (next !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      if (m.media && m.media.includes("dark") && !isDark) return;
      if (m.media && m.media.includes("light") && isDark) return;
      m.content = isDark ? "#0C1018" : "#E7ECF5";
    });
    els.themeToggle.setAttribute("aria-label", isDark ? "切换为浅色主题" : "切换为深色主题");
    if (state.cards.length) syncUrl();
  }
  function toggleTheme() {
    const darkNow =
      currentTheme() === "dark" ||
      (currentTheme() !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    applyTheme(darkNow ? "light" : "dark");
  }

  /* Pointer swipe */
  function onPointerDown(e) {
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest("a, button, input, .back-scroll, .media-strip")) return;
    const list = filtered();
    if (list.length < 2 && !state.flipped) {
      // still allow click-to-flip
    }
    drag = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      axis: null,
      moved: false,
    };
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.dx = e.clientX - drag.startX;
    drag.dy = e.clientY - drag.startY;
    if (!drag.axis) {
      if (Math.hypot(drag.dx, drag.dy) < 8) return;
      drag.axis = Math.abs(drag.dx) > Math.abs(drag.dy) * 1.1 ? "x" : "y";
      if (drag.axis === "x") {
        drag.moved = true;
        state.dragging = true;
        els.deck.classList.add("is-dragging");
        try { els.deck.setPointerCapture(e.pointerId); } catch (err) {}
      }
    }
    if (drag.axis !== "x") return;
    e.preventDefault();
    const width = els.deck.clientWidth || 320;
    const dx = drag.dx;
    const list = filtered();
    const atStart = state.index <= 0 && dx > 0;
    const atEnd = state.index >= list.length - 1 && dx < 0;
    const resist = atStart || atEnd ? 0.28 : 1;
    const x = dx * resist;
    const slots = els.deck.querySelectorAll(".card-slot");
    slots.forEach((slot) => {
      const s = Number(slot.dataset.slot);
      if (s === 0) {
        slot.style.transform = `translate3d(${x}px, 0, 0) rotate(${x / 48}deg)`;
        slot.style.opacity = String(1 - Math.min(0.35, Math.abs(x) / width * 0.4));
      } else if (s === 1 && x < 0) {
        const p = Math.min(1, -x / width);
        slot.style.transform = `translate3d(${0.7 * (1 - p)}rem, ${1 * (1 - p)}rem, 0) scale(${0.955 + 0.045 * p})`;
        slot.style.opacity = String(0.8 + 0.2 * p);
      } else if (s === -1 && x > 0) {
        const p = Math.min(1, x / width);
        slot.style.transform = `translate3d(${-118 * (1 - p)}%, 0, 0) rotate(${-3 * (1 - p)}deg)`;
        slot.style.opacity = String(p);
      }
    });
  }

  function finishDrag(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { dx, moved, axis, startX, startY } = drag;
    drag = null;
    els.deck.classList.remove("is-dragging");
    state.dragging = false;
    const slots = els.deck.querySelectorAll(".card-slot");
    slots.forEach((slot) => {
      slot.style.transform = "";
      slot.style.opacity = "";
    });
    if (axis === "x" && moved) {
      const width = els.deck.clientWidth || 320;
      const threshold = Math.min(96, width * 0.22);
      if (dx <= -threshold) go(1);
      else if (dx >= threshold) go(-1);
      return;
    }
    // tap
    const target = e.target;
    if (target.closest("a, button, input, .media-strip")) return;
    if (Math.hypot((e.clientX || startX) - startX, (e.clientY || startY) - startY) > 8) return;
    if (!target.closest(".card-slot[data-slot='0']")) return;
    const cover = target.closest(".cover");
    if (cover && cover.querySelector("img")) {
      const card = currentCard();
      if (card && card.cover) {
        openLightbox(card.cover, `${card.title} 封面`);
        return;
      }
    }
    toggleFlip();
  }

  function onKey(e) {
    if (e.target.closest("input, textarea")) return;
    if (els.lightbox.open) {
      if (e.key === "Escape") els.lightbox.close();
      return;
    }
    if (els.reader.open) {
      if (e.key === "Escape") els.reader.close();
      return;
    }
    if (e.key === "Escape") {
      if (state.flipped) {
        e.preventDefault();
        toggleFlip(false);
      }
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    } else if (e.key === "Home") {
      e.preventDefault();
      state.index = 0;
      state.flipped = false;
      renderDeck();
    } else if (e.key === "End") {
      e.preventDefault();
      state.index = Math.max(0, filtered().length - 1);
      state.flipped = false;
      renderDeck();
    } else if ((e.key === "Enter" || e.key === " ") && (e.target === els.deck || e.target.closest(".card"))) {
      e.preventDefault();
      toggleFlip();
    }
  }

  function bind() {
    els.chips.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      state.filter = btn.dataset.cat;
      state.index = 0;
      state.flipped = false;
      renderChips();
      renderDeck();
    });

    let searchTimer = 0;
    els.search.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.query = els.search.value;
        state.index = 0;
        state.flipped = false;
        renderChips();
        renderDeck();
      }, 80);
    });

    els.clearSearch.addEventListener("click", () => {
      els.search.value = "";
      state.query = "";
      state.index = 0;
      renderChips();
      renderDeck();
      els.search.focus();
    });

    els.prevBtn.addEventListener("click", () => go(-1));
    els.nextBtn.addEventListener("click", () => go(1));
    els.themeToggle.addEventListener("click", toggleTheme);

    els.deck.addEventListener("pointerdown", onPointerDown);
    els.deck.addEventListener("pointermove", onPointerMove);
    els.deck.addEventListener("pointerup", finishDrag);
    els.deck.addEventListener("pointercancel", finishDrag);
    els.deck.addEventListener("lostpointercapture", (e) => {
      if (drag && e.pointerId === drag.pointerId) finishDrag(e);
    });

    els.deck.addEventListener("click", (e) => {
      const read = e.target.closest(".js-read");
      if (read) {
        e.preventDefault();
        e.stopPropagation();
        const card = currentCard();
        if (card) openReader(card);
        return;
      }
      const unflip = e.target.closest(".js-unflip");
      if (unflip) {
        e.preventDefault();
        e.stopPropagation();
        toggleFlip(false);
        return;
      }
      const media = e.target.closest(".media-btn");
      if (media) {
        e.preventDefault();
        e.stopPropagation();
        openLightbox(media.dataset.full, media.getAttribute("aria-label"));
      }
    });

    document.addEventListener("keydown", onKey);

    els.reader.addEventListener("close", () => {
      syncUrl();
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    });
    els.lightbox.addEventListener("close", () => {
      els.lightboxImg.src = "";
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    });

    // prevent image drag ghost
    els.deck.addEventListener("dragstart", (e) => e.preventDefault());
  }

  async function init() {
    els.chips = document.getElementById("chips");
    els.search = document.getElementById("search");
    els.deck = document.getElementById("deck");
    els.prevBtn = document.getElementById("prevBtn");
    els.nextBtn = document.getElementById("nextBtn");
    els.pagerCount = document.getElementById("pagerCount");
    els.pagerThumb = document.getElementById("pagerThumb");
    els.brandSub = document.getElementById("brandSub");
    els.empty = document.getElementById("empty");
    els.clearSearch = document.getElementById("clearSearch");
    els.themeToggle = document.getElementById("themeToggle");
    els.reader = document.getElementById("reader");
    els.readerTitle = document.getElementById("readerTitle");
    els.readerKicker = document.getElementById("readerKicker");
    els.readerBody = document.getElementById("readerBody");
    els.readerFoot = document.getElementById("readerFoot");
    els.lightbox = document.getElementById("lightbox");
    els.lightboxImg = document.getElementById("lightboxImg");

    const params = new URLSearchParams(location.search);
    const themeParam = params.get("theme");
    applyTheme(themeParam === "dark" || themeParam === "light" ? themeParam : currentTheme());
    bind();

    try {
      const res = await fetch("data/cards.json");
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      state.cards = data.cards || [];
    } catch (err) {
      els.deck.innerHTML = "";
      document.body.classList.add("is-empty");
      els.empty.hidden = false;
      els.empty.querySelector(".empty-title").textContent = "没法载入收藏数据";
      els.empty.querySelector(".empty-body").textContent =
        "请用本地服务器打开本页，例如在站点目录运行 python3 -m http.server。";
      els.clearSearch.hidden = true;
      return;
    }

    const q = params.get("q");
    if (q) {
      state.query = q;
      els.search.value = q;
    }
    const cat = params.get("cat");
    if (cat && (cat === "全部" || state.cards.some((c) => (c.cat || "待分类") === cat))) {
      state.filter = cat;
    }

    const id = params.get("id");
    if (id) {
      const list = filtered();
      const i = list.findIndex((c) => c.id === id);
      if (i >= 0) state.index = i;
      else {
        const all = state.cards.findIndex((c) => c.id === id);
        if (all >= 0) {
          state.filter = "全部";
          state.index = all;
        }
      }
    }
    if (params.get("flip") === "1") state.flipped = true;

    renderChips();
    renderDeck();
    const current = currentCard();
    if (params.get("read") === "1" && current) openReader(current);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
