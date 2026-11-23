/* Krispino Creator Club — Client Application (Influencer Hub, Admin Console & Onboarding) */
(function () {
  "use strict";

  const FLAVOURS = [
    { id: "wasa-boom", name: "Wasa-Boom", pair: "Kanthari chilli × wasabi", base: "Tapioca", heat: "Hot" },
    { id: "guntur-jerk", name: "Guntur Jerk", pair: "Guntur chilli × Jamaican jerk", base: "Potato", heat: "Extra Hot" },
    { id: "chilli-ciao", name: "Chilli Ciao", pair: "Indian mirchi × Italian garlic & olive oil", base: "Potato", heat: "Medium" },
    { id: "peri-peri-pataka", name: "Peri Peri Pataka", pair: "Nimbu-jeera × peri-peri", base: "Banana", heat: "Hot" },
    { id: "masala-fiesta", name: "Masala Fiesta", pair: "Chatpata masala × Spanish smoked paprika", base: "Potato", heat: "Medium" },
    { id: "sour-cream-jalwa", name: "Sour Cream Jalwa", pair: "Jeera raita × American ranch", base: "Potato", heat: "Mild" },
    { id: "salsa-masti", name: "Salsa Masti", pair: "Tomato chutney × Mexican salsa", base: "Tapioca", heat: "Medium" },
    { id: "pepper-bonjour", name: "Pepper Bonjour", pair: "Black pepper × French herbs", base: "Banana", heat: "Mild" },
    { id: "og-salt", name: "OG Salt", pair: "The classic, lightly salted", base: "Banana", heat: "Mild" },
  ];

  const STATUSES = ["New", "Shortlisted", "Box sent", "Draft received", "Draft approved", "Posted", "Not a fit"];

  const TIER_INFO = {
    Taster: {
      spec: "1 Reel + 2 Stories",
      perks: ["Free 9-pack Krispino flavour box", "Personal 15% audience discount code", "Reshare of best content on @krispino stories"],
    },
    Explorer: {
      spec: "1–2 Reels + 3 Stories",
      perks: ["Full 9-flavour creator box", "Fixed collaboration fee per campaign", "15% audience code + order volume bonus", "Paid Meta boost on top-performing Reel"],
    },
    Ambassador: {
      spec: "Custom Multi-Reel Campaign",
      perks: ["Priority custom campaign retainer", "Early access to unreleased fusion flavours", "20% VIP audience code + revenue share", "Dedicated paid amplification & Whitelisting"],
    },
  };

  // =========================================================================
  // 1. Modern Web Guidance: Form Validation After Interaction & Dialog Fallbacks
  // =========================================================================
  const UserInvalidFallback = (() => {
    const dirtyState = new WeakMap();
    const updateState = (input) => {
      if (!input.checkValidity) return;
      const isValid = input.checkValidity();
      input.classList.toggle("user-invalid-fallback", !isValid);
      input.classList.toggle("user-valid-fallback", isValid);
      if (!isValid) {
        input.setAttribute("aria-invalid", "true");
      } else {
        input.removeAttribute("aria-invalid");
      }
    };
    const handleEvent = (event) => {
      const input = event.target;
      if (event.type === "reset") {
        const controls = input.elements || [];
        for (const control of controls) {
          dirtyState.delete(control);
          control.classList.remove("user-invalid-fallback", "user-valid-fallback");
          control.removeAttribute("aria-invalid");
        }
        return;
      }
      if (!input || !input.checkValidity) return;
      if (event.type === "input" || event.type === "change") {
        const state = dirtyState.get(input) || { hasInteracted: false, hasBlurred: false };
        state.hasInteracted = true;
        dirtyState.set(input, state);
        if (state.hasBlurred) updateState(input);
      } else if (event.type === "blur") {
        const state = dirtyState.get(input) || { hasInteracted: false, hasBlurred: false };
        state.hasBlurred = true;
        dirtyState.set(input, state);
        if (state.hasInteracted) updateState(input);
      }
    };
    const init = (root = document) => {
      if (!CSS.supports("selector(:user-invalid)")) {
        root.addEventListener("blur", handleEvent, true);
        root.addEventListener("input", handleEvent);
        root.addEventListener("change", handleEvent);
        root.addEventListener("reset", handleEvent, true);
      }
      // Keep aria-invalid in sync with native :user-invalid
      const syncAria = (el) => {
        if (!el || !el.matches) return;
        try {
          if (el.matches(":user-invalid")) {
            el.setAttribute("aria-invalid", "true");
          } else if (el.hasAttribute("aria-invalid")) {
            el.setAttribute("aria-invalid", "false");
          }
        } catch (_) { }
      };
      root.addEventListener("blur", (e) => syncAria(e.target), true);
      root.addEventListener("input", (e) => {
        if (e.target && e.target.hasAttribute && e.target.hasAttribute("aria-invalid")) {
          syncAria(e.target);
        }
      });
    };
    return { init };
  })();

  UserInvalidFallback.init(document);

  // Light-dismiss fallback for <dialog closedby="any"> & returnValue reset
  function setupDialogs() {
    const dialogs = document.querySelectorAll("dialog");
    dialogs.forEach((dlg) => {
      dlg.addEventListener("close", () => {
        dlg.returnValue = "";
      });
    });

    if (!("closedBy" in HTMLDialogElement.prototype)) {
      const outside = (e, dialog) => {
        const r = dialog.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      for (const dialog of document.querySelectorAll('dialog[closedby="any"]')) {
        let pressedOutside = false;
        dialog.addEventListener("pointerdown", (e) => {
          pressedOutside = outside(e, dialog);
        });
        dialog.addEventListener("pointerup", (e) => {
          if (pressedOutside && outside(e, dialog)) dialog.close();
        });
      }
    }
  }
  setupDialogs();

  // =========================================================================
  // 2. Dual-Mode Data Layer (Python SQLite Backend + Offline Local Fallback)
  // =========================================================================
  const TOKEN_KEY = "krispino_session_token";
  const LOCAL_DB_KEY = "krispino_offline_db_v1";

  function getDefaultSeedCreators() {
    const now = Date.now();
    return [
      {
        id: 1,
        name: "Ananya Rao",
        handle: "@ananyaeats",
        email: "ananya@example.com",
        phone: "+91 98450 11223",
        city: "Bengaluru",
        pincode: "560034",
        address: "42, 4th Cross, Koramangala 3rd Block, Bengaluru",
        followers: "10K – 50K",
        views: "24,500",
        niche: ["Food & reviews", "Lifestyle"],
        other_platforms: "youtube.com/@ananyaeatsblr",
        idea: "Blind taste test with my flatmates: guessing both the Indian spice and the international pairing in 30 seconds!",
        preferred_flavours: ["Guntur Jerk", "Wasa-Boom", "Peri Peri Pataka"],
        tier: "Explorer",
        status: "Box sent",
        discount_code: "ANANYA15",
        code_uses: 7,
        collab_fee: 8500,
        payout_status: "Pending",
        box_tracking: "BD-BLR-882941",
        box_carrier: "BlueDart Express",
        draft_url: "",
        draft_caption: "",
        draft_submitted_at: 0,
        draft_feedback: "Your flavour box is out for delivery! Remember to film the unboxing & first bite in natural daylight.",
        live_post_url: "",
        live_story_url: "",
        live_views: 0,
        posted_at: 0,
        admin_notes: "High engagement in Bengaluru foodie community.",
        created_at: now - 5 * 86400000,
      },
      {
        id: 2,
        name: "Rohan Deshmukh",
        handle: "@rohanlaughs",
        email: "rohan@example.com",
        phone: "+91 98201 44556",
        city: "Mumbai",
        pincode: "400050",
        address: "702, Sea Breeze Apts, Chapel Road, Bandra West, Mumbai",
        followers: "100K – 500K",
        views: "185,000",
        niche: ["Comedy & skits", "Food & reviews"],
        other_platforms: "youtube.com/@rohanlaughs",
        idea: "When Indian parents try 'Guntur chilli × Jamaican jerk' vs 'Black pepper × French herbs' during IPL match night.",
        preferred_flavours: ["Guntur Jerk", "Pepper Bonjour", "Masala Fiesta"],
        tier: "Ambassador",
        status: "Draft received",
        discount_code: "ROHAN20",
        code_uses: 14,
        collab_fee: 35000,
        payout_status: "Pending",
        box_tracking: "BD-MUM-774120",
        box_carrier: "BlueDart Express",
        draft_url: "https://drive.google.com/file/d/krispino-rohan-draft-v1/view",
        draft_caption: "#ad When Dad discovers Guntur Chilli went on a vacation to Jamaica! Trying the new @krispino fusion range! Use code ROHAN20 for 20% off.",
        draft_submitted_at: now - 86400000,
        draft_feedback: "Under review by brand team — checking ASCI tag placement in first 3 seconds.",
        live_post_url: "",
        live_story_url: "",
        live_views: 0,
        posted_at: 0,
        admin_notes: "Anchor Ambassador for December launch week.",
        created_at: now - 8 * 86400000,
      },
      {
        id: 3,
        name: "Meera Nair",
        handle: "@meeracooks",
        email: "meera@example.com",
        phone: "+91 94470 77889",
        city: "Kochi",
        pincode: "682001",
        address: "18, Princess Street, Fort Kochi",
        followers: "50K – 100K",
        views: "62,000",
        niche: ["Food & reviews", "Travel"],
        other_platforms: "youtube.com/@meeracookskerala",
        idea: "Kanthari chilli meets Japanese wasabi?! Testing Wasa-Boom on banana & tapioca chips with evening sulaimani chai.",
        preferred_flavours: ["Wasa-Boom", "OG Salt", "Salsa Masti"],
        tier: "Explorer",
        status: "Posted",
        discount_code: "MEERA15",
        code_uses: 42,
        collab_fee: 14000,
        payout_status: "Paid",
        box_tracking: "DLV-KOC-551920",
        box_carrier: "Delhivery",
        draft_url: "https://drive.google.com/file/d/krispino-meera-final/view",
        draft_caption: "#collab Kanthari chilli × Wasabi on crispy tapioca chips?! @krispino nailed the crunch. Grab yours with code MEERA15!",
        draft_submitted_at: now - 6 * 86400000,
        draft_feedback: "Approved! Love the close-up crunch audio and clear pack shot.",
        live_post_url: "https://instagram.com/reel/C9KrispinoMeera",
        live_story_url: "https://instagram.com/stories/meeracooks/3019283",
        live_views: 78400,
        posted_at: now - 3 * 86400000,
        admin_notes: "Top performing Reel so far. Boosted with ₹5k ad spend.",
        created_at: now - 12 * 86400000,
      },
      {
        id: 4,
        name: "Vikramaditya Singh",
        handle: "@vikramgaming",
        email: "vikram@example.com",
        phone: "+91 90001 33445",
        city: "Hyderabad",
        pincode: "500033",
        address: "Plot 88, Road No 36, Jubilee Hills, Hyderabad",
        followers: "50K – 100K",
        views: "45,000",
        niche: ["Sports & gaming", "Comedy & skits"],
        other_platforms: "youtube.com/@vikramplayslive",
        idea: "1 spicy Wasa-Boom chip for every round my squad loses in Valorant late-night stream.",
        preferred_flavours: ["Wasa-Boom", "Guntur Jerk", "Sour Cream Jalwa"],
        tier: "Explorer",
        status: "Draft approved",
        discount_code: "VIKRAM15",
        code_uses: 9,
        collab_fee: 11000,
        payout_status: "Approved",
        box_tracking: "BD-HYD-663011",
        box_carrier: "BlueDart Express",
        draft_url: "https://drive.google.com/file/d/krispino-vikram-cut2/view",
        draft_caption: "#ad Every Valorant loss = 1 Guntur Jerk chip from @krispino! Use code VIKRAM15.",
        draft_submitted_at: now - 2 * 86400000,
        draft_feedback: "Draft approved! You are clear to post this Friday at 7 PM IST.",
        live_post_url: "",
        live_story_url: "",
        live_views: 0,
        posted_at: 0,
        admin_notes: "Great energy for gaming demographic.",
        created_at: now - 9 * 86400000,
      },
      {
        id: 5,
        name: "Kabir Sharma",
        handle: "@kabirvlogs",
        email: "kabir@example.com",
        phone: "+91 98111 22334",
        city: "New Delhi",
        pincode: "110016",
        address: "C-14, Hauz Khas Enclave, New Delhi",
        followers: "1K – 10K",
        views: "6,800",
        niche: ["Student life", "Food & reviews"],
        other_platforms: "",
        idea: "Hostel 2 AM exam study break: ranking all 9 Krispino flavours with my wingmates.",
        preferred_flavours: ["Peri Peri Pataka", "Chilli Ciao", "Sour Cream Jalwa"],
        tier: "Taster",
        status: "Shortlisted",
        discount_code: "KABIR15",
        code_uses: 2,
        collab_fee: 0,
        payout_status: "Barter Box",
        box_tracking: "",
        box_carrier: "Delhivery",
        draft_url: "",
        draft_caption: "",
        draft_submitted_at: 0,
        draft_feedback: "Welcome to the Creator Club! Confirm your hostel delivery address so we can dispatch your box.",
        live_post_url: "",
        live_story_url: "",
        live_views: 0,
        posted_at: 0,
        admin_notes: "Strong campus micro-creator in Delhi University circuit.",
        created_at: now - 3 * 86400000,
      },
      {
        id: 6,
        name: "Priya Patel",
        handle: "@priyalifestyle",
        email: "priya@example.com",
        phone: "+91 98980 55667",
        city: "Ahmedabad",
        pincode: "380015",
        address: "B-401, Shivalik Plaza, Satellite, Ahmedabad",
        followers: "10K – 50K",
        views: "19,200",
        niche: ["Lifestyle", "Family & parenting"],
        other_platforms: "",
        idea: "Packing a road-trip snack basket to Udaipur featuring Sour Cream Jalwa & Salsa Masti.",
        preferred_flavours: ["Sour Cream Jalwa", "Salsa Masti", "Masala Fiesta"],
        tier: "Explorer",
        status: "New",
        discount_code: "PRIYA15",
        code_uses: 0,
        collab_fee: 6000,
        payout_status: "Pending",
        box_tracking: "",
        box_carrier: "BlueDart Express",
        draft_url: "",
        draft_caption: "",
        draft_submitted_at: 0,
        draft_feedback: "",
        live_post_url: "",
        live_story_url: "",
        live_views: 0,
        posted_at: 0,
        admin_notes: "",
        created_at: now - 1 * 86400000,
      },
    ];
  }

  function getLocalStore() {
    try {
      const raw = localStorage.getItem(LOCAL_DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) { }
    const initial = { creators: getDefaultSeedCreators(), session: null };
    saveLocalStore(initial);
    return initial;
  }

  function saveLocalStore(store) {
    try {
      localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(store));
    } catch (_) { }
  }

  function inferTier(followers) {
    if (followers === "100K – 500K" || followers === "500K+") return "Ambassador";
    if (followers === "10K – 50K" || followers === "50K – 100K") return "Explorer";
    return "Taster";
  }

  function makeCode(name, handle) {
    const clean = ((name || handle || "KRISP").split(" ")[0].replace(/[^A-Za-z0-9]/g, "")).toUpperCase();
    return (clean.slice(0, 8) || "KRISP") + "15";
  }

  function computeKpis(list) {
    return {
      total: list.length,
      new_count: list.filter((c) => c.status === "New").length,
      shortlisted: list.filter((c) => ["Shortlisted", "Box sent", "Draft received", "Draft approved", "Posted"].includes(c.status)).length,
      boxes_sent: list.filter((c) => ["Box sent", "Draft received", "Draft approved", "Posted"].includes(c.status) || c.box_tracking).length,
      drafts_pending: list.filter((c) => c.status === "Draft received").length,
      posted: list.filter((c) => c.status === "Posted").length,
      total_views: list.reduce((s, c) => s + (Number(c.live_views) || 0), 0),
      total_code_uses: list.reduce((s, c) => s + (Number(c.code_uses) || 0), 0),
      total_budget: list.filter((c) => c.status !== "Not a fit").reduce((s, c) => s + (Number(c.collab_fee) || 0), 0),
    };
  }

  async function localFallbackApi(path, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const body = options.body ? JSON.parse(options.body) : {};
    const store = getLocalStore();

    if (path === "/api/auth/me" && method === "GET") {
      if (!store.session) throw { status: 401, error: "Not authenticated" };
      const creator = store.session.role === "influencer"
        ? store.creators.find((c) => c.email.toLowerCase() === store.session.email.toLowerCase())
        : null;
      return { user: store.session, creator };
    }

    if (path === "/api/auth/login" && method === "POST") {
      const id = (body.identifier || body.email || "").trim().toLowerCase();
      const pw = body.password || "";
      if (id === "admin@krispino.in" && pw === "Krispino@2026") {
        store.session = { id: 999, email: "admin@krispino.in", role: "admin", name: "Krispino Brand Team" };
        saveLocalStore(store);
        return { token: "local-admin-token", user: store.session, creator: null };
      }
      const handleId = id.startsWith("@") ? id : "@" + id;
      const found = store.creators.find((c) => c.email.toLowerCase() === id || c.handle.toLowerCase() === handleId);
      if (!found || (pw !== "creator123" && pw !== (found.password || "creator123"))) {
        throw { status: 401, error: "Invalid credentials. Try one of the demo buttons above." };
      }
      store.session = { id: found.id, email: found.email, role: "influencer", name: found.name };
      saveLocalStore(store);
      return { token: "local-inf-" + found.id, user: store.session, creator: found };
    }

    if (path === "/api/auth/logout" && method === "POST") {
      store.session = null;
      saveLocalStore(store);
      return { ok: true };
    }

    if (path === "/api/applications" && method === "POST") {
      const tier = inferTier(body.followers);
      const handle = body.handle.startsWith("@") ? body.handle : "@" + body.handle;
      const existingIdx = store.creators.findIndex((c) => c.email.toLowerCase() === body.email.toLowerCase());
      const item = {
        id: existingIdx >= 0 ? store.creators[existingIdx].id : Date.now(),
        name: body.name,
        handle,
        email: body.email.toLowerCase(),
        phone: body.phone,
        city: body.city,
        pincode: body.pincode,
        address: body.address || "",
        followers: body.followers,
        views: body.views || "",
        niche: body.niche || [],
        other_platforms: body.other || "",
        idea: body.idea,
        preferred_flavours: body.preferred_flavours || [],
        tier,
        status: existingIdx >= 0 ? store.creators[existingIdx].status : "New",
        discount_code: existingIdx >= 0 ? store.creators[existingIdx].discount_code : makeCode(body.name, handle),
        code_uses: existingIdx >= 0 ? store.creators[existingIdx].code_uses : 0,
        collab_fee: existingIdx >= 0 ? store.creators[existingIdx].collab_fee : (tier === "Taster" ? 0 : tier === "Explorer" ? 8000 : 25000),
        payout_status: tier === "Taster" ? "Barter Box" : "Pending",
        box_tracking: "",
        box_carrier: "BlueDart Express",
        draft_url: "",
        draft_caption: "",
        draft_submitted_at: 0,
        draft_feedback: "",
        live_post_url: "",
        live_story_url: "",
        live_views: 0,
        posted_at: 0,
        admin_notes: "",
        password: body.password || "creator123",
        created_at: Date.now(),
      };
      if (existingIdx >= 0) store.creators[existingIdx] = item;
      else store.creators.unshift(item);
      store.session = { id: item.id, email: item.email, role: "influencer", name: item.name };
      saveLocalStore(store);
      return { token: "local-inf-" + item.id, user: store.session, creator: item };
    }

    if (path === "/api/influencer/dashboard" && method === "GET") {
      const c = store.creators.find((x) => store.session && x.email.toLowerCase() === store.session.email.toLowerCase());
      if (!c) throw { status: 404, error: "Creator not found" };
      return { creator: c, flavours: FLAVOURS };
    }

    if (path === "/api/influencer/profile" && method === "PATCH") {
      const c = store.creators.find((x) => store.session && x.email.toLowerCase() === store.session.email.toLowerCase());
      if (!c) throw { status: 404, error: "Creator not found" };
      Object.assign(c, {
        phone: body.phone ?? c.phone,
        city: body.city ?? c.city,
        pincode: body.pincode ?? c.pincode,
        address: body.address ?? c.address,
        idea: body.idea ?? c.idea,
        other_platforms: body.other_platforms ?? c.other_platforms,
        preferred_flavours: Array.isArray(body.preferred_flavours) ? body.preferred_flavours.slice(0, 3) : c.preferred_flavours,
      });
      saveLocalStore(store);
      return { creator: c };
    }

    if (path === "/api/influencer/draft" && method === "POST") {
      const c = store.creators.find((x) => store.session && x.email.toLowerCase() === store.session.email.toLowerCase());
      if (!c) throw { status: 404, error: "Creator not found" };
      const cap = (body.draft_caption || "").toLowerCase();
      if (!cap.includes("#ad") && !cap.includes("#collab") && !cap.includes("#krispinopartner")) {
        throw { status: 400, error: "ASCI disclosure required: include #ad, #collab, or #KrispinoPartner in your draft caption." };
      }
      c.draft_url = body.draft_url;
      c.draft_caption = body.draft_caption;
      c.draft_submitted_at = Date.now();
      if (["New", "Shortlisted", "Box sent", "Draft received"].includes(c.status)) c.status = "Draft received";
      saveLocalStore(store);
      return { creator: c };
    }

    if (path === "/api/influencer/post" && method === "POST") {
      const c = store.creators.find((x) => store.session && x.email.toLowerCase() === store.session.email.toLowerCase());
      if (!c) throw { status: 404, error: "Creator not found" };
      c.live_post_url = body.live_post_url;
      c.live_story_url = body.live_story_url || "";
      c.live_views = Number(body.live_views) || 0;
      c.posted_at = Date.now();
      c.status = "Posted";
      saveLocalStore(store);
      return { creator: c };
    }

    if (path.startsWith("/api/admin/applications")) {
      const m = path.match(/^\/api\/admin\/applications\/(\d+)$/);
      if (m && method === "PATCH") {
        const id = Number(m[1]);
        const c = store.creators.find((x) => x.id === id);
        if (!c) throw { status: 404, error: "Not found" };
        Object.assign(c, body);
        saveLocalStore(store);
        return { creator: c };
      }
      if (m && method === "DELETE") {
        const id = Number(m[1]);
        store.creators = store.creators.filter((x) => x.id !== id);
        saveLocalStore(store);
        return { ok: true };
      }
      if (method === "POST") {
        const handle = body.handle.startsWith("@") ? body.handle : "@" + body.handle;
        const item = {
          id: Date.now(),
          name: body.name,
          handle,
          email: body.email.toLowerCase(),
          phone: body.phone || "",
          city: body.city || "Bengaluru",
          pincode: body.pincode || "560001",
          address: "",
          followers: body.followers || "10K – 50K",
          views: body.views || "",
          niche: body.niche || ["Food & reviews"],
          other_platforms: "",
          idea: body.idea || "Logged by Admin",
          preferred_flavours: ["Guntur Jerk", "Wasa-Boom"],
          tier: body.tier || "Explorer",
          status: body.status || "Shortlisted",
          discount_code: makeCode(body.name, handle),
          code_uses: 0,
          collab_fee: Number(body.collab_fee) || 0,
          payout_status: "Pending",
          box_tracking: "",
          box_carrier: "BlueDart Express",
          draft_url: "",
          draft_caption: "",
          draft_submitted_at: 0,
          draft_feedback: "",
          live_post_url: "",
          live_story_url: "",
          live_views: 0,
          posted_at: 0,
          admin_notes: "",
          created_at: Date.now(),
        };
        store.creators.unshift(item);
        saveLocalStore(store);
        return { creator: item };
      }
      // GET with query params
      const urlObj = new URL(path, "http://localhost");
      const st = urlObj.searchParams.get("status") || "";
      const tr = urlObj.searchParams.get("tier") || "";
      const q = (urlObj.searchParams.get("q") || "").toLowerCase();
      let filtered = [...store.creators];
      if (st) filtered = filtered.filter((c) => c.status === st);
      if (tr) filtered = filtered.filter((c) => c.tier === tr);
      if (q) {
        filtered = filtered.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.handle.toLowerCase().includes(q) ||
            c.city.toLowerCase().includes(q) ||
            (c.discount_code || "").toLowerCase().includes(q) ||
            (c.niche || []).some((n) => n.toLowerCase().includes(q))
        );
      }
      return { applications: filtered, kpis: computeKpis(store.creators), statuses: STATUSES };
    }

    throw { status: 404, error: "Endpoint not found" };
  }

  async function apiFetch(path, options = {}) {
    const token = localStorage.getItem(TOKEN_KEY) || "";
    const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    if (token) headers["Authorization"] = "Bearer " + token;

    if (location.protocol === "file:") {
      return localFallbackApi(path, options);
    }

    try {
      const res = await fetch(path, Object.assign({}, options, { headers }));
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        return localFallbackApi(path, options);
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw { status: res.status, error: data.error || "Request failed" };
      }
      return data;
    } catch (err) {
      if (err && err.status) throw err;
      // Network error or static hosting -> fallback seamlessly
      return localFallbackApi(path, options);
    }
  }

  // =========================================================================
  // 3. Application State & View Navigation
  // =========================================================================
  let currentUser = null;
  let currentCreator = null;
  let adminCreatorsCache = [];

  const views = {
    landing: document.getElementById("landingView"),
    influencer: document.getElementById("influencerView"),
    admin: document.getElementById("adminView"),
  };

  function switchView(target) {
    Object.entries(views).forEach(([k, el]) => {
      if (el) el.hidden = k !== target;
    });
    document.querySelectorAll("#mainNav [data-nav]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.nav === target);
    });
    document.querySelectorAll(".landing-anchor").forEach((a) => {
      a.hidden = target !== "landing";
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateHeaderAuthUI() {
    const roleBadge = document.getElementById("roleBadge");
    const openLoginBtn = document.getElementById("openLoginBtn");
    const myPortalBtn = document.getElementById("myPortalBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    const navInf = document.getElementById("navInfluencerBtn");
    const navAdm = document.getElementById("navAdminBtn");

    if (!currentUser) {
      roleBadge.textContent = "Creator Club";
      openLoginBtn.hidden = false;
      myPortalBtn.hidden = true;
      logoutBtn.hidden = true;
      navInf.hidden = true;
      navAdm.hidden = true;
      return;
    }

    openLoginBtn.hidden = true;
    logoutBtn.hidden = false;
    myPortalBtn.hidden = false;

    if (currentUser.role === "admin") {
      roleBadge.textContent = "Admin Console";
      myPortalBtn.textContent = "Admin Console";
      navAdm.hidden = false;
      navInf.hidden = true;
    } else {
      roleBadge.textContent = "Influencer Hub";
      myPortalBtn.textContent = "My Creator Hub";
      navInf.hidden = false;
      navAdm.hidden = true;
    }
  }

  // Theme Toggle
  const themeBtn = document.getElementById("themeToggleBtn");
  const savedTheme = localStorage.getItem("krispino_theme");
  if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);
  themeBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("krispino_theme", next);
  });

  // Navigation clicks
  document.querySelectorAll("#mainNav [data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.nav;
      if (target === "influencer" && currentUser?.role === "influencer") {
        loadInfluencerDashboard();
      } else if (target === "admin" && currentUser?.role === "admin") {
        loadAdminDashboard();
      } else {
        switchView("landing");
      }
    });
  });

  document.getElementById("logoHome").addEventListener("click", (e) => {
    e.preventDefault();
    switchView("landing");
  });

  document.getElementById("myPortalBtn").addEventListener("click", () => {
    if (currentUser?.role === "admin") loadAdminDashboard();
    else if (currentUser?.role === "influencer") loadInfluencerDashboard();
  });

  // =========================================================================
  // 4. Landing Page: Flavours Filter & Application Form
  // =========================================================================
  function renderFlavoursGrid(filter = "all") {
    const grid = document.getElementById("flavoursGrid");
    if (!grid) return;
    grid.textContent = "";
    const items = FLAVOURS.filter((f) => {
      if (filter === "all") return true;
      if (filter === "Hot") return f.heat === "Hot" || f.heat === "Extra Hot";
      return f.base === filter;
    });
    items.forEach((f) => {
      const card = document.createElement("div");
      card.className = "flv";
      const heatClass = f.heat.startsWith("Extra") ? "heat-Extra" : "heat-" + f.heat;
      card.innerHTML = `
        <div class="flv-top">
          <h3>${f.name}</h3>
          <span class="tag ${heatClass}">${f.heat}</span>
        </div>
        <p>${f.pair}</p>
        <div class="flv-meta">
          <span class="tag">${f.base} chips</span>
        </div>
      `;
      grid.appendChild(card);
    });
  }
  renderFlavoursGrid();

  document.querySelectorAll("[data-flv-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-flv-filter]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderFlavoursGrid(btn.dataset.flvFilter);
    });
  });

  function renderFlavourCheckboxes(containerId, selectedList = []) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.textContent = "";
    FLAVOURS.forEach((f) => {
      const lbl = document.createElement("label");
      const inp = document.createElement("input");
      inp.type = "checkbox";
      inp.value = f.name;
      if (selectedList.includes(f.name)) inp.checked = true;
      inp.addEventListener("change", () => {
        const checked = container.querySelectorAll("input:checked");
        if (checked.length > 3) {
          inp.checked = false;
        }
      });
      lbl.appendChild(inp);
      lbl.appendChild(document.createTextNode(f.name));
      container.appendChild(lbl);
    });
  }
  renderFlavourCheckboxes("f-flavours-pick", ["Guntur Jerk", "Wasa-Boom", "Peri Peri Pataka"]);

  // Application Form Draft Persistence & Submission
  const appForm = document.getElementById("appForm");
  const formErr = document.getElementById("formErr");
  const sentCard = document.getElementById("sentCard");
  const sentText = document.getElementById("sentText");
  const DRAFT_FIELDS = ["f-name", "f-handle", "f-followers", "f-views", "f-city", "f-pin", "f-address", "f-phone", "f-email", "f-other", "f-idea"];

  try {
    const saved = JSON.parse(localStorage.getItem("krispino-app-draft") || "{}");
    DRAFT_FIELDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el && saved[id]) el.value = saved[id];
    });
  } catch (_) { }

  appForm.addEventListener("input", () => {
    try {
      const o = {};
      DRAFT_FIELDS.forEach((id) => {
        const el = document.getElementById(id);
        if (el) o[id] = el.value.trim();
      });
      localStorage.setItem("krispino-app-draft", JSON.stringify(o));
    } catch (_) { }
  });

  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  appForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const niche = [...document.querySelectorAll("#f-niche input:checked")].map((i) => i.value);
    const preferred_flavours = [...document.querySelectorAll("#f-flavours-pick input:checked")].map((i) => i.value);

    const missing = [];
    [
      ["f-name", "full name"],
      ["f-handle", "Instagram handle"],
      ["f-followers", "followers"],
      ["f-city", "city"],
      ["f-pin", "pincode"],
      ["f-phone", "WhatsApp number"],
      ["f-email", "email"],
      ["f-password", "password"],
      ["f-idea", "content idea"],
    ].forEach(([id, label]) => {
      if (!val(id)) missing.push(label);
    });
    if (!niche.length) missing.push("content niche");

    if (missing.length) {
      formErr.textContent = "Please fill in: " + missing.join(", ") + ".";
      formErr.hidden = false;
      formErr.scrollIntoView({ block: "center" });
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(val("f-email"))) {
      formErr.textContent = "Please enter a valid email address.";
      formErr.hidden = false;
      return;
    }
    if (!/^\d{6}$/.test(val("f-pin"))) {
      formErr.textContent = "Pincode must be 6 digits.";
      formErr.hidden = false;
      return;
    }
    if (val("f-password").length < 6) {
      formErr.textContent = "Password should be at least 6 characters.";
      formErr.hidden = false;
      return;
    }
    if (!document.getElementById("f-consent").checked) {
      formErr.textContent = "Please tick the ASCI disclosure consent checkbox.";
      formErr.hidden = false;
      return;
    }

    formErr.hidden = true;
    const submitBtn = document.getElementById("submitAppBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating your Creator Hub…";

    let handle = val("f-handle");
    if (!handle.startsWith("@")) handle = "@" + handle;

    const payload = {
      name: val("f-name"),
      handle,
      followers: val("f-followers"),
      views: val("f-views"),
      city: val("f-city"),
      pincode: val("f-pin"),
      address: val("f-address"),
      phone: val("f-phone"),
      email: val("f-email"),
      password: val("f-password"),
      niche,
      preferred_flavours,
      other: val("f-other"),
      idea: val("f-idea"),
    };

    try {
      const res = await apiFetch("/api/applications", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (res.token) localStorage.setItem(TOKEN_KEY, res.token);
      currentUser = res.user;
      currentCreator = res.creator;
      updateHeaderAuthUI();

      const msg = [
        "Krispino Creator Club Application",
        "",
        "Name: " + payload.name,
        "Instagram: " + payload.handle,
        "Followers: " + payload.followers + " (Tier: " + (res.creator?.tier || "Explorer") + ")",
        "Avg Reel views: " + (payload.views || "—"),
        "City: " + payload.city + " (" + payload.pincode + ")",
        "WhatsApp: " + payload.phone,
        "Email: " + payload.email,
        "Niche: " + payload.niche.join(", "),
        "Box Flavours: " + (payload.preferred_flavours.join(", ") || "Surprise me"),
        "",
        "Content idea: " + payload.idea,
        "",
        "I agree to mark paid/gifted posts with #ad or #collab.",
      ].join("\n");

      sentText.textContent = msg;
      document.getElementById("waLink").href = "https://wa.me/918660175767?text=" + encodeURIComponent(msg);
      appForm.hidden = true;
      sentCard.hidden = false;
      sentCard.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      formErr.textContent = err.error || "Could not submit application. Please try again.";
      formErr.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit & Open My Dashboard";
    }
  });

  document.getElementById("editBtn").addEventListener("click", () => {
    sentCard.hidden = true;
    appForm.hidden = false;
  });

  document.getElementById("copyBtn").addEventListener("click", () => {
    const m = document.getElementById("copyMsg");
    navigator.clipboard?.writeText(sentText.textContent).then(
      () => { m.textContent = " · Copied!"; },
      () => { m.textContent = " · Select text above to copy."; }
    );
  });

  document.getElementById("goDashboardAfterSubmitBtn").addEventListener("click", () => {
    loadInfluencerDashboard();
  });

  // =========================================================================
  // 5. Authentication & Quick Demo Switchers
  // =========================================================================
  const loginDialog = document.getElementById("loginDialog");
  const loginForm = document.getElementById("loginForm");
  const loginErrBanner = document.getElementById("loginErrBanner");

  function openLoginModal() {
    loginErrBanner.hidden = true;
    loginDialog.showModal();
  }

  document.getElementById("openLoginBtn").addEventListener("click", openLoginModal);
  document.getElementById("heroLoginBtn").addEventListener("click", openLoginModal);
  document.getElementById("closeLoginDlgBtn").addEventListener("click", () => loginDialog.close());

  async function performLogin(identifier, password) {
    loginErrBanner.hidden = true;
    const submitBtn = document.getElementById("loginSubmitBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in…";
    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password }),
      });
      localStorage.setItem(TOKEN_KEY, res.token);
      currentUser = res.user;
      currentCreator = res.creator;
      updateHeaderAuthUI();
      if (loginDialog.open) loginDialog.close();

      if (currentUser.role === "admin") {
        await loadAdminDashboard();
      } else {
        await loadInfluencerDashboard();
      }
    } catch (err) {
      loginErrBanner.textContent = err.error || "Sign in failed. Please check your credentials.";
      loginErrBanner.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign In";
    }
  }

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("login-email").value.trim();
    const pw = document.getElementById("login-password").value;
    if (!id || !pw) {
      loginErrBanner.textContent = "Please enter both your email/handle and password.";
      loginErrBanner.hidden = false;
      return;
    }
    performLogin(id, pw);
  });

  // 1-Click Demo Login Chips inside Login Dialog
  document.querySelectorAll("[data-demo-login]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [id, pw] = btn.dataset.demoLogin.split("|");
      document.getElementById("login-email").value = id;
      document.getElementById("login-password").value = pw;
      performLogin(id, pw);
    });
  });

  // Hero Shortcut Cards on Landing Page
  document.querySelectorAll("[data-quick-demo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.quickDemo;
      if (mode === "admin") performLogin("admin@krispino.in", "Krispino@2026");
      else if (mode === "influencer-box") performLogin("ananya@example.com", "creator123");
      else if (mode === "influencer-draft") performLogin("rohan@example.com", "creator123");
    });
  });

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch (_) { }
    localStorage.removeItem(TOKEN_KEY);
    currentUser = null;
    currentCreator = null;
    updateHeaderAuthUI();
    switchView("landing");
  });

  // =========================================================================
  // 6. Influencer Dashboard Logic
  // =========================================================================
  function statusBadgeClass(status) {
    if (status === "Shortlisted") return "st-Shortlisted";
    if (status === "Box sent") return "st-Box";
    if (status === "Draft received") return "st-Draft";
    if (status === "Draft approved") return "st-Approved";
    if (status === "Posted") return "st-Posted";
    if (status === "Not a fit") return "st-Not";
    return "st-New";
  }

  function renderInfluencerDashboard(c) {
    currentCreator = c;
    document.getElementById("infWelcomeName").textContent = "Hi, " + c.name;
    document.getElementById("infSubline").textContent = `${c.handle} · ${c.city} (${c.pincode}) · ${c.followers} followers`;

    const stBadge = document.getElementById("infStatusBadge");
    stBadge.className = "badge " + statusBadgeClass(c.status);
    stBadge.textContent = "Status: " + c.status;

    const trBadge = document.getElementById("infTierBadge");
    trBadge.textContent = "Tier: " + c.tier;

    const waMsg = `Hi Krispino team! I'm ${c.name} (${c.handle}, Code: ${c.discount_code}). Checking in on my ${c.tier} collaboration.`;
    document.getElementById("infWaQuickBtn").href = "https://wa.me/918660175767?text=" + encodeURIComponent(waMsg);

    // 5-Step Onboarding Stepper
    const stageOrder = ["New", "Shortlisted", "Box sent", "Draft received", "Draft approved", "Posted"];
    const currentIdx = Math.max(0, stageOrder.indexOf(c.status));
    const stepsData = [
      { title: "Applied", desc: "Profile logged", activeIdx: 0 },
      { title: "Shortlisted", desc: c.tier + " tier locked", activeIdx: 1 },
      { title: "Box Shipped", desc: c.box_tracking ? c.box_tracking : "Packing 9 flavours", activeIdx: 2 },
      { title: "Draft Check", desc: c.status === "Draft approved" ? "Approved to post!" : "ASCI & brief review", activeIdx: 3 },
      { title: "Live & Rewarded", desc: c.payout_status === "Paid" ? "Payout completed" : "Reel live & tracked", activeIdx: 5 },
    ];

    const stepper = document.getElementById("infStepper");
    stepper.textContent = "";
    stepsData.forEach((s, i) => {
      const li = document.createElement("li");
      let stateCls = "";
      if (c.status === "Posted" || currentIdx > s.activeIdx || (i === 3 && c.status === "Draft approved")) {
        stateCls = "done";
      } else if (
        (i === 0 && c.status === "New") ||
        (i === 1 && c.status === "Shortlisted") ||
        (i === 2 && c.status === "Box sent") ||
        (i === 3 && c.status === "Draft received")
      ) {
        stateCls = "current";
      }
      li.className = "step-item " + stateCls;
      li.innerHTML = `
        <span class="s-num">Step 0${i + 1} ${stateCls === "done" ? "✓" : ""}</span>
        <span class="s-title">${s.title}</span>
        <span class="s-desc">${s.desc}</span>
      `;
      stepper.appendChild(li);
    });

    // Feedback Banner
    const fbBanner = document.getElementById("infFeedbackBanner");
    if (c.draft_feedback) {
      fbBanner.hidden = false;
      document.getElementById("infFeedbackText").textContent = c.draft_feedback;
    } else {
      fbBanner.hidden = true;
    }

    // Deliverables & Draft Form
    const tierMeta = TIER_INFO[c.tier] || TIER_INFO.Taster;
    document.getElementById("infDeliverableSpec").textContent = "Deliverable: " + tierMeta.spec;
    document.getElementById("inf-draft-url").value = c.draft_url || "";
    document.getElementById("inf-draft-caption").value = c.draft_caption || "";
    document.getElementById("infDraftTimestamp").textContent = c.draft_submitted_at
      ? "Last submitted: " + new Date(c.draft_submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : "No draft submitted yet";

    document.getElementById("inf-live-url").value = c.live_post_url || "";
    document.getElementById("inf-story-url").value = c.live_story_url || "";
    document.getElementById("inf-live-views").value = c.live_views || "";

    // Profile & Flavour Box Form
    renderFlavourCheckboxes("infFlavoursCheckGroup", c.preferred_flavours || []);
    document.getElementById("inf-edit-phone").value = c.phone || "";
    document.getElementById("inf-edit-city").value = c.city || "";
    document.getElementById("inf-edit-pin").value = c.pincode || "";
    document.getElementById("inf-edit-address").value = c.address || "";
    document.getElementById("inf-edit-other").value = c.other_platforms || "";
    document.getElementById("inf-edit-idea").value = c.idea || "";

    // Rewards & Code Card
    document.getElementById("infDiscountCode").textContent = c.discount_code || "KRISP15";
    document.getElementById("infCodeUses").textContent = String(c.code_uses || 0);
    document.getElementById("infCollabFee").textContent = c.collab_fee > 0 ? "₹" + Number(c.collab_fee).toLocaleString("en-IN") : "Barter Box";
    document.getElementById("infPayoutStatus").textContent = "Payout: " + (c.payout_status || "Pending");

    const perksUl = document.getElementById("infTierPerksList");
    perksUl.textContent = "";
    tierMeta.perks.forEach((p) => {
      const li = document.createElement("li");
      li.textContent = p;
      perksUl.appendChild(li);
    });

    // Shipment Card
    document.getElementById("infCarrier").textContent = c.box_carrier || "BlueDart Express";
    document.getElementById("infTrackingId").textContent = c.box_tracking || "Dispatching upon shortlist";
    document.getElementById("infDestPin").textContent = `${c.city} · ${c.pincode}`;

    const pillsWrap = document.getElementById("infBoxFlavoursPills");
    pillsWrap.textContent = "";
    const flvList = c.preferred_flavours && c.preferred_flavours.length ? c.preferred_flavours : ["Assorted 9-Pack"];
    flvList.forEach((fname) => {
      const sp = document.createElement("span");
      sp.className = "tag heat-Hot";
      sp.textContent = fname;
      pillsWrap.appendChild(sp);
    });
  }

  async function loadInfluencerDashboard() {
    switchView("influencer");
    try {
      const res = await apiFetch("/api/influencer/dashboard");
      renderInfluencerDashboard(res.creator);
    } catch (err) {
      if (currentCreator) renderInfluencerDashboard(currentCreator);
    }
  }

  document.getElementById("copyCodeBtn").addEventListener("click", (e) => {
    const code = document.getElementById("infDiscountCode").textContent;
    navigator.clipboard?.writeText(code);
    e.currentTarget.textContent = "Copied!";
    setTimeout(() => {
      e.currentTarget.textContent = "Copy Code";
    }, 1800);
  });

  // Submit Draft
  document.getElementById("infDraftForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById("infDraftMsg");
    msgEl.hidden = true;
    const draft_url = document.getElementById("inf-draft-url").value.trim();
    const draft_caption = document.getElementById("inf-draft-caption").value.trim();

    try {
      const res = await apiFetch("/api/influencer/draft", {
        method: "POST",
        body: JSON.stringify({ draft_url, draft_caption }),
      });
      renderInfluencerDashboard(res.creator);
      msgEl.className = "ok-banner";
      msgEl.textContent = "Draft submitted to the Krispino Brand Team! Status updated to 'Draft received'.";
      msgEl.hidden = false;
    } catch (err) {
      msgEl.className = "err-banner";
      msgEl.textContent = err.error || "Could not submit draft.";
      msgEl.hidden = false;
    }
  });

  // Submit Live Post
  document.getElementById("infLivePostForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById("infPostMsg");
    msgEl.hidden = true;
    const live_post_url = document.getElementById("inf-live-url").value.trim();
    const live_story_url = document.getElementById("inf-story-url").value.trim();
    const live_views = Number(document.getElementById("inf-live-views").value) || 0;

    try {
      const res = await apiFetch("/api/influencer/post", {
        method: "POST",
        body: JSON.stringify({ live_post_url, live_story_url, live_views }),
      });
      renderInfluencerDashboard(res.creator);
      msgEl.className = "ok-banner";
      msgEl.textContent = "Live Reel recorded! Your status is now 'Posted'.";
      msgEl.hidden = false;
    } catch (err) {
      msgEl.className = "err-banner";
      msgEl.textContent = err.error || "Could not save live post.";
      msgEl.hidden = false;
    }
  });

  // Update Profile & Box Flavours
  document.getElementById("infProfileForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById("infProfileMsg");
    msgEl.hidden = true;
    const preferred_flavours = [...document.querySelectorAll("#infFlavoursCheckGroup input:checked")].map((i) => i.value);
    const body = {
      phone: document.getElementById("inf-edit-phone").value.trim(),
      city: document.getElementById("inf-edit-city").value.trim(),
      pincode: document.getElementById("inf-edit-pin").value.trim(),
      address: document.getElementById("inf-edit-address").value.trim(),
      other_platforms: document.getElementById("inf-edit-other").value.trim(),
      idea: document.getElementById("inf-edit-idea").value.trim(),
      preferred_flavours,
    };

    try {
      const res = await apiFetch("/api/influencer/profile", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      renderInfluencerDashboard(res.creator);
      msgEl.className = "ok-banner";
      msgEl.textContent = "Profile & Flavour Box preferences updated!";
      msgEl.hidden = false;
    } catch (err) {
      msgEl.className = "err-banner";
      msgEl.textContent = err.error || "Could not update profile.";
      msgEl.hidden = false;
    }
  });

  // =========================================================================
  // 7. Admin Brand Console & Applications Tracker Logic
  // =========================================================================
  async function loadAdminDashboard() {
    switchView("admin");
    const q = document.getElementById("adminSearchInput").value.trim();
    const status = document.getElementById("adminStatusFilter").value;
    const tier = document.getElementById("adminTierFilter").value;

    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (tier) params.set("tier", tier);

    try {
      const res = await apiFetch("/api/admin/applications?" + params.toString());
      adminCreatorsCache = res.applications || [];
      renderAdminKpis(res.kpis || computeKpis(adminCreatorsCache));
      renderAdminTable(adminCreatorsCache);
    } catch (err) {
      document.getElementById("adminTableBody").innerHTML = `<tr><td colspan="7" style="text-align:center;padding:28px" class="muted">${err.error || "Failed to load applications."}</td></tr>`;
    }
  }

  function renderAdminKpis(k) {
    document.getElementById("kpiTotal").textContent = String(k.total || 0);
    document.getElementById("kpiShortlisted").textContent = String(k.shortlisted || 0);
    document.getElementById("kpiBoxes").textContent = String(k.boxes_sent || 0);
    document.getElementById("kpiDrafts").textContent = String(k.drafts_pending || 0);
    document.getElementById("kpiViews").textContent = Number(k.total_views || 0).toLocaleString("en-IN");
    document.getElementById("kpiBudget").textContent = "₹" + Number(k.total_budget || 0).toLocaleString("en-IN");
    document.getElementById("kpiOrders").textContent = String(k.total_code_uses || 0);
  }

  function renderAdminTable(list) {
    const tbody = document.getElementById("adminTableBody");
    const countLbl = document.getElementById("adminCountLabel");
    countLbl.textContent = `Showing ${list.length} creator${list.length === 1 ? "" : "s"}`;

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px" class="muted">No matching creators found. Try clearing your filters or click '+ Add Creator'.</td></tr>`;
      return;
    }

    tbody.textContent = "";
    list.forEach((c) => {
      const tr = document.createElement("tr");

      // Col 1: Sticky Row Header (<th scope="row">)
      const th = document.createElement("th");
      th.scope = "row";
      th.innerHTML = `
        <div style="display:grid;gap:2px">
          <span>${escapeHtml(c.name)}</span>
          <span class="hint" style="font-weight:600;color:var(--red)">${escapeHtml(c.handle)}</span>
          <span class="hint">${escapeHtml(c.phone || c.email)}</span>
        </div>
      `;
      tr.appendChild(th);

      // Col 2: Followers & Views
      const tdAudience = document.createElement("td");
      tdAudience.className = "num";
      tdAudience.innerHTML = `
        <div><b>${escapeHtml(c.followers)}</b></div>
        <div class="hint">Avg: ${escapeHtml(c.views || "—")} views</div>
      `;
      tr.appendChild(tdAudience);

      // Col 3: Tier, Fee & Code
      const tdTier = document.createElement("td");
      const feeStr = c.collab_fee > 0 ? `₹${Number(c.collab_fee).toLocaleString("en-IN")}` : "Barter";
      tdTier.innerHTML = `
        <div><b>${escapeHtml(c.tier)}</b> · <span class="num">${feeStr}</span></div>
        <div class="hint">Code: <code>${escapeHtml(c.discount_code || "—")}</code> (${c.code_uses || 0} orders)</div>
      `;
      tr.appendChild(tdTier);

      // Col 4: City & Niche
      const tdCity = document.createElement("td");
      const niches = Array.isArray(c.niche) ? c.niche.join(", ") : "";
      tdCity.innerHTML = `
        <div>${escapeHtml(c.city)} <span class="hint">(${escapeHtml(c.pincode)})</span></div>
        <div class="hint">${escapeHtml(niches)}</div>
      `;
      tr.appendChild(tdCity);

      // Col 5: Deliverables & Box
      const tdDeliv = document.createElement("td");
      const links = [];
      if (c.box_tracking) links.push(`<span class="tag">Box: ${escapeHtml(c.box_tracking)}</span>`);
      if (c.draft_url) links.push(`<a href="${escapeHtml(c.draft_url)}" target="_blank" rel="noopener" style="font-weight:600;font-size:12.5px">View Draft ↗</a>`);
      if (c.live_post_url) links.push(`<a href="${escapeHtml(c.live_post_url)}" target="_blank" rel="noopener" style="font-weight:600;font-size:12.5px;color:var(--green)">Live Reel (${Number(c.live_views || 0).toLocaleString("en-IN")}) ↗</a>`);
      tdDeliv.innerHTML = links.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">${links.join(" ")}</div>` : `<span class="hint">Awaiting box / draft</span>`;
      tr.appendChild(tdDeliv);

      // Col 6: Inline Status Select
      const tdStatus = document.createElement("td");
      const sel = document.createElement("select");
      sel.setAttribute("aria-label", "Status for " + c.name);
      sel.style.padding = "6px 9px";
      sel.style.fontSize = "13px";
      sel.style.width = "auto";
      STATUSES.forEach((st) => {
        const opt = document.createElement("option");
        opt.value = st;
        opt.textContent = st;
        if (st === c.status) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener("change", async () => {
        sel.disabled = true;
        try {
          await apiFetch(`/api/admin/applications/${c.id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: sel.value }),
          });
          await loadAdminDashboard();
        } catch (_) {
          sel.value = c.status;
        } finally {
          sel.disabled = false;
        }
      });
      tdStatus.appendChild(sel);
      tr.appendChild(tdStatus);

      // Col 7: Manage Button
      const tdAct = document.createElement("td");
      const revBtn = document.createElement("button");
      revBtn.type = "button";
      revBtn.className = "btn sm subtle";
      revBtn.textContent = c.status === "Draft received" ? "Review Draft" : "Manage";
      revBtn.addEventListener("click", () => openAdminReviewModal(c));
      tdAct.appendChild(revBtn);
      tr.appendChild(tdAct);

      tbody.appendChild(tr);
    });
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Filter Event Listeners
  document.getElementById("adminSearchInput").addEventListener("input", () => loadAdminDashboard());
  document.getElementById("adminStatusFilter").addEventListener("change", () => loadAdminDashboard());
  document.getElementById("adminTierFilter").addEventListener("change", () => loadAdminDashboard());

  // Review / Manage Creator Modal
  const reviewDialog = document.getElementById("reviewDialog");
  let activeReviewCreator = null;

  function openAdminReviewModal(c) {
    activeReviewCreator = c;
    document.getElementById("rev-id").value = String(c.id);
    document.getElementById("revCreatorHandle").textContent = `${c.handle} · ${c.tier} Tier`;
    document.getElementById("review-dlg-title").textContent = c.name;
    document.getElementById("revLocation").textContent = `${c.city} (${c.pincode}) ${c.address ? "— " + c.address : ""}`;
    document.getElementById("revContact").textContent = `${c.phone} · ${c.email}`;
    document.getElementById("revAudience").textContent = `${c.followers} followers · ${c.views || "—"} avg views`;
    document.getElementById("revIdea").textContent = c.idea || "—";
    document.getElementById("revFlavours").textContent = (c.preferred_flavours || []).join(", ") || "Assorted 9-Pack";

    const draftWrap = document.getElementById("revDraftUrlWrap");
    if (c.draft_url) {
      draftWrap.innerHTML = `<a href="${escapeHtml(c.draft_url)}" target="_blank" rel="noopener">${escapeHtml(c.draft_url)} ↗</a>`;
    } else {
      draftWrap.textContent = "No draft uploaded yet";
    }
    document.getElementById("revDraftCaption").textContent = c.draft_caption || "—";

    const liveWrap = document.getElementById("revLiveUrlWrap");
    if (c.live_post_url) {
      liveWrap.innerHTML = `<a href="${escapeHtml(c.live_post_url)}" target="_blank" rel="noopener">${escapeHtml(c.live_post_url)} ↗</a>`;
    } else {
      liveWrap.textContent = "Not posted yet";
    }

    document.getElementById("rev-feedback").value = c.draft_feedback || "";
    document.getElementById("rev-status").value = c.status || "New";
    document.getElementById("rev-tier").value = c.tier || "Taster";
    document.getElementById("rev-code").value = c.discount_code || "";
    document.getElementById("rev-fee").value = c.collab_fee ?? 0;
    document.getElementById("rev-payout").value = c.payout_status || "Pending";
    document.getElementById("rev-code-uses").value = c.code_uses ?? 0;
    document.getElementById("rev-carrier").value = c.box_carrier || "BlueDart Express";
    document.getElementById("rev-tracking").value = c.box_tracking || "";
    document.getElementById("rev-views").value = c.live_views ?? 0;
    document.getElementById("rev-notes").value = c.admin_notes || "";

    reviewDialog.showModal();
  }

  document.getElementById("closeReviewDlgBtn").addEventListener("click", () => reviewDialog.close());
  document.getElementById("cancelReviewBtn").addEventListener("click", () => reviewDialog.close());

  document.getElementById("quickApproveDraftBtn").addEventListener("click", () => {
    document.getElementById("rev-status").value = "Draft approved";
    const fb = document.getElementById("rev-feedback");
    if (!fb.value.trim() || fb.value.includes("Under review")) {
      fb.value = "Draft approved! ASCI disclosure and pack visibility look great. You are clear to post your Reel and paste the live link in your dashboard.";
    }
  });

  document.getElementById("quickRequestChangesBtn").addEventListener("click", () => {
    document.getElementById("rev-status").value = "Draft received";
    const fb = document.getElementById("rev-feedback");
    fb.value = "Revision requested: Please ensure #ad or #collab appears at the very beginning of the caption and the red Krispino pack is clearly visible in the first 3 seconds.";
    fb.focus();
  });

  document.getElementById("adminReviewForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = Number(document.getElementById("rev-id").value);
    const body = {
      status: document.getElementById("rev-status").value,
      tier: document.getElementById("rev-tier").value,
      discount_code: document.getElementById("rev-code").value.trim().toUpperCase(),
      collab_fee: Number(document.getElementById("rev-fee").value) || 0,
      payout_status: document.getElementById("rev-payout").value,
      code_uses: Number(document.getElementById("rev-code-uses").value) || 0,
      box_carrier: document.getElementById("rev-carrier").value.trim(),
      box_tracking: document.getElementById("rev-tracking").value.trim(),
      live_views: Number(document.getElementById("rev-views").value) || 0,
      draft_feedback: document.getElementById("rev-feedback").value.trim(),
      admin_notes: document.getElementById("rev-notes").value.trim(),
    };

    try {
      await apiFetch(`/api/admin/applications/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      reviewDialog.close();
      await loadAdminDashboard();
    } catch (_) { }
  });

  document.getElementById("deleteCreatorBtn").addEventListener("click", async () => {
    if (!activeReviewCreator) return;
    const id = activeReviewCreator.id;
    try {
      await apiFetch(`/api/admin/applications/${id}`, { method: "DELETE" });
      reviewDialog.close();
      await loadAdminDashboard();
    } catch (_) { }
  });

  // Add Creator Modal
  const addCreatorDialog = document.getElementById("addCreatorDialog");
  document.getElementById("openAddCreatorBtn").addEventListener("click", () => {
    document.getElementById("addCreatorForm").reset();
    addCreatorDialog.showModal();
  });
  document.getElementById("closeAddDlgBtn").addEventListener("click", () => addCreatorDialog.close());
  document.getElementById("cancelAddBtn").addEventListener("click", () => addCreatorDialog.close());

  document.getElementById("addCreatorForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      name: document.getElementById("add-name").value.trim(),
      handle: document.getElementById("add-handle").value.trim(),
      email: document.getElementById("add-email").value.trim(),
      phone: document.getElementById("add-phone").value.trim(),
      city: document.getElementById("add-city").value.trim() || "Bengaluru",
      pincode: document.getElementById("add-pin").value.trim() || "560001",
      followers: document.getElementById("add-followers").value,
      tier: document.getElementById("add-tier").value,
      status: document.getElementById("add-status").value,
      collab_fee: Number(document.getElementById("add-fee").value) || 0,
      idea: document.getElementById("add-idea").value.trim() || "Logged by Admin team",
    };
    if (!body.name || !body.handle || !body.email) return;
    try {
      await apiFetch("/api/admin/applications", {
        method: "POST",
        body: JSON.stringify(body),
      });
      addCreatorDialog.close();
      await loadAdminDashboard();
    } catch (_) { }
  });

  // CSV Export
  document.getElementById("exportCsvBtn").addEventListener("click", async () => {
    const rows = [
      ["ID", "Name", "Handle", "Email", "WhatsApp", "City", "Pincode", "Followers", "Tier", "Status", "Discount Code", "Code Orders", "Collab Fee (INR)", "Payout Status", "Tracking", "Draft URL", "Live Reel URL", "Live Views"],
    ];
    adminCreatorsCache.forEach((c) => {
      rows.push([
        c.id,
        c.name,
        c.handle,
        c.email,
        c.phone,
        c.city,
        c.pincode,
        c.followers,
        c.tier,
        c.status,
        c.discount_code,
        c.code_uses,
        c.collab_fee,
        c.payout_status,
        c.box_tracking,
        c.draft_url,
        c.live_post_url,
        c.live_views,
      ]);
    });
    const csvContent = rows
      .map((r) => r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "krispino-creators-export.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // =========================================================================
  // 8. Session Restore on Initial Page Load
  // =========================================================================
  (async function restoreSession() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token && location.protocol !== "file:") return;
    try {
      const res = await apiFetch("/api/auth/me");
      if (res && res.user) {
        currentUser = res.user;
        currentCreator = res.creator;
        updateHeaderAuthUI();
      }
    } catch (_) {
      localStorage.removeItem(TOKEN_KEY);
    }
  })();
})();
