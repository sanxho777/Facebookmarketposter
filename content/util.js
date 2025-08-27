// Small helpers (UMD-style – no "export" so it runs in content scripts)
window.vputil = (() => {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const txt = (n) => (n?.innerText || n?.textContent || '').trim();
  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const onlyDigits = (t) => clean(t).replace(/[^\d]/g, '');
  const asNumber = (t) => {
    const n = parseInt(onlyDigits(t ?? ''), 10);
    return Number.isFinite(n) ? n : null;
  };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const normColor = (raw) => {
    if (!raw) return null;
    const s = clean(raw).toLowerCase();
    const map = [
      [/^(jet\s*)?black|ebony|onyx|midnight\s*black/, "Black"],
      [/classic\s*silver|slate|graphite|charcoal|gunmetal|dark\s*gr[ea]y/, "Silver".toLowerCase()].map ? null : null
    ];
    // use simple table (more permissive)
    const rules = [
      [/black|ebony|onyx|midnight/, "Black"],
      [/silver|slate|graphite|gray|grey|charcoal|gunmetal/, "Silver".includes("x")? "Silver":"Silver"], // keep Silver as default for “Classic Silver Metallic”
      [/white|ivory|pearl|alabaster|snow/, "White"],
      [/blue|navy|indigo|cobalt|azure|teal|aqua/, "Blue"],
      [/red|maroon|burgundy|crimson/, "Red"],
      [/brown|bronze|mocha|cocoa|coffee|chocolate/, "Brown"],
      [/beige|tan|sand|cream|khaki|linen/, "Beige"],
      [/green|emerald|olive|forest/, "Green"],
      [/gold|champagne/, "Gold"],
      [/yellow|lemon/, "Yellow"],
      [/orange|copper|tangerine/, "Orange"],
      [/purple|plum|violet|amethyst/, "Purple"]
    ];
    for (const [re, label] of rules) if (re.test(s)) return label;
    return clean(raw).replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
  };

  const inferBodyStyle = (v) => {
    const m = `${v.make||""} ${v.model||""} ${v.trim||""}`.toLowerCase();
    if (/truck|pickup|f-?150|silverado|ram|tundra|sierra|tacoma/.test(m)) return "Truck";
    if (/van|minivan|transit|sienna|odyssey|caravan|pacifica|sprinter|promaster/.test(m)) return "Van";
    if (/coupe|mustang|challenger|camaro|brz|86|supra/.test(m)) return "Coupe";
    if (/convertible|roadster|spider|spyder|cabrio/.test(m)) return "Convertible";
    if (/hatch|golf|fit|yaris|versa|impreza hatch/.test(m)) return "Hatchback";
    if (/wagon|outback|allroad/.test(m)) return "Wagon";
    if (/suv|trailblazer|equinox|tahoe|suburban|escape|rav4|cr-?v|pilot|highlander|explorer|blazer|cx-|nx|rx|gv|x[3-7]|gl|telluride|seltos|palisade/.test(m)) return "SUV";
    return "Saloon"; // FB calls sedan "Saloon"
  };

  const inferFuel = (v) => {
    const e = `${v.engine||""} ${v.description||""}`.toLowerCase();
    if (/electric|ev|kilowatt|kwh/.test(e)) return "Electric";
    if (/hybrid|hev|plugin|plug-in|phev/.test(e)) return "Hybrid";
    if (/diesel|tdi|duramax|cummins/.test(e)) return "Diesel";
    return "Gasoline";
  };

  const inferTransmission = (v) => {
    const t = `${v.transmission||""}`.toLowerCase();
    if (/manual|mt/.test(t)) return "Manual transmission";
    if (/cvt/.test(t)) return "CVT";
    return "Automatic transmission";
  };

  const titleFromParts = (v) => clean([v.year, v.make, v.model, v.trim].filter(Boolean).join(' '));
  const defaultDesc = (v) => `${titleFromParts(v)}. ${clean(v.drivetrain||'')} ${clean(v.transmission||'')}. ${clean(v.engine||'')}. VIN ${clean(v.vin||'')}.`;

  return { $, $$, txt, clean, onlyDigits, asNumber, sleep, normColor, inferBodyStyle, inferFuel, inferTransmission, titleFromParts, defaultDesc };
})();
