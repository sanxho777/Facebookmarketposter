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
    
    // Facebook Marketplace color options: Black, Blue, Brown, Gold, Green, Grey, Pink, Purple, Red, Silver, Orange, White, Yellow, Charcoal, Offwhite, Tan, Beige, Burgundy, Turquoise
    const rules = [
      // Black variations
      [/black|ebony|onyx|midnight|jet/, "Black"],
      
      // Charcoal (separate from grey/silver for dark greys)
      [/charcoal|gunmetal|dark\s*gr[ae]y/, "Charcoal"],
      
      // Grey/Silver variations  
      [/silver|platinum|metallic|slate|graphite|titanium/, "Silver"],
      [/gr[ae]y|pewter/, "Grey"],
      
      // Red variations (put before white to catch "Salsa Red Pearl")
      [/red|crimson|cherry|ruby|scarlet|cardinal|salsa/, "Red"],
      [/burgundy|maroon|wine/, "Burgundy"],
      
      // White variations (be more specific with pearl)
      [/white|ivory|alabaster|snow|cream|arctic/, "White"],
      [/\bpearl\b(?!\s*(red|blue|black))/, "White"], // Pearl by itself, not with other colors
      [/off\s*white|eggshell|vanilla/, "Offwhite"],
      
      // Blue variations
      [/blue|navy|indigo|cobalt|azure|sapphire|steel/, "Blue"],
      [/teal|turquoise|aqua|cyan/, "Turquoise"],
      
      // Brown variations
      [/brown|bronze|mocha|cocoa|coffee|chocolate|espresso|mahogany/, "Brown"],
      [/tan|sand|khaki|linen|camel/, "Tan"],
      [/beige|champagne|cashmere|bisque/, "Beige"],
      
      // Green variations
      [/green|emerald|olive|forest|sage|jade/, "Green"],
      
      // Gold variations
      [/gold|amber/, "Gold"],
      
      // Yellow variations
      [/yellow|lemon|canary|citrus/, "Yellow"],
      
      // Orange variations
      [/orange|copper|tangerine|sunset|flame/, "Orange"],
      
      // Purple variations
      [/purple|plum|violet|amethyst|lavender/, "Purple"],
      
      // Pink variations
      [/pink|rose|blush|magenta/, "Pink"]
    ];
    
    for (const [re, label] of rules) {
      if (re.test(s)) return label;
    }
    
    // If no match found, return the cleaned original
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
    // Priority 1: Use explicit fuel type from cars.com if available
    if (v.fuel && v.fuel.trim()) {
      const fuel = v.fuel.toLowerCase().trim();
      if (/gasoline|petrol|gas|regular/.test(fuel)) return "Petrol";
      if (/electric|ev/.test(fuel)) return "Electric";
      if (/hybrid/.test(fuel)) return "Hybrid";
      if (/diesel/.test(fuel)) return "Diesel";
    }
    
    // Priority 2: Fallback to engine description inference (only if no explicit fuel type)
    const e = `${v.engine||""} ${v.description||""}`.toLowerCase();
    if (/\belectric\b|\bev\b|kilowatt|kwh|battery/.test(e) && !/gasoline|petrol|regular/.test(e)) return "Electric";
    if (/hybrid|hev|plugin|plug-in|phev/.test(e)) return "Hybrid";
    if (/diesel|tdi|duramax|cummins/.test(e)) return "Diesel";
    
    // Priority 3: Default to Petrol for regular unleaded engines
    return "Petrol";
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
