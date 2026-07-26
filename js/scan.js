/* ===== Tijdsindeling scan =====
   Alle teksten komen uit het translations-object in script.js, zodat de
   NL/EN toggle ook voor deze pagina werkt. Bij een taalwissel vuurt
   script.js het event "salovela:langchange" af en hertekenen we hier.

   Intern rekenen we altijd in uren per week. De dag/week-schakelaar is
   puur een weergavekeuze: bij "per dag" delen we door 5 werkdagen. */

(function () {
  const sectorsEl = document.getElementById("scan-sectors");
  if (!sectorsEl) return;

  const tasksEl = document.getElementById("scan-tasks");
  const unitEl = document.getElementById("scan-unit");
  const rateEl = document.getElementById("scan-rate");
  const step2El = document.getElementById("scan-step2");
  const step3El = document.getElementById("scan-step3");
  const adviceEl = document.getElementById("scan-advice");
  const badgeEl = document.getElementById("scan-badge");
  const emptyEl = document.getElementById("scan-empty");
  const reportEl = document.getElementById("scan-report");
  const factsTotalEl = document.getElementById("scan-facts-total");
  const breakdownEl = document.getElementById("scan-breakdown");
  const progFill = document.getElementById("scan-progress-fill");
  const progText = document.getElementById("scan-progress-text");
  const recHoursEl = document.getElementById("scan-rec-hours");
  const recUnitEl = document.getElementById("scan-rec-unit");
  const recMoneyEl = document.getElementById("scan-rec-money");

  /* --- Taken -----------------------------------------------------------
     auto  = welk deel van dit werk AI vandaag realistisch kan ondersteunen
             (onze eigen inschatting, bewust voorzichtig en nooit 1.0)
     quick = haalbaar in weken (true) of eerder een project (false)      */
  const TASKS = [
    { id: "email",    auto: 0.55, quick: true,
      icon: '<path d="M3 6.5h18v11H3z"/><path d="M3 7l9 6 9-6"/>' },
    { id: "orders",   auto: 0.65, quick: true,
      icon: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>' },
    { id: "invoice",  auto: 0.70, quick: true,
      icon: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>' },
    { id: "stock",    auto: 0.35, quick: false,
      icon: '<path d="M4 8l8-4 8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4"/><path d="M4 16l8 4 8-4"/>' },
    { id: "planning", auto: 0.25, quick: false,
      icon: '<path d="M4 5h16v16H4z"/><path d="M4 10h16M9 3v4M15 3v4"/>' },
    { id: "report",   auto: 0.60, quick: true,
      icon: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>' }
  ];

  /* --- Sectoren: richtcijfers uit de praktijk, uren per week ----------- */
  const SECTORS = [
    { id: "distributie", hours: { email: 8, orders: 6, invoice: 3, stock: 4, planning: 3, report: 2 } },
    { id: "bouw",        hours: { email: 5, orders: 3, invoice: 4, stock: 2, planning: 6, report: 2 } },
    { id: "productie",   hours: { email: 4, orders: 4, invoice: 3, stock: 5, planning: 5, report: 3 } },
    { id: "service",     hours: { email: 6, orders: 3, invoice: 3, stock: 3, planning: 6, report: 2 } },
    { id: "diensten",    hours: { email: 7, orders: 2, invoice: 3, stock: 1, planning: 4, report: 4 } },
    { id: "andere",      hours: { email: 6, orders: 3, invoice: 3, stock: 2, planning: 4, report: 3 } }
  ];

  const WEEKS_PER_MONTH = 4.33;
  const DAYS_PER_WEEK = 5;

  /* Sliderbereik per eenheid. Beide komen neer op maximaal 20 u/week,
     zodat wisselen van eenheid nooit een ingevulde waarde afkapt. */
  const UNITS = {
    week: { max: 20, step: 0.5,  factor: 1,             labelKey: "scan.hours.perweek" },
    dag:  { max: 4,  step: 0.25, factor: DAYS_PER_WEEK, labelKey: "scan.hours.perday" }
  };

  let sector = null;
  let unit = "week";
  let hours = {};
  let touched = {};
  let moneyShown = 0;

  function lang() {
    return document.documentElement.lang === "en" ? "en" : "nl";
  }

  function t(key) {
    // "translations" is een top-level const in script.js: zichtbaar hier,
    // maar niet als window-property. Daarom via typeof.
    if (typeof translations === "undefined") return key;
    const dict = translations[lang()];
    return (dict && dict[key]) || key;
  }

  /* Vult {tokens} in een vertaalde zin in, zodat cijfers in lopende tekst
     staan in plaats van als losse labels naast elkaar. */
  function fill(key, vars) {
    return t(key).replace(/\{(\w+)\}/g, function (match, name) {
      return Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match;
    });
  }

  function euro(value) {
    return "€ " + Math.round(value).toLocaleString(locale());
  }

  function locale() {
    return lang() === "en" ? "en-GB" : "nl-BE";
  }

  /* Getallen in de juiste notatie: 4,4 in het Nederlands, 4.4 in het Engels. */
  function num(value, decimals) {
    return value.toLocaleString(locale(), { maximumFractionDigits: decimals });
  }

  function round1(value) {
    return num(value, 1);
  }

  function round2(value) {
    return num(value, 2);
  }

  /* Uren per week -> weergave in de gekozen eenheid. */
  function toDisplay(weekHours) {
    return weekHours / UNITS[unit].factor;
  }

  function displayHours(weekHours) {
    const shown = toDisplay(weekHours);
    return (unit === "dag" ? round2(shown) : round1(shown)) + " " + t(UNITS[unit].labelKey);
  }

  /* --- Opbouw ---------------------------------------------------------- */

  function buildSectors() {
    sectorsEl.innerHTML = "";
    SECTORS.forEach(function (s) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "scan-sector" + (sector === s.id ? " active" : "");
      btn.setAttribute("aria-pressed", sector === s.id ? "true" : "false");
      btn.innerHTML =
        '<span class="scan-sector-name">' + t("scan.sector." + s.id) + "</span>" +
        '<span class="scan-sector-hint">' + t("scan.sector." + s.id + ".hint") + "</span>";
      btn.addEventListener("click", function () {
        pickSector(s.id);
      });
      sectorsEl.appendChild(btn);
    });
  }

  function buildTasks() {
    tasksEl.innerHTML = "";
    TASKS.forEach(function (task) {
      const row = document.createElement("div");
      row.className = "scan-task";
      row.id = "task-" + task.id;
      row.innerHTML =
        '<div class="scan-task-head">' +
          '<span class="scan-task-icon" aria-hidden="true"><svg viewBox="0 0 24 24">' + task.icon + "</svg></span>" +
          '<span class="scan-task-text">' +
            '<span class="scan-task-name">' + t("scan.task." + task.id) + "</span>" +
            '<span class="scan-task-hint">' + t("scan.task." + task.id + ".hint") + "</span>" +
          "</span>" +
          '<span class="scan-task-value" id="val-' + task.id + '"></span>' +
        "</div>" +
        '<input type="range" class="scan-slider" id="slider-' + task.id + '" min="0" ' +
          'max="' + UNITS[unit].max + '" step="' + UNITS[unit].step + '" value="0" ' +
          'aria-label="' + t("scan.task." + task.id) + '">';
      tasksEl.appendChild(row);

      row.querySelector("input").addEventListener("input", function (event) {
        hours[task.id] = parseFloat(event.target.value) * UNITS[unit].factor;
        touched[task.id] = true;
        if (!countedAdjust) {
          countedAdjust = true;
          countEvent("scan-aangepast");
        }
        render();
      });
    });
  }

  function buildUnitToggle() {
    unitEl.querySelectorAll(".scan-unit-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.unit === unit);
      btn.setAttribute("aria-pressed", btn.dataset.unit === unit ? "true" : "false");
      btn.addEventListener("click", function () {
        if (unit === btn.dataset.unit) return;
        unit = btn.dataset.unit;
        unitEl.querySelectorAll(".scan-unit-btn").forEach(function (b) {
          const on = b.dataset.unit === unit;
          b.classList.toggle("active", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
        syncSliders();
        render();
      });
    });
  }

  function pickSector(id) {
    if (sector !== id) countEvent("scan-sector-" + id);
    sector = id;
    const preset = SECTORS.find(function (s) { return s.id === id; }).hours;
    hours = Object.assign({}, preset);
    touched = {};
    step2El.classList.remove("scan-locked");
    step3El.classList.remove("scan-locked");
    buildSectors();
    syncSliders();
    render();
    step2El.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* Zet elke slider op het juiste bereik en de juiste waarde voor de
     huidige eenheid. Wordt ook gebruikt na een wissel dag <-> week. */
  function syncSliders() {
    TASKS.forEach(function (task) {
      const slider = document.getElementById("slider-" + task.id);
      if (!slider) return;
      slider.max = UNITS[unit].max;
      slider.step = UNITS[unit].step;
      slider.value = toDisplay(hours[task.id] || 0);
    });
  }

  /* --- Rekenen en tekenen ---------------------------------------------- */

  function render() {
    let totalHours = 0;
    let recHours = 0;

    TASKS.forEach(function (task) {
      const h = hours[task.id] || 0;
      totalHours += h;
      recHours += h * task.auto;

      const row = document.getElementById("task-" + task.id);
      const val = document.getElementById("val-" + task.id);
      if (row) row.classList.toggle("on", h > 0);
      if (val) val.textContent = displayHours(h);
    });

    const adjusted = Object.keys(touched).length;
    progFill.style.width = (adjusted / TASKS.length) * 100 + "%";
    progText.textContent = adjusted + " / " + TASKS.length + " " + t("scan.progress.adjusted");

    const hasData = Boolean(sector) && totalHours > 0;
    emptyEl.hidden = hasData;
    reportEl.hidden = !hasData;

    renderBadge(recHours);

    if (!hasData) {
      adviceEl.innerHTML = "";
      return;
    }

    factsTotalEl.innerHTML = fill("scan.facts.total", { total: displayHours(totalHours) });

    renderBreakdown();

    const rate = parseFloat(rateEl.value) || 0;
    const recShown = toDisplay(recHours);
    recHoursEl.textContent = unit === "dag" ? round2(recShown) : round1(recShown);
    recUnitEl.textContent = t(unit === "dag" ? "scan.estimate.perday" : "scan.estimate.perweek");
    animateMoney(recHours * WEEKS_PER_MONTH * 12 * rate);

    renderAdvice(totalHours);
  }

  /* De berekening staat open en bloot: jouw invoer, ons percentage,
     en wat daaruit volgt. Niets verstopt achter een eindcijfer. */
  function renderBreakdown() {
    breakdownEl.innerHTML =
      '<div class="scan-bd-row head">' +
        "<span>" + t("scan.method.col.task") + "</span>" +
        '<span class="scan-bd-input">' + t("scan.method.col.input") + "</span>" +
        "<span>" + t("scan.method.col.share") + "</span>" +
        "<span>" + t("scan.method.col.result") + "</span>" +
      "</div>";

    TASKS.forEach(function (task) {
      const h = hours[task.id] || 0;
      if (h <= 0) return;
      const row = document.createElement("div");
      row.className = "scan-bd-row";
      row.innerHTML =
        '<span class="scan-bd-task">' + t("scan.task." + task.id) + "</span>" +
        '<span class="scan-bd-input">' + displayHours(h) + "</span>" +
        '<span class="scan-bd-share">' + Math.round(task.auto * 100) + "%</span>" +
        '<span class="scan-bd-result">' + displayHours(h * task.auto) + "</span>";
      breakdownEl.appendChild(row);
    });
  }

  function renderBadge(recHours) {
    let key = "scan.badge.none";
    let level = 1;
    if (recHours > 0 && recHours < 2) { key = "scan.badge.low"; }
    else if (recHours >= 2 && recHours < 5) { key = "scan.badge.mid"; level = 2; }
    else if (recHours >= 5 && recHours < 10) { key = "scan.badge.high"; level = 3; }
    else if (recHours >= 10) { key = "scan.badge.top"; level = 4; }

    badgeEl.textContent = t(key);
    badgeEl.className = "scan-badge" + (level > 1 ? " level-" + level : "");
  }

  function renderAdvice(totalHours) {
    adviceEl.innerHTML = "";
    if (!sector || totalHours <= 0) return;

    /* Volgorde = uren x ondersteunbaarheid. Snel haalbaar weegt licht mee,
       zodat we niemand richting een maandenlang project duwen. */
    const ranked = TASKS
      .filter(function (task) { return (hours[task.id] || 0) > 0; })
      .map(function (task) {
        const h = hours[task.id] || 0;
        return { task: task, gain: h * task.auto, score: h * task.auto * (task.quick ? 1.15 : 1) };
      })
      .sort(function (a, b) { return b.score - a.score; });

    if (!ranked.length) return;

    const rate = parseFloat(rateEl.value) || 0;

    adviceEl.appendChild(adviceCard(ranked[0], "scan.begin.label", rate));

    /* Een tweede piste tonen we pas als er genoeg op tafel ligt. */
    if (ranked.length > 1 && totalHours >= 8) {
      adviceEl.appendChild(adviceCard(ranked[1], "scan.next.label", rate));
    }

    /* Eerlijkheidskaart: waar we zelf terughoudend zouden zijn. */
    const weakest = ranked
      .slice()
      .sort(function (a, b) { return a.task.auto - b.task.auto; })[0];

    if (weakest && weakest.task.auto <= 0.35 && weakest.task.id !== ranked[0].task.id) {
      const card = document.createElement("div");
      card.className = "scan-card muted";
      card.innerHTML =
        '<span class="scan-card-label">' + t("scan.honest.label") + "</span>" +
        "<h3>" + t("scan.task." + weakest.task.id) + "</h3>" +
        "<p>" + t("scan.honest.intro") + " " + t("scan.task." + weakest.task.id + ".why") + "</p>";
      adviceEl.appendChild(card);
    }
  }

  function adviceCard(entry, labelKey, rate) {
    const task = entry.task;
    const yearly = entry.gain * WEEKS_PER_MONTH * 12 * rate;
    const card = document.createElement("div");
    card.className = "scan-card";
    card.innerHTML =
      '<span class="scan-card-label">' + t(labelKey) + "</span>" +
      "<h3>" + t("scan.task." + task.id) + "</h3>" +
      "<p>" + t("scan.task." + task.id + ".step") + "</p>" +
      "<p>" + t("scan.task." + task.id + ".why") + "</p>" +
      '<p class="scan-card-estimate">' + fill("scan.begin.gain", {
        hours: displayHours(entry.gain),
        rate: euro(rate),
        money: euro(yearly)
      }) + "</p>" +
      '<div class="scan-meta">' +
        '<span class="scan-pill">' + t(task.quick ? "scan.begin.effort.quick" : "scan.begin.effort.project") + "</span>" +
      "</div>";
    return card;
  }

  function animateMoney(target) {
    const start = moneyShown;
    const delta = target - start;
    if (Math.abs(delta) < 1) {
      moneyShown = target;
      recMoneyEl.textContent = euro(target);
      return;
    }
    const t0 = performance.now();
    function step(now) {
      const p = Math.min((now - t0) / 450, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      moneyShown = start + delta * eased;
      recMoneyEl.textContent = euro(moneyShown);
      if (p < 1) requestAnimationFrame(step);
      else moneyShown = target;
    }
    requestAnimationFrame(step);
  }

  /* --- Anonieme telling -------------------------------------------------
     Losse tellers via de GoatCounter die al op elke pagina staat. We tellen
     alleen keuzes in brede categorieën: nooit een individuele scan, nooit
     iets dat naar een persoon te herleiden is. */

  function countEvent(path) {
    if (window.goatcounter && typeof window.goatcounter.count === "function") {
      window.goatcounter.count({ path: path, title: "Tijdscan", event: true });
    }
  }

  /* Uitkomst in brede banden, zodat er geen exacte waarde wordt geteld. */
  function band(recHours) {
    if (recHours < 5) return "0-5u";
    if (recHours < 10) return "5-10u";
    if (recHours < 20) return "10-20u";
    return "20u-plus";
  }

  let countedAdjust = false;

  /* --- Overdracht naar het contactformulier -----------------------------
     We geven gestructureerde data door, geen kant-en-klare lopende tekst.
     De contactpagina maakt daar een visueel overzicht van en laat het
     berichtveld vrij voor de bezoeker zelf. sessionStorage blijft in de
     browser en verdwijnt zodra het tabblad sluit. */

  function buildHandover() {
    let totalHours = 0;
    let recHours = 0;
    const rows = [];

    TASKS.forEach(function (task) {
      const h = hours[task.id] || 0;
      if (h <= 0) return;
      totalHours += h;
      recHours += h * task.auto;
      rows.push({ id: task.id, hours: h, auto: task.auto });
    });

    if (!sector || totalHours <= 0) return null;

    const top = TASKS
      .filter(function (task) { return (hours[task.id] || 0) > 0; })
      .map(function (task) {
        const h = hours[task.id] || 0;
        return { id: task.id, score: h * task.auto * (task.quick ? 1.15 : 1) };
      })
      .sort(function (a, b) { return b.score - a.score; })[0];

    return {
      sector: sector,
      unit: unit,
      rate: parseFloat(rateEl.value) || 0,
      tasks: rows,
      totalHours: totalHours,
      recHours: recHours,
      topTask: top.id
    };
  }

  const ctaEl = document.getElementById("scan-cta");
  if (ctaEl) {
    ctaEl.addEventListener("click", function () {
      const payload = buildHandover();
      if (payload) countEvent("scan-voltooid-" + band(payload.recHours));

      try {
        if (payload) sessionStorage.setItem("salovela-scan", JSON.stringify(payload));
        else sessionStorage.removeItem("salovela-scan");
      } catch (err) {
        /* Privacymodus kan sessionStorage blokkeren: dan gewoon doorlinken. */
      }
    });
  }

  /* --- Start ----------------------------------------------------------- */

  rateEl.addEventListener("input", render);

  document.addEventListener("salovela:langchange", function () {
    buildSectors();
    buildTasks();
    syncSliders();
    render();
  });

  buildUnitToggle();
  buildSectors();
  buildTasks();
  render();
})();
