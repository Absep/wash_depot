import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

const workers = ["Imran", "Bapu", "New Guy"];

const vehicleTypes = [
  "Bike",
  "Sedan",
  "SUV",
  "Pickup",
  "Lorry / Bus",
];


const LOYALTY_REQUIRED_PAID_WASHES = 4;

// Hardcoded model suggestions and business-specific category mapping.
// These are suggestions only; staff confirm the category before accepting a check-in.
const vehicleModelsByType = {
  Bike: [
    "Hero Splendor", "Hero Passion", "Hero Glamour", "Honda Activa", "Honda Dio", "Honda Shine",
    "Honda Unicorn", "TVS Jupiter", "TVS Apache RTR", "TVS Ntorq", "Bajaj Pulsar", "Bajaj Platina",
    "Royal Enfield Classic 350", "Royal Enfield Hunter 350", "Royal Enfield Meteor 350", "Royal Enfield Bullet 350",
    "KTM Duke", "KTM RC", "Yamaha R15", "Yamaha FZ", "Suzuki Access", "Suzuki Burgman",
    "Ather 450X", "Ola S1", "Bajaj Chetak"
  ],
  Sedan: [
    "Maruti S-Presso", "Maruti Alto", "Maruti WagonR", "Maruti Swift", "Maruti Baleno", "Maruti Dzire",
    "Maruti Celerio", "Maruti Ignis", "Hyundai Santro", "Hyundai i10", "Hyundai Grand i10", "Hyundai i20",
    "Hyundai Aura", "Hyundai Xcent", "Hyundai Verna", "Honda Amaze", "Honda City", "Honda Civic",
    "Volkswagen Virtus", "Volkswagen Vento", "Skoda Slavia", "Skoda Rapid", "Tata Tiago", "Tata Tigor",
    "Toyota Etios", "Toyota Corolla", "Renault Kwid", "Datsun Go"
  ],
  SUV: [
    "Hyundai Creta", "Hyundai Venue", "Hyundai Alcazar", "Kia Seltos", "Kia Sonet", "Kia Carens",
    "Toyota Fortuner", "Toyota Innova", "Toyota Hyryder", "Toyota Urban Cruiser", "Mahindra Scorpio",
    "Mahindra Scorpio N", "Mahindra Thar", "Mahindra XUV700", "Mahindra XUV300", "Mahindra Bolero",
    "Tata Nexon", "Tata Punch", "Tata Harrier", "Tata Safari", "Maruti Brezza", "Maruti Fronx",
    "Maruti Grand Vitara", "Maruti Jimny", "MG Hector", "MG Astor", "MG Gloster", "Jeep Compass",
    "Jeep Meridian", "Renault Duster", "Nissan Magnite", "Nissan Kicks", "Force Gurkha"
  ],
  Pickup: [
    "Mahindra Bolero Pik-Up", "Mahindra Veero", "Tata Yodha", "Isuzu D-Max", "Toyota Hilux", "Mahindra Supro"
  ],
  "Lorry / Bus": [
    "Tata 407", "Tata 709", "Tata LPT", "Tata Prima", "Ashok Leyland Dost", "Ashok Leyland Partner",
    "Ashok Leyland Viking", "Eicher Pro", "BharatBenz Truck", "Force Traveller", "School Bus", "Tourist Bus"
  ]
};

const allVehicleModelSuggestions = [...vehicleModelsByType.Sedan, ...vehicleModelsByType.SUV];
const vehicleModelAliases = {
  Bike: ["splendor", "passion", "glamour", "activa", "dio", "shine", "unicorn", "jupiter", "apache", "ntorq", "pulsar", "platina", "classic350", "hunter350", "meteor350", "bullet350", "duke", "rc", "r15", "fz", "access", "burgman", "450x", "olas1", "chetak"],
  Sedan: ["spresso", "alto", "wagonr", "swift", "baleno", "dzire", "celerio", "ignis", "santro", "i10", "grand i10", "i20", "aura", "xcent", "verna", "amaze", "city", "civic", "virtus", "vento", "slavia", "rapid", "tiago", "tigor", "etios", "corolla", "kwid", "datsun go"],
  SUV: ["creta", "venue", "alcazar", "seltos", "sonet", "carens", "fortuner", "innova", "hyryder", "urban cruiser", "scorpio", "thar", "xuv700", "xuv300", "bolero", "nexon", "punch", "harrier", "safari", "brezza", "fronx", "grand vitara", "jimny", "hector", "astor", "gloster", "compass", "meridian", "duster", "magnite", "kicks", "gurkha"],
  Pickup: ["bolero pickup", "boleropikup", "pikup", "veero", "yodha", "dmax", "hilux", "supro"],
  "Lorry / Bus": ["tata407", "407", "tata709", "709", "lpt", "prima", "dost", "partner", "viking", "eicherpro", "bharatbenz", "traveller", "schoolbus", "touristbus"]
};

const normalizedModelTypeEntries = [
  ...Object.entries(vehicleModelsByType).flatMap(([type, models]) =>
    models.map((model) => ({ key: model.toLowerCase().replace(/[^a-z0-9]/g, ""), type }))
  ),
  ...Object.entries(vehicleModelAliases).flatMap(([type, aliases]) =>
    aliases.map((alias) => ({ key: alias.toLowerCase().replace(/[^a-z0-9]/g, ""), type }))
  )
].sort((a, b) => b.key.length - a.key.length);

function inferVehicleTypeFromModel(model) {
  const key = String(model || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!key) return "";
  const match = normalizedModelTypeEntries.find(({ key: known }) => key === known || key.startsWith(known) || (known.length >= 6 && key.includes(known)));
  return match?.type || "";
}

function CustomerCheckInPage() {
  const [form, setForm] = useState({ registration: "", model: "", phone: "", consent: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const suggestedType = inferVehicleTypeFromModel(form.model);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    const registration = getVehicleRegistration(form.registration);
    const phoneDigits = normalizePhone(form.phone);
    const phone = phoneDigits.startsWith("91") && phoneDigits.length === 12 ? phoneDigits.slice(2) : phoneDigits;
    const model = form.model.trim();

    if (!registration) return setError("Enter a valid registration number, for example KL 71 J 6430.");
    if (model.length < 2 || model.length > 80) return setError("Enter your vehicle model (2–80 characters).");
    if (!/^[6-9]\d{9}$/.test(phone)) return setError("Enter a valid 10-digit Indian mobile number.");
    if (!form.consent) return setError("Please confirm that Wash Depot may use these details for your service and loyalty records.");

    setBusy(true);
    const { error: submitError } = await supabase.rpc("submit_customer_checkin", {
      p_vehicle_registration: registration,
      p_vehicle_model: model,
      p_phone: phone,
      p_consent: true,
    });
    setBusy(false);

    if (submitError) {
      setError(submitError.message || "We couldn't submit your check-in. Please ask a Wash Depot staff member for help.");
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <main className="public-checkin-shell">
        <section className="public-checkin-card public-checkin-success">
          <img className="public-brand-logo" src="/wash-depot-logo.png" alt="Wash Depot — Since 1996" />
          <p className="public-eyebrow">WASH DEPOT · 30 YEARS</p>
          <div className="checkin-success-icon">✓</div>
          <h1>Check-in submitted!</h1>
          <p>Your details have been sent to the Wash Depot team. Please show this confirmation to our staff. Your vehicle visit and loyalty credit are created only after staff accepts the check-in.</p>
          <div className="public-anniversary-note">🎉 30th Anniversary Customer Loyalty Rewards<br /><strong>4 paid washes + 1 free wash</strong><br />Available for eligible Bikes, Sedans and SUVs.</div>
          <button type="button" className="public-submit-button" onClick={() => { setSubmitted(false); setForm({ registration: "", model: "", phone: "", consent: false }); }}>Register another vehicle</button>
        </section>
      </main>
    );
  }

  return (
    <main className="public-checkin-shell">
      <section className="public-checkin-card">
        <img className="public-brand-logo" src="/wash-depot-logo.png" alt="Wash Depot — Since 1996" />
        <p className="public-eyebrow">CELEBRATING 30 YEARS</p>
        <h1>Welcome to Wash Depot</h1>
        <p className="public-checkin-intro">Scan, enter your details and check in. Our team will confirm your vehicle when it arrives.</p>
        <form className="public-checkin-form" onSubmit={handleSubmit}>
          <label htmlFor="public-registration">Vehicle registration number</label>
          <input id="public-registration" value={form.registration} onChange={(e) => setForm({ ...form, registration: e.target.value })} placeholder="e.g. KL 71 J 6430" autoCapitalize="characters" autoComplete="off" maxLength={20} required />

          <label htmlFor="public-model">Vehicle model</label>
          <input id="public-model" list="wash-depot-models" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Type your model, e.g. Fortuner" maxLength={80} required />
          <datalist id="wash-depot-models">{allVehicleModelSuggestions.map((model) => <option key={model} value={model} />)}</datalist>
          <p className="public-field-hint">Suggestions cover common Sedan and SUV models. You can type any model manually; staff will verify unfamiliar models and other vehicle categories.</p>
          {suggestedType ? <p className="public-model-hint">Likely vehicle category: <strong>{suggestedType}</strong> · Confirmed by staff at check-in.</p> : form.model.trim().length >= 2 ? <p className="public-model-hint public-model-hint-review">Category will be confirmed by our staff.</p> : null}

          <label htmlFor="public-phone">WhatsApp mobile number</label>
          <input id="public-phone" type="tel" inputMode="numeric" autoComplete="tel-national" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="10-digit mobile number" maxLength={15} required />

          <label className="public-consent-row"><input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} /><span>I agree that Wash Depot may use these details to manage my vehicle service and loyalty rewards.</span></label>
          {error && <p className="public-form-error" role="alert">{error}</p>}
          <button type="submit" className="public-submit-button" disabled={busy}>{busy ? "Submitting…" : "Submit Check-in"}</button>
        </form>
        <div className="public-anniversary-note">🎉 <strong>Wash Depot 30th Anniversary Rewards</strong><br />Get 1 FREE wash after every 4 completed paid washes on eligible Bikes, Sedans and SUVs. Progress is tracked separately by vehicle registration.</div>
        <p className="public-privacy-note">Please ask our team if you need help. Submitting this form does not itself start a wash or create a loyalty credit.</p>
      </section>
    </main>
  );
}

function StaffLogin({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { data, error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (loginError) {
      setError("Email or password is incorrect. Check the details and try again.");
      return;
    }
    onSuccess(data.session);
  };

  return (
    <main className="staff-login-shell">
      <section className="staff-login-card">
        <img className="public-brand-logo" src="/wash-depot-logo.png" alt="Wash Depot — Since 1996" />
        <p className="public-eyebrow">WASH DEPOT · OWNER ACCESS</p>
        <h1>Sign in</h1>
        <p>Use the Wash Depot owner account to open the management dashboard.</p>
        <form onSubmit={handleLogin} className="staff-login-form">
          <label htmlFor="staff-email">Email</label>
          <input id="staff-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label htmlFor="staff-password">Password</label>
          <input id="staff-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="public-form-error" role="alert">{error}</p>}
          <button className="public-submit-button" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in to dashboard"}</button>
        </form>
        <p className="public-privacy-note">Customer check-in is public. Vehicle history and customer records require owner sign-in.</p>
      </section>
    </main>
  );
}

function StaffGate() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState("");

  const verifyStaffSession = async (nextSession) => {
    setLoading(true);
    setAccessError("");
    const { data, error } = await supabase
      .from("staff_profiles")
      .select("user_id, display_name, role, is_active")
      .eq("user_id", nextSession.user.id)
      .maybeSingle();
    if (error || !data || data.is_active !== true || data.role !== "owner") {
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
      setAccessError("This account is not authorised for the Wash Depot dashboard. Sign in using the owner account.");
      setLoading(false);
      return;
    }
    setSession(nextSession);
    setProfile(data);
    setLoading(false);
  };

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!alive) return;
      if (error || !data.session) {
        setLoading(false);
        return;
      }
      await verifyStaffSession(data.session);
    });
    return () => { alive = false; };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  if (loading) return <div className="auth-loading">Loading Wash Depot…</div>;
  if (!session || !profile) return <><StaffLogin onSuccess={verifyStaffSession} />{accessError && <p className="auth-access-error">{accessError}</p>}</>;
  return <Dashboard staffProfile={profile} onSignOut={handleSignOut} />;
}

function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/check-in") return <CustomerCheckInPage />;
  return <StaffGate />;
}

// Only these vehicle categories participate in Wash Depot Loyalty Rewards.
const loyaltyVehicleTypes = new Set(["Bike", "Sedan", "SUV"]);

function isLoyaltyEligibleType(type) {
  return loyaltyVehicleTypes.has(String(type || "").trim());
}

// Accept common Indian registration formats and normalize spaces/punctuation.
function getVehicleRegistration(value) {
  const normalized = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const standardRegistration = /^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{1,4}$/.test(normalized);
  const bharatRegistration = /^\d{2}BH\d{4}[A-Z]{1,2}$/.test(normalized);

  return standardRegistration || bharatRegistration ? normalized : "";
}

function getItemRegistration(item) {
  const savedRegistration = getVehicleRegistration(item.vehicle_registration);
  if (savedRegistration) return savedRegistration;
  // Compatibility for old records which stored "REGISTRATION / MODEL" together.
  return getVehicleRegistration(String(item.vehicle_name || "").split("/")[0]);
}

function getItemModel(item) {
  const savedModel = String(item.vehicle_model || "").trim();
  if (savedModel) return savedModel;
  // Recover the old combined field where possible.
  const parts = String(item.vehicle_name || "").split("/");
  return parts.length > 1 ? parts.slice(1).join("/").trim() : "";
}

function getItemDisplayName(item) {
  const registration = getItemRegistration(item);
  const model = getItemModel(item);
  if (registration) return model ? `${registration} / ${model}` : registration;
  return String(item.vehicle_name || model || "Unknown vehicle");
}

// Return the latest saved details for a registration. A newer visit with a blank
// phone/model does not erase a value saved on an earlier visit.
function getRememberedVehicleDetails(records, registration) {
  if (!registration) return null;

  const matches = records
    .filter((item) => getItemRegistration(item) === registration)
    .sort(
      (a, b) =>
        new Date(b.created_at || b.service_date).getTime() -
        new Date(a.created_at || a.service_date).getTime()
    );

  if (matches.length === 0) return null;

  const latestWithType = matches.find((item) => String(item.vehicle_type || "").trim());
  const latestWithPhone = matches.find((item) => String(item.phone || "").trim());
  const latestWithModel = matches.find((item) => getItemModel(item));

  return {
    vehicleType: latestWithType?.vehicle_type || "",
    phone: latestWithPhone?.phone || "",
    model: latestWithModel ? getItemModel(latestWithModel) : "",
  };
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function getItemServiceDate(item) {
  return String(item.service_date || item.created_at || "").slice(0, 10);
}

function getDisplayStatus(status) {
  return status === "Cancelled" ? "Not washed" : status;
}

function formatVisitDate(item) {
  const date = getItemServiceDate(item);
  if (!date) return "Unknown date";
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? "Unknown date" : parsed.toLocaleDateString("en-IN");
}

function makeVehicleLookupGroups(records, query) {
  const term = String(query || "").trim();
  if (!term) return [];
  const termUpper = term.toUpperCase();
  const termAlphanumeric = termUpper.replace(/[^A-Z0-9]/g, "");
  const termDigits = normalizePhone(term);
  const map = new Map();

  for (const item of records) {
    const registration = getItemRegistration(item);
    const identity = registration
      ? `reg:${registration}`
      : `legacy:${String(item.vehicle_name || "").trim().toUpperCase()}|${String(item.vehicle_type || "").trim().toUpperCase()}`;
    if (!map.has(identity)) map.set(identity, []);
    map.get(identity).push(item);
  }

  const groups = [];
  for (const [key, items] of map.entries()) {
    items.sort((a, b) => new Date(b.created_at || b.service_date).getTime() - new Date(a.created_at || a.service_date).getTime());
    const latest = items[0];
    const registration = items.map(getItemRegistration).find(Boolean) || "";
    const modelItem = items.find((item) => getItemModel(item));
    const typeItem = items.find((item) => String(item.vehicle_type || "").trim());
    const phoneItem = items.find((item) => String(item.phone || "").trim());
    const model = modelItem ? getItemModel(modelItem) : "";
    const phone = phoneItem?.phone || "";
    const matchRegistration = termAlphanumeric.length > 0 && registration && registration.includes(termAlphanumeric);
    const matchLegacyName = String(latest.vehicle_name || "").toUpperCase().includes(termUpper);
    const matchModel = model.toUpperCase().includes(termUpper);
    const matchPhone = termDigits.length >= 4 && items.some((item) => {
      const savedPhone = normalizePhone(item.phone);
      return savedPhone.length > 0 && (savedPhone.includes(termDigits) || termDigits.endsWith(savedPhone) || savedPhone.endsWith(termDigits.slice(-10)));
    });
    if (!(matchRegistration || matchLegacyName || matchModel || matchPhone)) continue;

    const nonCancelledItems = items.filter((item) => item.status !== "Cancelled");
    const totalSpend = nonCancelledItems.filter((item) => item.is_free_wash !== true).reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0);
    groups.push({
      key, registration, model, phone, vehicleType: typeItem?.vehicle_type || latest.vehicle_type || "",
      latest, visits: items, totalVisits: nonCancelledItems.length, totalSpend,
      loyalty: getLoyaltyStatus(records, registration),
    });
  }

  return groups.sort((a, b) => new Date(b.latest.created_at || b.latest.service_date).getTime() - new Date(a.latest.created_at || a.latest.service_date).getTime());
}

// Four completed paid washes earn one free wash. Completing that free wash
// resets the cycle for this registration number.
function getLoyaltyStatus(records, registration) {
  if (!registration) {
    return { paidWashes: 0, freeWashDue: false, freeWashInProgress: false };
  }

  const matchingVisits = records
    .filter(
      (item) =>
        item.loyalty_eligible === true &&
        isLoyaltyEligibleType(item.vehicle_type) &&
        getItemRegistration(item) === registration
    )
    .sort(
      (a, b) =>
        new Date(a.created_at || a.service_date).getTime() -
        new Date(b.created_at || b.service_date).getTime()
    );

  let paidWashes = 0;
  let freeWashInProgress = false;

  for (const visit of matchingVisits) {
    if (visit.status === "Cancelled") continue;
    if (visit.is_free_wash === true) {
      if (visit.status === "Completed") {
        paidWashes = 0;
        freeWashInProgress = false;
      } else {
        freeWashInProgress = true;
      }
    } else if (visit.status === "Completed" && Number(visit.amount) > 0) {
      paidWashes = Math.min(LOYALTY_REQUIRED_PAID_WASHES, paidWashes + 1);
    }
  }

  return {
    paidWashes,
    freeWashDue: paidWashes >= LOYALTY_REQUIRED_PAID_WASHES && !freeWashInProgress,
    freeWashInProgress,
  };
}

function Dashboard({ staffProfile, onSignOut }) {
  const today = new Date().toLocaleDateString("en-CA");

  const [vehicle, setVehicle] = useState({
    registration: "",
    model: "",
    type: "",
    worker: "",
    phone: "",
    amount: "",
  });

  const [vehicles, setVehicles] = useState([]);
  const [pendingCheckins, setPendingCheckins] = useState([]);
  const [checkinChoices, setCheckinChoices] = useState({});

  const [showHistory, setShowHistory] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today);
  const [editingId, setEditingId] = useState(null);

  const [editVehicle, setEditVehicle] = useState({
    registration: "",
    model: "",
    type: "",
    worker: "",
    phone: "",
    amount: "",
  });

  const [loading, setLoading] = useState(true);
  const [memoryNotice, setMemoryNotice] = useState(null);
  const [memoryCheckedRegistration, setMemoryCheckedRegistration] = useState("");
  const [showLookup, setShowLookup] = useState(false);
  const [lookupQuery, setLookupQuery] = useState("");
  const [visitActionBusy, setVisitActionBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  // Use an in-app message instead of disruptive browser alert popups.
  const showNotice = (message, type = "error") => {
    setNotice({ message, type });
  };

  const renderNotice = () => notice && (
    <div className={`wd-notice wd-notice-${notice.type}`} role={notice.type === "error" ? "alert" : "status"}>
      <span>{notice.message}</span>
      <button type="button" className="wd-notice-close" aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button>
    </div>
  );

  const currentRegistration = getVehicleRegistration(vehicle.registration);
  const currentLoyalty = getLoyaltyStatus(vehicles, currentRegistration);
  const loyaltyEnabledForCurrentType = isLoyaltyEligibleType(vehicle.type);
  const freeWashDue = loyaltyEnabledForCurrentType && currentLoyalty.freeWashDue;
  const freeWashInProgress = loyaltyEnabledForCurrentType && currentLoyalty.freeWashInProgress;

  // Load vehicles from Supabase
  useEffect(() => {
    loadVehicles();
    loadPendingCheckins();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("wash-depot-customer-checkins")
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_checkins" }, () => {
        loadPendingCheckins();
      })
      .subscribe();
    // Poll every 15 seconds as a fallback if Supabase Realtime is not enabled.
    const refreshInterval = window.setInterval(loadPendingCheckins, 15000);
    return () => {
      window.clearInterval(refreshInterval);
      supabase.removeChannel(channel);
    };
  }, []);

  const loadVehicles = async () => {
    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading vehicles:", error);
      showNotice(error.message || "Could not load vehicles.", "error");
      setLoading(false);
      return;
    }

    setVehicles(data || []);
    setLoading(false);
  };

  const loadPendingCheckins = async () => {
    const { data, error } = await supabase
      .from("customer_checkins")
      .select("id, registration, vehicle_model, phone, created_at, expires_at, status")
      .eq("status", "Pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error loading customer check-ins:", error);
      return;
    }
    setPendingCheckins(data || []);
  };

  const updateCheckinChoice = (id, key, value) => {
    setCheckinChoices((current) => ({
      ...current,
      [id]: { ...(current[id] || {}), [key]: value },
    }));
  };

  const acceptCustomerCheckin = async (checkin) => {
    const choice = checkinChoices[checkin.id] || {};
    const inferredType = inferVehicleTypeFromModel(checkin.vehicle_model);
    const selectedType = choice.vehicleType ?? inferredType ?? "";
    const selectedWorker = choice.worker || "";
    const loyalty = getLoyaltyStatus(vehicles, checkin.registration);
    const freeWashDueForVisit = isLoyaltyEligibleType(selectedType) && loyalty.freeWashDue;
    const amount = freeWashDueForVisit ? 0 : Number(choice.amount);

    if (!selectedType) {
      showNotice("Please identify the vehicle category before accepting this check-in.");
      return;
    }
    if (!selectedWorker) {
      showNotice("Please assign a worker before accepting this check-in.");
      return;
    }
    if (!freeWashDueForVisit && (!Number.isFinite(amount) || amount <= 0)) {
      showNotice("Enter a service amount greater than zero for a paid wash.");
      return;
    }

    const { error } = await supabase.rpc("accept_customer_checkin", {
      p_checkin_id: checkin.id,
      p_vehicle_type: selectedType,
      p_assigned_worker: selectedWorker,
      p_amount: amount,
    });

    if (error) {
      console.error("Error accepting customer check-in:", error);
      showNotice(error.message || "Could not add this vehicle. Please try again.", "error");
      return;
    }

    setCheckinChoices((current) => {
      const next = { ...current };
      delete next[checkin.id];
      return next;
    });
    await Promise.all([loadVehicles(), loadPendingCheckins()]);
    // The accepted check-in disappears from the queue and appears in Today's Vehicles.
  };

  const rejectCustomerCheckin = async (checkin) => {
    const confirmed = window.confirm(`Remove check-in for ${checkin.registration}?`);
    if (!confirmed) return;
    const { error } = await supabase.rpc("reject_customer_checkin", { p_checkin_id: checkin.id });
    if (error) {
      showNotice(error.message || "Could not remove this check-in. Please try again.", "error");
      return;
    }
    await loadPendingCheckins();
  };

  // Look up a previously saved registration after the records finish loading.
  useEffect(() => {
    const registration = getVehicleRegistration(vehicle.registration);

    if (!registration) {
      if (memoryNotice !== null) setMemoryNotice(null);
      if (memoryCheckedRegistration) setMemoryCheckedRegistration("");
      return;
    }

    if (loading || registration === memoryCheckedRegistration) return;

    const remembered = getRememberedVehicleDetails(vehicles, registration);
    setMemoryCheckedRegistration(registration);

    if (!remembered) {
      setMemoryNotice({ kind: "new", registration });
      return;
    }

    setVehicle((current) => {
      if (getVehicleRegistration(current.registration) !== registration) return current;
      return {
        ...current,
        ...(remembered.vehicleType ? { type: remembered.vehicleType } : {}),
        ...(remembered.phone ? { phone: remembered.phone } : {}),
        ...(remembered.model ? { model: remembered.model } : {}),
      };
    });

    setMemoryNotice({
      kind: "found", registration,
      hasType: Boolean(remembered.vehicleType),
      hasPhone: Boolean(remembered.phone),
      hasModel: Boolean(remembered.model),
    });
  }, [vehicle.registration, vehicles, loading, memoryCheckedRegistration, memoryNotice]);

  const handleRegistrationChange = (e) => {
    const nextRegistration = e.target.value;
    const oldRegistration = getVehicleRegistration(vehicle.registration);
    const nextNormalized = getVehicleRegistration(nextRegistration);

    if (oldRegistration && oldRegistration !== nextNormalized) {
      setMemoryCheckedRegistration("");
      setMemoryNotice(null);
      setVehicle((current) => ({
        ...current, registration: nextRegistration, model: "", type: "", phone: "",
      }));
      return;
    }

    setVehicle((current) => ({ ...current, registration: nextRegistration }));
  };

  const useLookupVehicle = (group) => {
    if (!group.registration) {
      showNotice("Please enter the vehicle registration number first.");
      return;
    }
    setVehicle((current) => ({
      ...current,
      registration: group.registration,
      model: group.model || "",
      type: group.vehicleType || "",
      phone: group.phone || "",
      worker: "",
      amount: "",
    }));
    setMemoryCheckedRegistration(group.registration);
    setMemoryNotice({
      kind: "found", registration: group.registration,
      hasType: Boolean(group.vehicleType), hasPhone: Boolean(group.phone), hasModel: Boolean(group.model),
    });
    setShowLookup(false);
    setLookupQuery("");
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  };

  // Add a vehicle using separate registration/model fields. The registration is
  // required because memory and loyalty both identify a vehicle by its plate.
  const addVehicle = async (e) => {
    e.preventDefault();

    const registration = getVehicleRegistration(vehicle.registration);
    const loyalty = getLoyaltyStatus(vehicles, registration);
    const loyaltyEnabledForVisit = isLoyaltyEligibleType(vehicle.type);
    const freeWashDueForVisit = loyaltyEnabledForVisit && loyalty.freeWashDue;
    const freeWashInProgressForVisit = loyaltyEnabledForVisit && loyalty.freeWashInProgress;

    if (!registration) {
      showNotice("Enter a valid vehicle registration number, for example KL 71 J 6430.");
      return;
    }
    if (!vehicle.type || !vehicle.worker) {
      showNotice("Please select a vehicle type and assigned worker.");
      return;
    }
    if (!freeWashDueForVisit && (vehicle.amount === "" || !Number.isFinite(Number(vehicle.amount)) || Number(vehicle.amount) <= 0)) {
      showNotice("Enter an amount greater than zero for a paid wash.");
      return;
    }
    if (freeWashInProgressForVisit) {
      showNotice("A free wash is already in progress for this vehicle. Complete it before adding another visit.");
      return;
    }

    const { data, error } = await supabase.rpc("register_vehicle_visit", {
      p_vehicle_registration: registration,
      p_vehicle_model: vehicle.model.trim() || null,
      p_vehicle_type: vehicle.type,
      p_assigned_worker: vehicle.worker,
      p_phone: vehicle.phone || null,
      p_amount: freeWashDueForVisit ? 0 : Number(vehicle.amount),
      p_service_date: today,
    });

    if (error) {
      console.error("Error adding vehicle:", error);
      showNotice(error.message || "Could not add this vehicle. Please check the details and try again.", "error");
      return;
    }

    const newItem = Array.isArray(data) ? data[0] : data;
    setVehicle({ registration: "", model: "", type: "", worker: "", phone: "", amount: "" });
    setMemoryCheckedRegistration("");
    setMemoryNotice(null);
    await loadVehicles();

    if (newItem?.is_free_wash) {
      showNotice("Free wash added. Amount: ₹0.", "success");
    }
  };

  // Complete a visit and update loyalty progress in the same database transaction.
  const markCompleted = async (id) => {
    if (visitActionBusy) return false;
    setVisitActionBusy(true);
    try {
      const { error } = await supabase.rpc("complete_wash_visit", {
        p_vehicle_id: id,
      });

      if (error) {
        console.error("Error updating status:", error);
        // Show the exact database message so a failed free-wash reservation can be diagnosed.
        showNotice(error.message || "Could not mark this vehicle as completed. Please try again.", "error");
        return false;
      }

      await loadVehicles();
      showNotice("Vehicle marked as completed.", "success");
      return true;
    } catch (error) {
      console.error("Unexpected completion error:", error);
      showNotice(error?.message || "Connection problem. Please try again.", "error");
      return false;
    } finally {
      setVisitActionBusy(false);
    }
  };

  // Old visits can remain marked Washing when the team forgets to update them.
  // Only mark them completed after confirming the wash really happened.
  const markOverdueCompleted = async (item) => {
    const confirmed = window.confirm(
      `Mark ${getItemDisplayName(item)} as completed?`
    );
    if (!confirmed) return;
    await markCompleted(item.id);
  };

  // Cancel a visit that was entered but not actually washed. It remains in history,
  // is excluded from revenue/loyalty, and releases a reserved free wash if applicable.
  const cancelVisit = async (item) => {
    if (item.status !== "Washing") return;
    if (!window.confirm(`Mark ${getItemDisplayName(item)} as not washed?`)) return;

    setVisitActionBusy(true);
    const { error } = await supabase.rpc("cancel_wash_visit", {
      p_vehicle_id: item.id,
      // Save a standard audit note; no extra question for the owner.
      p_reason: "Marked not washed by owner",
    });
    setVisitActionBusy(false);
    if (error) {
      console.error("Error cancelling visit:", error);
      showNotice(error.message || "Could not update this visit. Please try again.", "error");
      return;
    }
    await loadVehicles();
  };

  // Undo only the latest completed visit for a registration. The database checks
  // ordering and reverses loyalty in the same transaction as reopening the visit.
  const undoCompletion = async (item) => {
    if (item.status !== "Completed") return;
    if (!window.confirm(`Move ${getItemDisplayName(item)} back to Washing?`)) return;

    setVisitActionBusy(true);
    const { error } = await supabase.rpc("undo_complete_wash_visit", {
      p_vehicle_id: item.id,
      // Save a standard audit note; no extra question for the owner.
      p_reason: "Reopened by owner",
    });
    setVisitActionBusy(false);
    if (error) {
      console.error("Error reopening visit:", error);
      showNotice(error.message || "Could not update this visit. Please try again.", "error");
      return;
    }
    await loadVehicles();
  };

  // Send WhatsApp with the 30th Anniversary promotion and current vehicle loyalty progress.
  const sendWhatsApp = (item) => {
    const registration = getItemRegistration(item);
    const loyalty = getLoyaltyStatus(vehicles, registration);
    const progress = Math.min(loyalty.paidWashes, LOYALTY_REQUIRED_PAID_WASHES);
    const remaining = LOYALTY_REQUIRED_PAID_WASHES - progress;

    let loyaltyMessage;
    if (item.is_free_wash === true) {
      loyaltyMessage = "🎉 This visit was your FREE 5th wash! Your loyalty counter has reset to 0 of 4 paid washes for the next reward.";
    } else if (!isLoyaltyEligibleType(item.vehicle_type)) {
      loyaltyMessage = "🎁 Wash Depot Loyalty Rewards are available for Sedan, SUV and Bike only. This vehicle type is not included in the loyalty program.";
    } else if (!registration) {
      loyaltyMessage = "🎁 Wash Depot Loyalty Rewards are tracked separately by vehicle registration. Please make sure your registration number is recorded.";
    } else if (loyalty.freeWashInProgress) {
      loyaltyMessage = "🎁 Your free wash reward has been unlocked and is currently in progress for this vehicle.";
    } else if (progress >= LOYALTY_REQUIRED_PAID_WASHES) {
      loyaltyMessage = "🎁 You have completed 4 paid washes! Your NEXT wash is FREE.";
    } else {
      loyaltyMessage = `🎁 Your loyalty progress: ${progress} of 4 paid washes completed. ${remaining} more paid ${remaining === 1 ? "wash" : "washes"} until your next wash is FREE!`;
    }

    const anniversaryMessage = [
      "🎉 *WASH DEPOT — CELEBRATING 30 YEARS!*",
      "As part of our 30th Anniversary celebrations, enjoy our special customer loyalty rewards:",
      "🎁 *Get 1 FREE WASH after every 4 completed paid washes!*",
      "*Eligible vehicles: Bikes, Sedans and SUVs.*",
      "Loyalty progress is tracked separately for each vehicle registration number."
    ].join("\n");

    const message = [
      "Hello! Your vehicle has been professionally cleaned and is ready for pickup. Thank you for choosing Wash Depot!",
      anniversaryMessage,
      loyaltyMessage,
      "Thank you for being part of our journey. Here's to many more years together!",
      "❤️ *Team Wash Depot*"
    ].join("\n\n");

    let phone = String(item.phone || "").replace(/\D/g, "");
    if (!phone) {
      showNotice("This vehicle does not have a customer WhatsApp number saved.");
      return;
    }
    if (phone.length === 10) phone = "91" + phone;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
  };

  // Start editing
  const startEditing = (item) => {
    setEditingId(item.id);

    setEditVehicle({
      registration: getItemRegistration(item),
      model: getItemModel(item),
      type: item.vehicle_type,
      worker: item.assigned_worker,
      phone: item.phone || "",
      amount: item.amount,
    });
  };

  // Edit input change
  const handleEditChange = (e) => {
    setEditVehicle({
      ...editVehicle,
      [e.target.name]: e.target.value,
    });
  };

  // Save separate registration and model fields while preserving loyalty protections.
  const saveEdit = async (id) => {
    const originalItem = vehicles.find((item) => item.id === id);
    const editedRegistration = getVehicleRegistration(editVehicle.registration);

    if (!editedRegistration) {
      showNotice("Enter a valid registration number, for example KL 71 J 6430.");
      return;
    }
    if (originalItem && getItemRegistration(originalItem) && originalItem.loyalty_eligible === true && editedRegistration !== getItemRegistration(originalItem)) {
      showNotice("This visit is linked to loyalty history. Keep its registration unchanged; contact the owner to correct a registration typo.");
      return;
    }
    if (!originalItem?.is_free_wash && (!Number.isFinite(Number(editVehicle.amount)) || Number(editVehicle.amount) <= 0)) {
      showNotice("Amount must be greater than zero for a paid wash.");
      return;
    }

    const { data, error } = await supabase.rpc("update_wash_vehicle_details", {
      p_vehicle_id: id,
      p_vehicle_registration: editedRegistration,
      p_vehicle_model: editVehicle.model.trim() || null,
      p_vehicle_type: editVehicle.type,
      p_assigned_worker: editVehicle.worker,
      p_phone: editVehicle.phone || null,
      p_amount: originalItem?.is_free_wash ? 0 : Number(editVehicle.amount),
    });

    if (error) {
      console.error("Error editing vehicle:", error);
      showNotice(error.message || "Could not save changes. Please try again.", "error");
      return;
    }

    const updatedItem = Array.isArray(data) ? data[0] : data;
    if (updatedItem) {
      setVehicles((currentVehicles) => currentVehicles.map((item) => item.id === id ? updatedItem : item));
    } else {
      await loadVehicles();
    }
    setEditingId(null);
  };

  // Cancel edit
  const cancelEdit = () => {
    setEditingId(null);
  };

  // Today's vehicles
  const todaysVehicles = vehicles.filter(
    (item) => item.service_date === today
  );

  // Previous-date visits still marked Washing are surfaced here so the owner
  // can correct forgotten statuses without deleting or recreating any records.
  const overdueWashingVehicles = vehicles
    .filter(
      (item) =>
        item.status === "Washing" &&
        getItemServiceDate(item) !== "" &&
        getItemServiceDate(item) < today
    )
    .sort((a, b) => getItemServiceDate(a).localeCompare(getItemServiceDate(b)));

  const todaysTotal = todaysVehicles.reduce(
    (sum, item) => sum + (item.status === "Cancelled" ? 0 : Number(item.amount)),
    0
  );

  const todaysWorkerTotals = workers.map((worker) => {
    const workerVehicles = todaysVehicles.filter(
      (item) => item.assigned_worker === worker && item.status !== "Cancelled"
    );

    return {
      worker,
      count: workerVehicles.length,
      total: workerVehicles.reduce(
        (sum, item) => sum + Number(item.amount),
        0
      ),
    };
  });

  // History
  const historyVehicles = vehicles.filter(
    (item) => item.service_date === selectedDate
  );

  const historyTotal = historyVehicles.reduce(
    (sum, item) => sum + (item.status === "Cancelled" ? 0 : Number(item.amount)),
    0
  );

  const historyWorkerTotals = workers.map((worker) => {
    const workerVehicles = historyVehicles.filter(
      (item) => item.assigned_worker === worker && item.status !== "Cancelled"
    );

    return {
      worker,
      count: workerVehicles.length,
      total: workerVehicles.reduce(
        (sum, item) => sum + Number(item.amount),
        0
      ),
    };
  });

  const lookupGroups = makeVehicleLookupGroups(vehicles, lookupQuery);

  // Customer / vehicle lookup page
  if (showLookup) {
    return (
      <div className="app">
        {renderNotice()}
        <header className="app-header">
          <div className="brand-lockup">
            <img className="brand-logo" src="/wash-depot-logo.png" alt="Wash Depot — Since 1996" />
            <div className="brand-copy">
              <p className="subtitle">Customer &amp; Vehicle Lookup</p>
            </div>
          </div>
          <div className="header-controls"><span className="header-tag">CAR CARE MANAGEMENT</span><span className="staff-name">{staffProfile?.display_name || "Owner"}</span><button type="button" className="header-signout" onClick={onSignOut}>Sign out</button></div>
        </header>
        <button type="button" className="back-button" onClick={() => setShowLookup(false)}>← Back to Today</button>
        <div className="lookup-panel">
          <label htmlFor="lookup-query">Search registration number or customer phone</label>
          <input
            id="lookup-query" type="search" value={lookupQuery}
            placeholder="e.g. KL71J6430 or 9876543210"
            onChange={(e) => setLookupQuery(e.target.value)}
          />
          <p className="lookup-help">Search by registration number or phone number.</p>
        </div>
        {loading ? (
          <p>Loading saved vehicle records…</p>
        ) : !lookupQuery.trim() ? (
          <p>Enter a registration number or phone number.</p>
        ) : lookupGroups.length === 0 ? (
          <p>No vehicle found.</p>
        ) : (
          <div className="lookup-results">
            {lookupGroups.map((group) => {
              const eligible = isLoyaltyEligibleType(group.vehicleType);
              const paidProgress = Math.min(group.loyalty.paidWashes, LOYALTY_REQUIRED_PAID_WASHES);
              return (
                <section className="lookup-card" key={group.key}>
                  <div className="lookup-card-heading">
                    <div>
                      <h2>{group.registration || getItemDisplayName(group.latest)}</h2>
                      <p>{[group.model, group.vehicleType].filter(Boolean).join(" · ") || "Vehicle details not fully saved"}</p>
                    </div>
                    <button type="button" className="small-button lookup-use-button" disabled={!group.registration} onClick={() => useLookupVehicle(group)}>Use vehicle</button>
                  </div>
                  <div className="lookup-details-grid">
                    <div><span>Customer phone</span><strong>{group.phone || "Not saved"}</strong></div>
                    <div><span>Last visit</span><strong>{formatVisitDate(group.latest)}</strong></div>
                    <div><span>Last worker</span><strong>{group.latest.assigned_worker || "Not saved"}</strong></div>
                    <div><span>Last visit amount</span><strong>{group.latest.is_free_wash ? "FREE" : `₹${Number(group.latest.amount || 0).toLocaleString("en-IN")}`}</strong></div>
                    <div><span>Total visits recorded</span><strong>{group.totalVisits}</strong></div>
                    <div><span>Total spent</span><strong>₹{group.totalSpend.toLocaleString("en-IN")}</strong></div>
                  </div>
                  <div className="lookup-loyalty">
                    <strong>Loyalty</strong>
                    <p>{!group.registration ? "No registration saved." : !eligible ? "No reward for this vehicle type." : group.loyalty.freeWashInProgress ? "Free wash in progress." : group.loyalty.freeWashDue ? "Free wash available." : `${paidProgress}/4 washes. ${4 - paidProgress} more for a free wash.`}</p>
                  </div>
                  <details className="lookup-history">
                    <summary>Visit history ({group.visits.length})</summary>
                    <div className="table-container">
                      <table>
                        <thead><tr><th>Date</th><th>Model</th><th>Type</th><th>Worker</th><th>Amount</th><th>Status</th></tr></thead>
                        <tbody>{group.visits.map((item) => (
                          <tr key={item.id}>
                            <td>{formatVisitDate(item)}</td><td>{getItemModel(item) || "—"}</td><td>{item.vehicle_type || "—"}</td><td>{item.assigned_worker || "—"}</td>
                            <td>{item.is_free_wash ? "FREE" : `₹${Number(item.amount || 0).toLocaleString("en-IN")}`}</td><td>{getDisplayStatus(item.status)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </details>
                </section>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // History page
  if (showHistory) {
    return (
      <div className="app">
        {renderNotice()}
        <header className="app-header">
          <div className="brand-lockup">
            <img className="brand-logo" src="/wash-depot-logo.png" alt="Wash Depot — Since 1996" />
            <div className="brand-copy">
              <p className="subtitle">Vehicle History</p>
            </div>
          </div>
          <div className="header-controls"><span className="header-tag">CAR CARE MANAGEMENT</span><span className="staff-name">{staffProfile?.display_name || "Owner"}</span><button type="button" className="header-signout" onClick={onSignOut}>Sign out</button></div>
        </header>

        <button
          className="back-button"
          onClick={() => setShowHistory(false)}
        >
          ← Back to Today
        </button>

        <div className="history-date">
          <label>Select Date</label>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>

        <hr />

        <h2>
          Vehicles on{" "}
          {new Date(
            selectedDate + "T00:00:00"
          ).toLocaleDateString("en-IN")}
        </h2>

        {historyVehicles.length === 0 ? (
          <p>No vehicles recorded for this date.</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Vehicle / Model</th>
                  <th>Type</th>
                  <th>Worker</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {historyVehicles.map((item) => (
                  <tr key={item.id}>
                    <td>{getItemDisplayName(item)}</td>
                    <td>{item.vehicle_type}</td>
                    <td>{item.assigned_worker}</td>
                    <td>{item.is_free_wash ? <strong>FREE</strong> : `₹${item.amount}`}</td>

                    <td className={item.status === "Completed" ? "completed" : item.status === "Cancelled" ? "cancelled" : "washing"}>
                      {getDisplayStatus(item.status)}
                    </td>
                    <td>
                      {item.status === "Washing" && (
                        <div className="visit-correction-actions">
                          <button type="button" className="small-button" disabled={visitActionBusy} onClick={() => markOverdueCompleted(item)}>Completed</button>
                          <button type="button" className="visit-cancel-button" disabled={visitActionBusy} onClick={() => cancelVisit(item)}>Not washed</button>
                        </div>
                      )}
                      {item.status === "Completed" && (
                        <button type="button" className="visit-undo-button" disabled={visitActionBusy} onClick={() => undoCompletion(item)}>Mark as Washing</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="totals">
          <h2>Daily Total</h2>

          <div className="big-total">
            ₹{historyTotal}
          </div>
        </div>

        <div className="worker-section">
          <h2>Worker Totals</h2>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Vehicles</th>
                  <th>Total</th>
                </tr>
              </thead>

              <tbody>
                {historyWorkerTotals.map((item) => (
                  <tr key={item.worker}>
                    <td>{item.worker}</td>
                    <td>{item.count}</td>
                    <td>₹{item.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // Main page
  return (
    <div className="app">
      {renderNotice()}
      <header className="app-header">
        <div className="brand-lockup">
            <img className="brand-logo" src="/wash-depot-logo.png" alt="Wash Depot — Since 1996" />
            <div className="brand-copy">
              <p className="subtitle">Vehicle Service Management</p>
            </div>
          </div>
        <div className="header-controls"><span className="header-tag">CAR CARE MANAGEMENT</span><span className="staff-name">{staffProfile?.display_name || "Owner"}</span><button type="button" className="header-signout" onClick={onSignOut}>Sign out</button></div>
      </header>

      <section className="page-intro">
        <div className="page-intro-copy">
          <p className="eyebrow">DAILY OPERATIONS</p>
          <h2>Add Vehicle</h2>
          <p className="section-description">Review customer QR check-ins, register visits and manage vehicle history.</p>
        </div>
        <button type="button" className="lookup-button" onClick={() => { setLookupQuery(""); setShowLookup(true); }}>
          <span aria-hidden="true">⌕</span><span>Find Customer / Vehicle</span>
        </button>
      </section>

      <section className="checkin-queue-section" aria-labelledby="checkin-queue-heading">
        <div className="checkin-queue-heading">
          <div>
            <p className="eyebrow">CUSTOMER SELF CHECK-IN</p>
            <h2 id="checkin-queue-heading">QR Check-ins</h2>
            <p className="section-description">New customer submissions appear here. Verify the suggested vehicle category, assign a worker and set the service amount before accepting.</p>
          </div>
          <span className="checkin-count">{pendingCheckins.length} waiting</span>
        </div>
        {pendingCheckins.length === 0 ? (
          <div className="checkin-empty">No new customer check-ins right now.</div>
        ) : (
          <div className="checkin-list">
            {pendingCheckins.map((checkin) => {
              const choice = checkinChoices[checkin.id] || {};
              const inferredType = inferVehicleTypeFromModel(checkin.vehicle_model);
              const selectedType = choice.vehicleType ?? inferredType ?? "";
              const selectedWorker = choice.worker ?? "";
              const selectedAmount = choice.amount ?? "";
              const loyalty = getLoyaltyStatus(vehicles, checkin.registration);
              const freeDue = isLoyaltyEligibleType(selectedType) && loyalty.freeWashDue;
              return (
                <article className="checkin-card" key={checkin.id}>
                  <div className="checkin-card-top">
                    <div>
                      <strong>{checkin.registration}</strong>
                      <p>{checkin.vehicle_model}</p>
                      <span>{checkin.phone} · Submitted {new Date(checkin.created_at).toLocaleString("en-IN")}</span>
                    </div>
                    <span className={`model-match ${inferredType ? "model-match-found" : "model-match-review"}`}>
                      {inferredType ? `Suggested: ${inferredType}` : "Needs category check"}
                    </span>
                  </div>
                  <div className="checkin-loyalty-status" role="status">
                    {!selectedType ? (
                      <span>Select the vehicle category to see its loyalty progress.</span>
                    ) : !isLoyaltyEligibleType(selectedType) ? (
                      <span>Loyalty rewards are not available for this vehicle type.</span>
                    ) : loyalty.freeWashInProgress ? (
                      <strong>A free wash is already in progress for this vehicle.</strong>
                    ) : loyalty.freeWashDue ? (
                      <strong>🎉 Free wash earned! This visit will be FREE.</strong>
                    ) : (
                      <strong>🎁 {loyalty.paidWashes} of 4 paid washes completed · {4 - loyalty.paidWashes} more {4 - loyalty.paidWashes === 1 ? "wash" : "washes"} until the next wash is free.</strong>
                    )}
                  </div>
                  <div className="checkin-controls">
                    <label>Confirm vehicle category
                      <select value={selectedType} onChange={(e) => updateCheckinChoice(checkin.id, "vehicleType", e.target.value)}>
                        <option value="">Select category</option>
                        {vehicleTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                      </select>
                    </label>
                    <label>Assigned worker
                      <select value={selectedWorker} onChange={(e) => updateCheckinChoice(checkin.id, "worker", e.target.value)}>
                        <option value="">Select worker</option>
                        {workers.map((worker) => <option key={worker} value={worker}>{worker}</option>)}
                      </select>
                    </label>
                    <label>Service amount (₹)
                      <input type="number" min={freeDue ? "0" : "0.01"} step="0.01" value={freeDue ? "0" : selectedAmount} disabled={freeDue} placeholder={freeDue ? "Free reward" : "Enter amount"} onChange={(e) => updateCheckinChoice(checkin.id, "amount", e.target.value)} />
                    </label>
                  </div>
                  {freeDue && <p className="checkin-free-note">This registration has earned a free wash. It will be recorded as ₹0.</p>}
                  <div className="checkin-actions">
                    <button type="button" className="checkin-accept-button" onClick={() => acceptCustomerCheckin(checkin)}>Accept check-in</button>
                    <button type="button" className="checkin-reject-button" onClick={() => rejectCustomerCheckin(checkin)}>Reject</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <form onSubmit={addVehicle}>
        <label htmlFor="vehicle-registration">Vehicle Registration Number</label>
        <input
          id="vehicle-registration"
          type="text"
          placeholder="e.g. KL 07 AB 1234"
          autoComplete="off"
          value={vehicle.registration}
          onChange={handleRegistrationChange}
        />

        <label htmlFor="vehicle-model">Vehicle Model (Optional)</label>
        <input
          id="vehicle-model"
          type="text"
          placeholder="e.g. Fortuner, Seltos, Activa"
          autoComplete="off"
          value={vehicle.model}
          onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })}
        />

        {memoryNotice && (
          <p
            className={`memory-notice memory-notice-${memoryNotice.kind}`}
            role="status"
          >
            {memoryNotice.kind === "found" ? (
              <>
                <strong>Returning vehicle found: {memoryNotice.registration}.</strong>{" "}
                Saved details found: {[
                  memoryNotice.hasType ? "vehicle type" : null,
                  memoryNotice.hasPhone ? "customer number" : null,
                  memoryNotice.hasModel ? "model" : null,
                ].filter(Boolean).join(", ") || "previous visit"}. Please verify them and fill in anything missing.
              </>
            ) : (
              <>
                <strong>New vehicle: {memoryNotice.registration}.</strong>{" "}
                No previous visit was found. Enter its type and customer number; they can be remembered for the next visit.
              </>
            )}
          </p>
        )}

        {currentRegistration && loyaltyEnabledForCurrentType ? (
          <div className={`loyalty-status ${freeWashDue ? "loyalty-status-free" : ""}`}>
            <strong>Wash Depot Rewards · {currentRegistration}</strong>
            {freeWashDue ? (
              <p>You have completed 4 paid washes. This visit will be FREE! The counter resets after this free wash is completed.</p>
            ) : freeWashInProgress ? (
              <p>A free wash is already in progress for this vehicle. Complete it before registering another visit.</p>
            ) : (
              <p>{Math.min(currentLoyalty.paidWashes, LOYALTY_REQUIRED_PAID_WASHES)} of 4 paid washes completed. {LOYALTY_REQUIRED_PAID_WASHES - Math.min(currentLoyalty.paidWashes, LOYALTY_REQUIRED_PAID_WASHES)} more paid {LOYALTY_REQUIRED_PAID_WASHES - Math.min(currentLoyalty.paidWashes, LOYALTY_REQUIRED_PAID_WASHES) === 1 ? "wash" : "washes"} until the next wash is free.</p>
            )}
          </div>
        ) : currentRegistration && vehicle.type ? (
          <div className="loyalty-status">
            <strong>Wash Depot Rewards</strong>
            <p>Loyalty rewards are available for Sedan, SUV and Bike only. This {vehicle.type} visit will not earn or redeem a reward.</p>
          </div>
        ) : (
          <p className="loyalty-hint">Loyalty rewards are available for Sedan, SUV and Bike only, and are tracked by registration number.</p>
        )}

        <label>Vehicle Type</label>

        <select
          value={vehicle.type}
          onChange={(e) =>
            setVehicle({
              ...vehicle,
              type: e.target.value,
            })
          }
        >
          <option value="">Select vehicle type</option>

          {vehicleTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        <label>Assigned Worker</label>

        <select
          value={vehicle.worker}
          onChange={(e) =>
            setVehicle({
              ...vehicle,
              worker: e.target.value,
            })
          }
        >
          <option value="">Select worker</option>

          {workers.map((worker) => (
            <option key={worker} value={worker}>
              {worker}
            </option>
          ))}
        </select>

        <label>Customer WhatsApp Number</label>

        <input
          type="tel"
          placeholder="10 digit number"
          value={vehicle.phone}
          onChange={(e) =>
            setVehicle({
              ...vehicle,
              phone: e.target.value,
            })
          }
        />

        <label>{freeWashDue ? "Amount (Free Wash)" : "Amount"}</label>

        <input
          type="number"
          min={freeWashDue ? "0" : "0.01"}
          step="0.01"
          placeholder={freeWashDue ? "Free wash — ₹0" : "Enter amount"}
          value={freeWashDue ? "0" : vehicle.amount}
          disabled={freeWashDue}
          onChange={(e) =>
            setVehicle({
              ...vehicle,
              amount: e.target.value,
            })
          }
        />

        <button type="submit" disabled={freeWashInProgress}>
          Add Vehicle
        </button>
      </form>

      {overdueWashingVehicles.length > 0 && (
        <section className="overdue-section" aria-labelledby="overdue-heading">
          <div className="overdue-heading-row">
            <div>
              <p className="eyebrow">NEEDS ATTENTION</p>
              <h2 id="overdue-heading">Older unfinished vehicles</h2>
              <p className="overdue-description">
                These vehicles were left as Washing on an earlier day. Update them below.
              </p>
            </div>
            <span className="overdue-count">{overdueWashingVehicles.length} pending</span>
          </div>

          <div className="overdue-list">
            {overdueWashingVehicles.map((item) => (
              <article className="overdue-item" key={item.id}>
                <div className="overdue-item-details">
                  <strong>{getItemDisplayName(item)}</strong>
                  <span>{[item.vehicle_type, item.assigned_worker].filter(Boolean).join(" · ")}</span>
                  <span>{formatVisitDate(item)} · {item.is_free_wash ? "FREE wash" : `₹${Number(item.amount || 0).toLocaleString("en-IN")}`}</span>
                </div>
                <div className="visit-correction-actions">
                  <button
                    type="button"
                    className="overdue-complete-button"
                    disabled={visitActionBusy}
                    onClick={() => markOverdueCompleted(item)}
                  >
                    Mark completed
                  </button>
                  <button
                    type="button"
                    className="visit-cancel-button"
                    disabled={visitActionBusy}
                    onClick={() => cancelVisit(item)}
                  >
                    Not washed
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <hr />

      <h2>Today's Vehicles</h2>

      {loading ? (
        <p>Loading vehicles...</p>
      ) : todaysVehicles.length === 0 ? (
        <p>No vehicles added today.</p>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Vehicle / Model</th>
                <th>Type</th>
                <th>Worker</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {todaysVehicles.map((item) => (
                <tr key={item.id}>
                  {editingId === item.id ? (
                    <>
                      <td>
                        <input className="table-input" name="registration" aria-label="Vehicle registration" placeholder="Registration" value={editVehicle.registration} onChange={handleEditChange} />
                        <input className="table-input model-edit-input" name="model" aria-label="Vehicle model (optional)" placeholder="Model (optional)" value={editVehicle.model} onChange={handleEditChange} />
                      </td>

                      <td>
                        <select
                          className="table-input"
                          name="type"
                          value={editVehicle.type}
                          onChange={handleEditChange}
                        >
                          {vehicleTypes.map((type) => (
                            <option
                              key={type}
                              value={type}
                            >
                              {type}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td>
                        <select
                          className="table-input"
                          name="worker"
                          value={editVehicle.worker}
                          onChange={handleEditChange}
                        >
                          {workers.map((worker) => (
                            <option
                              key={worker}
                              value={worker}
                            >
                              {worker}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td>
                        <input
                          className="table-input"
                          name="amount"
                          type="number"
                          min={item.is_free_wash ? "0" : "0.01"}
                          step="0.01"
                          value={item.is_free_wash ? 0 : editVehicle.amount}
                          disabled={item.is_free_wash}
                          onChange={handleEditChange}
                        />
                      </td>

                      <td>{getDisplayStatus(item.status)}</td>

                      <td>
                        <input
                          className="table-input"
                          name="phone"
                          value={editVehicle.phone}
                          onChange={handleEditChange}
                        />

                        <button
                          className="small-button"
                          onClick={() =>
                            saveEdit(item.id)
                          }
                        >
                          Save
                        </button>

                        <button
                          className="cancel-button"
                          onClick={cancelEdit}
                        >
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{getItemDisplayName(item)}</td>
                      <td>{item.vehicle_type}</td>
                      <td>{item.assigned_worker}</td>
                      <td>{item.is_free_wash ? <strong>FREE</strong> : `₹${item.amount}`}</td>

                      <td className={item.status === "Completed" ? "completed" : item.status === "Cancelled" ? "cancelled" : "washing"}>
                        {getDisplayStatus(item.status)}
                      </td>

                      <td>
                        <button
                          className="edit-button"
                          onClick={() =>
                            startEditing(item)
                          }
                        >
                          Edit
                        </button>

                        {item.status === "Washing" && (
                          <div className="visit-correction-actions">
                            <button type="button" className="small-button" disabled={visitActionBusy} onClick={() => markCompleted(item.id)}>Completed</button>
                            <button type="button" className="visit-cancel-button" disabled={visitActionBusy} onClick={() => cancelVisit(item)}>Not washed</button>
                          </div>
                        )}
                        {item.status === "Completed" && (
                          <div className="visit-correction-actions">
                            <button type="button" className="whatsapp-button" onClick={() => sendWhatsApp(item)}>WhatsApp</button>
                            <button type="button" className="visit-undo-button" disabled={visitActionBusy} onClick={() => undoCompletion(item)}>Mark as Washing</button>
                          </div>
                        )}
                        {item.status === "Cancelled" && <span className="cancelled-label">Not washed</span>}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="totals">
        <h2>Daily Total</h2>

        <div className="big-total">
          ₹{todaysTotal}
        </div>
      </div>

      <div className="worker-section">
        <h2>Worker Totals</h2>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Worker</th>
                <th>Vehicles</th>
                <th>Total</th>
              </tr>
            </thead>

            <tbody>
              {todaysWorkerTotals.map((item) => (
                <tr key={item.worker}>
                  <td>{item.worker}</td>
                  <td>{item.count}</td>
                  <td>₹{item.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <button
        className="history-button"
        onClick={() => {
          setSelectedDate(today);
          setShowHistory(true);
        }}
      >
        View History
      </button>
    </div>
  );
}

/* QR check-in and staff authentication wrapper */

export default App;