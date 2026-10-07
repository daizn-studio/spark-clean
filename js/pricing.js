/* =========================================================
   PRICING ENGINE
   Component figures here are GST-EXCLUSIVE. Customer-facing totals are
   displayed GST-INCLUSIVE (Australian consumer pricing convention, and
   what Melbourne competitors advertise). Keep this file as the
   single source of truth for pricing logic — the UI (app.js)
   only reads from it, it never hardcodes numbers itself.
========================================================= */

const PRICING = {
  residential: {
    // Baseline packages include 1 kitchen + 1 living area.
    //
    // These are GST-EXCLUSIVE and are set so the GST-INCLUSIVE total the
    // customer actually pays lands on standard Melbourne vacate-clean
    // rates (checked against published 2026 Melbourne price guides):
    //
    //   1 bed:  $291 + GST = $320  (market $245-350)
    //   2 bed:  $373 + GST = $410  (market $300-450)
    //   3 bed:  $445 + GST = $490  (market $400-550)
    //   4 bed:  $591 + GST = $650  (market $550-800)
    //
    // Melbourne competitors advertise GST-INCLUSIVE fixed prices, so
    // comparing your excl-GST figure against their headline number is
    // what previously left this ~10% above market on every job.
    //
    // Re-verified live against 2026 Melbourne bond-clean pricing pages
    // (o2ocleaning.com.au, end-of-leasecleaningmelbourne.com.au) — the
    // 2-bed ($410) and 3-bed ($490) figures are exact matches to current
    // published market rates. index.html's homepage pricing table had
    // drifted from these numbers (was showing $352/$451/$605/$759) and
    // has been corrected to match this file exactly — this file is the
    // single source of truth; the marketing page must mirror it by hand
    // since it isn't rendered from here.
    // Set to the cent so the GST-inclusive price is a whole dollar
    // ($291 used to come out at $320.10 at checkout, not the advertised $320).
    basePackages: {
      1: 290.91, // Studio / 1 Bed, 1 Bath  -> $320.00 incl. GST
      2: 372.73, // 2 Bed, 1 Bath           -> $410.00 incl. GST
      3: 445.45, // 3 Bed, 2 Bath           -> $490.00 incl. GST
      4: 590.91  // 4 Bed, 2 Bath           -> $650.00 incl. GST
    },
    // Beyond the 4-bed baseline, extrapolate using the extra-bedroom modifier
    modifiers: {
      extraBedroom: 40.00,
      extraBathroom: 60.00,
      extraLiving: 45.00,
      multiStorey: 50.00,
      // Not an independently published competitor line item (most bundle a
      // second kitchen/kitchenette into an "additional room" quote rather
      // than pricing it separately) — reasoned from this file's own scale:
      // above extraBathroom ($60), reflecting that this site's own copy
      // already treats kitchens as the most labour-intensive room ("fail
      // more bond inspections than any other room").
      extraKitchen: 70.00
    },
    addons: {
      // carpetPerRoom was removed: carpet steam cleaning is no longer sold
      // as an end-of-lease add-on. It is its own service line (see `steam`
      // below), so the customer is quoted one carpet price instead of two
      // that could disagree.
      //
      // A standard oven clean (inside, racks, trays, stovetop, rangehood)
      // is INCLUDED in every base package — agents always check the oven,
      // and every Melbourne competitor includes it. This extra is only for
      // ovens with heavy baked-on grease that need a soak-and-scrape.
      heavyOven: 110.00
    }
  },
  // Carpet steam cleaning — the third service line, booked on its own
  // rather than as an add-on to a vacate or office clean.
  //
  // The $150 baseline INCLUDES the first room: a one-room job is $150, not
  // $150 + $45. Only rooms beyond the first bill at perExtraRoom, which is
  // why the field the customer fills in counts ADDITIONAL rooms.
  //
  // The baseline is deliberately NOT floored to the commercial $180
  // minimum: steam is its own service line with its own economics, and
  // the client's rate card prices it from $150.
  steam: {
    baseline: 150.00,      // covers the call-out AND the first room -> $165 incl. GST
    includedRooms: 1,
    perExtraRoom: 45.00,   // each room beyond the first
    // Optional extras offered alongside a steam clean on the residential
    // pathway. Deliberately the same figures as residential.modifiers, so
    // a kitchen costs the same whether it is cleaned on a vacate job or
    // added to a steam booking.
    addons: {
      kitchen:    70.00,   // = residential.modifiers.extraKitchen
      washroom:   60.00,   // = residential.modifiers.extraBathroom
      livingArea: 45.00    // = residential.modifiers.extraLiving
    }
  },
  commercial: {
    tiers: [
      // GRADUATED like tax brackets: each band's rate applies only to the
      // m² inside that band. The old version charged the WHOLE floor at one
      // tier's rate, so the price fell as the office grew (150 m² = $525,
      // 151 m² = $423). Rates set against 2026 Melbourne one-off office
      // pricing: ~100 m² $180-300, 100-300 m² $350-650, 300+ m² $650-1,000+.
      { max: 100, rate: 2.50 },     // first 100 m²
      { max: 300, rate: 2.00 },     // 101–300 m²
      { max: Infinity, rate: 1.50 } // 301 m² and up
    ],
    perBin: 3.00,
    perToilet: 20.00,        // per stall/cubicle — Melbourne market rate
    perDesk: 2.50,           // workstation sanitising, per desk
    kitchenFlatFee: 35.00,   // per kitchen/kitchenette
    // Same rate as the carpet steam service line — the same job can't cost
    // $45 a room booked one way and $110 booked another. (Melbourne 2026
    // market: $26-52 per room.)
    carpetPerRoom: 45.00,
    // Guardrail floor — covers travel/setup on small jobs, and is the
    // client's published "office cleans from $180 per job" figure. Raised
    // from $75 on the client's instruction: a commercial attendance now
    // never bills under $180 excl. GST ($198 incl.), no matter how small
    // the floor area or how deep the frequency discount cuts.
    //
    // This floor is COMMERCIAL ONLY. End-of-lease keeps its own baseline
    // package pricing untouched, and standalone steam prices from its own
    // $150 baseline — neither is raised to $180.
    minimumCallOut: 180.00,

    // Deep / first-time cleans take roughly twice as long as a maintenance
    // clean, which is why the market charges $5–7/m² against $2.50–4.
    // Applied as a multiplier so it scales with the tiered rate rather
    // than flattening the volume discount on large sites.
    deepCleanMultiplier: 1.75,

    // Recurring work is cheaper to service (less build-up, known site), so
    // the discount reflects real cost, not just a sales tactic.
    frequencyDiscount: {
      oneoff:      0,
      fortnightly: 0.05,
      weekly:      0.10,
      daily:       0.15
    },

    addOns: {
      multiStorey:  { label: 'Multi-storey access (stairs)', amount: 50.00 },
      fridge:       { label: 'Fridge interior deep clean',   amount: 45.00 },
      microwave:    { label: 'Microwave deep clean',         amount: 25.00 },
      glass:        { label: 'Internal glass & partitions',  amount: 75.00 },
      highDusting:  { label: 'High dusting (vents, fans)',   amount: 80.00 },
      dishwasher:   { label: 'Dishwasher deep clean',        amount: 35.00 }
    }
  },
  // Short-notice bookings cost more to staff — a job within 48 hours
  // (today, tomorrow, the day after) gets a flat surcharge; later, none.
  // It was 5 days, which caught most end-of-lease customers (they usually
  // book within a week of moving out) — Melbourne cleaners only charge
  // for same/next-day. Applied in
  // js/app.js's updatePrice() (same place as the AI photo adjustment)
  // once a preferred date is chosen, on the total including all other
  // modifiers and add-ons.
  urgent: {
    maxDays: 2,   // today, tomorrow or the day after (Melbourne norm)
    surchargePct: 0.10
  },
  // Every quoted job covers up to 3 hours on site. Past that the crew is
  // holding time that was scheduled for the next customer, so overtime is
  // billed per commenced hour.
  //
  // This is a DISCLOSED POLICY, not a priced line: how long a job actually
  // runs can't be known at checkout, so nothing here is added to the quote.
  // It is surfaced up-front (step 1 panels, top of the step 4 receipt, and
  // the homepage rate card) so an overtime charge is never a surprise, then
  // applied by management against the booking after the clean.
  jobDuration: {
    includedHours: 3,
    extraHourRate: 43.00,
    // Which tracks the cap applies to — all three service lines.
    appliesTo: ['residential', 'commercial', 'steam']
  },
  // Estimated range is presented as a band around the point estimate,
  // reflecting on-site verification risk (spec: "AI-Verified Estimated Range")
  rangeSpreadPct: 0.08,
  // GST decision: all prices/breakdowns in this codebase are GST-EXCLUSIVE
  // ($320 baseline etc. is the pre-GST figure). Australia's GST rate is
  // 10%. GST is calculated and shown as its own line at checkout, and the
  // GST-INCLUSIVE total is what actually gets charged via Stripe — see
  // calculateGst() below and js/app.js's payment step. If your business
  // isn't GST-registered (turnover under $75k/yr), set GST_RATE to 0.
  GST_RATE: 0.10
};

/* Customer-facing name for each service track, in one place. Before the
   steam track existed every consumer wrote its own
   `track === 'residential' ? 'End of Lease' : 'Office'` ternary, which
   silently relabels any third track as an office clean — the booking
   page, the confirmation screen, the booking lookup and both admin
   tables each had their own copy. They all read this now.
   `short` is for table cells, `long` for prose and receipts. */
const SERVICE_TRACK_LABELS = {
  residential: { short: 'End of Lease',  long: 'End of Lease Clean' },
  commercial:  { short: 'Office',        long: 'Office Cleaning' },
  steam:       { short: 'Carpet Steam',  long: 'Carpet Steam Clean' }
};

function serviceTrackLabel(track, form) {
  const entry = SERVICE_TRACK_LABELS[track] || SERVICE_TRACK_LABELS.residential;
  return form === 'short' ? entry.short : entry.long;
}

/**
 * Splits a GST-exclusive amount into { subtotal, gst, total } — the total
 * (GST-inclusive) is what should actually be charged to the customer.
 */
function calculateGst(exclGstAmount) {
  const gst = Math.round(exclGstAmount * PRICING.GST_RATE * 100) / 100;
  return {
    subtotal: exclGstAmount,
    gst,
    total: Math.round((exclGstAmount + gst) * 100) / 100
  };
}

/**
 * Calculate residential (end-of-lease) price.
 * @param {object} p - { bedrooms, bathrooms, kitchens, extraLiving, multiStorey, oven }
 * @returns {{ total:number, breakdown: Array<{label:string, amount:number}> }}
 */
function calculateResidentialPrice(p) {
  const cfg = PRICING.residential;
  const breakdown = [];

  // Every field below adds its own line independently — bedrooms, bathrooms,
  // kitchens, living areas and carpet rooms never wait on each other. In
  // particular: no bedroom count chosen yet no longer zeroes out whatever
  // else the customer has already set (carpet rooms, extra bathrooms, ...) —
  // it just means there's no baseline line yet, not that nothing counts.
  const bedrooms = p.bedrooms || 0;

  // Base package: use the matching baseline, or extrapolate past 4 bed
  // using the 4-bed baseline + extra-bedroom modifier per additional bedroom.
  // Skipped entirely (no line, no charge) until a bedroom count is set.
  if (bedrooms > 0) {
    let base;
    if (bedrooms <= 4) {
      base = cfg.basePackages[bedrooms];
      breakdown.push({ label: `Baseline (${bedrooms} bed)`, amount: base });
    } else {
      base = cfg.basePackages[4] + (bedrooms - 4) * cfg.modifiers.extraBedroom;
      breakdown.push({ label: `Baseline (4 bed) + ${bedrooms - 4} extra bed`, amount: base });
    }
  }

  // A bathroom/kitchen only comes "included for free" as part of a
  // baseline package — with no bedroom count set, there is no baseline,
  // so nothing is included and every bathroom/kitchen is charged in full.
  // (Baseline assumes 1 bath for 1-2 bed tiers, 2 bath for 3-4 bed tiers.)
  const impliedBaths = bedrooms <= 0 ? 0 : (bedrooms <= 2 ? 1 : 2);
  const extraBaths = Math.max(0, (p.bathrooms || 1) - impliedBaths);
  if (extraBaths > 0) {
    const amt = extraBaths * cfg.modifiers.extraBathroom;
    breakdown.push({ label: `${bedrooms <= 0 ? 'Bathroom' : 'Extra bathroom'} x${extraBaths}`, amount: amt });
  }

  const impliedKitchens = bedrooms <= 0 ? 0 : 1;
  const extraKitchens = Math.max(0, (p.kitchens || 0) - impliedKitchens);
  if (extraKitchens > 0) {
    const amt = extraKitchens * cfg.modifiers.extraKitchen;
    breakdown.push({ label: `${bedrooms <= 0 ? 'Kitchen' : 'Extra kitchen'} x${extraKitchens}`, amount: amt });
  }

  // Extra living areas
  if (p.extraLiving > 0) {
    const amt = p.extraLiving * cfg.modifiers.extraLiving;
    breakdown.push({ label: `Extra living area x${p.extraLiving}`, amount: amt });
  }

  // Multi-storey surcharge
  if (p.multiStorey) {
    breakdown.push({ label: 'Multi-storey surcharge', amount: cfg.modifiers.multiStorey });
  }

  // Add-ons. No carpet line here by design — carpet steam is its own
  // service track now, so p.carpetRooms is ignored even if passed.
  if (p.oven) {
    breakdown.push({ label: 'Heavy-duty oven clean', amount: cfg.addons.heavyOven });
  }

  const total = breakdown.reduce((sum, item) => sum + item.amount, 0);
  return { total, breakdown };
}

/**
 * Calculate commercial (office) price.
 * @param {object} p - { sqm, bins, toilets, hasKitchen }
 * @returns {{ total:number, breakdown: Array<{label:string, amount:number}>, hitFloor:boolean }}
 */
function calculateCommercialPrice(p) {
  const cfg = PRICING.commercial;
  const breakdown = [];
  const sqm = Math.max(0, p.sqm || 0);

  // Tiered rate rather than a flat per-m² figure. A flat rate quotes a
  // 2,000 m² site at roughly 40% above market, because commercial cleaning
  // has real economies of scale — a bigger floor plate is faster per m².
  const isDeep = p.cleanType === 'deep';
  const mult = isDeep ? cfg.deepCleanMultiplier : 1;
  let sqmCost = 0;
  let floor = 0;
  cfg.tiers.forEach(t => {
    const inBand = Math.max(0, Math.min(sqm, t.max) - floor);
    sqmCost += inBand * t.rate * mult;
    floor = t.max;
  });
  const avgRate = sqm > 0 ? sqmCost / sqm : 0;
  breakdown.push({
    label: `${sqm} sqm (avg $${avgRate.toFixed(2)}/sqm)${isDeep ? ' deep clean' : ''}`,
    amount: sqmCost
  });

  const deskCost = (p.desks || 0) * cfg.perDesk;
  if (deskCost > 0) breakdown.push({ label: `Workstations x${p.desks}`, amount: deskCost });

  const binCost = (p.bins || 0) * cfg.perBin;
  if (binCost > 0) breakdown.push({ label: `Bins x${p.bins}`, amount: binCost });

  const toiletCost = (p.toilets || 0) * cfg.perToilet;
  if (toiletCost > 0) breakdown.push({ label: `Toilets/cubicles x${p.toilets}`, amount: toiletCost });

  const kitchens = p.kitchens != null ? p.kitchens : (p.hasKitchen ? 1 : 0);
  const kitchenCost = kitchens * cfg.kitchenFlatFee;
  if (kitchenCost > 0) breakdown.push({ label: `Kitchen/breakroom x${kitchens}`, amount: kitchenCost });

  const carpetRooms = p.carpetRooms || 0;
  const carpetCost = carpetRooms * cfg.carpetPerRoom;
  if (carpetCost > 0) breakdown.push({ label: `Carpet steam clean x${carpetRooms}`, amount: carpetCost });

  // Optional extras
  Object.keys(cfg.addOns).forEach(key => {
    if (p.addOns && p.addOns[key]) {
      const a = cfg.addOns[key];
      breakdown.push({ label: a.label, amount: a.amount });
    }
  });

  let total = breakdown.reduce((sum, item) => sum + item.amount, 0);

  // Frequency discount applies to the whole job, including extras, since
  // recurring visits reduce the effort on every line.
  const freq = p.frequency || 'oneoff';
  const discountPct = cfg.frequencyDiscount[freq] || 0;
  if (discountPct > 0) {
    const discount = total * discountPct;
    breakdown.push({
      label: `${freq.charAt(0).toUpperCase() + freq.slice(1)} service discount (${Math.round(discountPct * 100)}%)`,
      amount: -discount
    });
    total -= discount;
  }

  // Guardrail: a small job still costs a callout and travel time.
  let hitFloor = false;
  if (total < cfg.minimumCallOut) {
    hitFloor = true;
    total = cfg.minimumCallOut;
  }

  return { total, breakdown, hitFloor };
}

/**
 * Calculate a standalone carpet steam clean.
 *
 * The $150 baseline covers the call-out AND the first room, so a one-room
 * job is $150. `extraRooms` is what the customer enters — rooms BEYOND the
 * included one — and each bills at PRICING.steam.perExtraRoom.
 *
 * The property type (end-of-lease vs office) does NOT change the room
 * rate. It only decides which extras are on offer: the residential
 * pathway gets the kitchen/washroom/living-area add-ons priced here, the
 * office pathway gets a full office clean via calculateCombinedPrice.
 *
 * @param {object} p - { extraRooms, propertyType, addons:{kitchens,washrooms,livingAreas} }
 * @returns {{ total:number, breakdown:Array<{label:string,amount:number}>, totalRooms:number }}
 */
function calculateSteamPrice(p) {
  const cfg = PRICING.steam;
  const breakdown = [];
  // The service always covers at least the included room, so the baseline
  // applies the moment this track is chosen. extraRooms is what the
  // customer actually enters; total rooms is that plus the included one.
  const extraRooms = Math.max(0, p.extraRooms || 0);
  const totalRooms = cfg.includedRooms + extraRooms;

  breakdown.push({
    label: `Carpet steam clean (includes ${cfg.includedRooms} room)`,
    amount: cfg.baseline
  });

  if (extraRooms > 0) {
    breakdown.push({
      label: `Additional rooms x${extraRooms}`,
      amount: extraRooms * cfg.perExtraRoom
    });
  }

  // Residential-pathway extras. Each is independent — none of them gate
  // on another being set.
  const a = p.addons || {};
  [['kitchen',    a.kitchens,    'Kitchen'],
   ['washroom',   a.washrooms,   'Washroom'],
   ['livingArea', a.livingAreas, 'Living area']
  ].forEach(([key, count, label]) => {
    const n = Math.max(0, count || 0);
    if (n > 0) breakdown.push({ label: `${label} x${n}`, amount: n * cfg.addons[key] });
  });

  const total = breakdown.reduce((sum, item) => sum + item.amount, 0);
  return { total, breakdown, totalRooms };
}

/**
 * A steam job booked together with a full clean of the same property.
 *
 * Office pathway only. The two halves are priced by their own existing
 * functions and then summed, so neither can drift from what it costs on
 * its own — the office half still gets its $180 minimum.
 *
 * Carpet is deliberately NOT passed through to the office calculation:
 * the steam half already prices the carpet, and calculateCommercialPrice
 * has a $110/room carpet line of its own that would bill it a second time.
 *
 * @param {object} p - { extraRooms, addons, sub }
 */
function calculateCombinedPrice(p) {
  const steam = calculateSteamPrice(p);

  // Only the office pathway offers a full second clean. The residential
  // pathway covers its extras through PRICING.steam.addons instead, which
  // calculateSteamPrice has already priced above.
  const subInputs = Object.assign({}, p.sub, { carpetRooms: 0 });
  const sub = calculateCommercialPrice(subInputs);

  const breakdown = steam.breakdown
    .concat(sub.breakdown)
    .filter(item => item.amount !== 0);

  // A commercial half that fell to its minimum reports hitFloor, and the
  // caller renders a "minimum applied" row from it — pass it through so
  // the receipt explains the number rather than appearing to invent it.
  return {
    total: steam.total + sub.total,
    breakdown,
    hitFloor: !!sub.hitFloor,
    steamTotal: steam.total,
    subTotal: sub.total
  };
}

/**
 * One-line overtime policy sentence, built from PRICING.jobDuration so the
 * numbers can never drift between the booking panels, the step 4 receipt
 * and the homepage. Returns '' for a track the cap doesn't cover.
 */
function jobDurationPolicyText(serviceTrack) {
  const cfg = PRICING.jobDuration;
  if (serviceTrack && !cfg.appliesTo.includes(serviceTrack)) return '';
  return `Each job covers up to ${cfg.includedHours} hours on site. `
       + `If the clean runs beyond that, overtime is charged at `
       + `$${cfg.extraHourRate.toFixed(2)} for each additional hour.`;
}

/**
 * Wraps a point estimate into a presentable "AI-Verified Estimated Range".
 */
function toEstimatedRange(total) {
  const spread = total * PRICING.rangeSpreadPct;
  return {
    low: Math.round(total - spread),
    high: Math.round(total + spread)
  };
}
