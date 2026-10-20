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

function formatVisitDate(item) {
  const date = item.service_date || item.created_at;
  if (!date) return "Unknown date";
  const parsed = new Date(`${String(date).slice(0, 10)}T00:00:00`);
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

    const totalSpend = items.filter((item) => item.is_free_wash !== true).reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0);
    groups.push({
      key, registration, model, phone, vehicleType: typeItem?.vehicle_type || latest.vehicle_type || "",
      latest, visits: items, totalVisits: items.length, totalSpend,
      loyalty: getLoyaltyStatus(records, registration),
    });
  }

  return groups.sort((a, b) => new Date(b.latest.created_at || b.latest.service_date).getTime() - new Date(a.latest.created_at || a.latest.service_date).getTime());
}

// Loyalty starts with visits recorded after the program is enabled.
// Three completed paid washes earn one free wash. Completing that free wash
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
    if (visit.is_free_wash === true) {
      if (visit.status === "Completed") {
        paidWashes = 0;
        freeWashInProgress = false;
      } else {
        freeWashInProgress = true;
      }
    } else if (visit.status === "Completed" && Number(visit.amount) > 0) {
      paidWashes += 1;
    }
  }

  return {
    paidWashes,
    freeWashDue: paidWashes >= 3 && !freeWashInProgress,
    freeWashInProgress,
  };
}

function App() {
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

  const currentRegistration = getVehicleRegistration(vehicle.registration);
  const currentLoyalty = getLoyaltyStatus(vehicles, currentRegistration);
  const loyaltyEnabledForCurrentType = isLoyaltyEligibleType(vehicle.type);
  const freeWashDue = loyaltyEnabledForCurrentType && currentLoyalty.freeWashDue;
  const freeWashInProgress = loyaltyEnabledForCurrentType && currentLoyalty.freeWashInProgress;

  // Load vehicles from Supabase
  useEffect(() => {
    loadVehicles();
  }, []);

  const loadVehicles = async () => {
    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading vehicles:", error);
      alert("Could not load vehicles.");
      setLoading(false);
      return;
    }

    setVehicles(data || []);
    setLoading(false);
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
      alert("This old record has no recognizable registration number. Enter the registration manually before using vehicle memory and loyalty rewards.");
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
      alert("Enter a valid vehicle registration number, for example KL 71 J 6430.");
      return;
    }
    if (!vehicle.type || !vehicle.worker) {
      alert("Please select a vehicle type and assigned worker.");
      return;
    }
    if (!freeWashDueForVisit && (vehicle.amount === "" || !Number.isFinite(Number(vehicle.amount)) || Number(vehicle.amount) <= 0)) {
      alert("Enter an amount greater than zero for a paid wash.");
      return;
    }
    if (freeWashInProgressForVisit) {
      alert("A free wash is already in progress for this vehicle. Complete it before adding another visit.");
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
      alert(error.message || "Could not add vehicle. Please refresh and try again.");
      return;
    }

    const newItem = Array.isArray(data) ? data[0] : data;
    setVehicle({ registration: "", model: "", type: "", worker: "", phone: "", amount: "" });
    setMemoryCheckedRegistration("");
    setMemoryNotice(null);
    await loadVehicles();

    if (newItem?.is_free_wash) {
      alert("This vehicle had earned a free wash. The visit was saved as FREE (₹0).");
    }
  };

  // Complete a visit and update loyalty progress in the same database transaction.
  const markCompleted = async (id) => {
    const { error } = await supabase.rpc("complete_wash_visit", {
      p_vehicle_id: id,
    });

    if (error) {
      console.error("Error updating status:", error);
      alert(error.message || "Could not update status. Please refresh and try again.");
      return;
    }

    await loadVehicles();
  };

  // Send WhatsApp with vehicle-specific loyalty progress
  const sendWhatsApp = (item) => {
    const registration = getItemRegistration(item);
    const loyalty = getLoyaltyStatus(vehicles, registration);

    let loyaltyMessage;
    const progress = Math.min(loyalty.paidWashes, 3);
    const remaining = 3 - progress;

    if (item.is_free_wash === true) {
      loyaltyMessage = progress === 0
        ? "🎉 This visit was your FREE 4th wash! Your loyalty counter has reset to 0 of 3 paid washes for the next reward."
        : `🎉 This visit was your FREE 4th wash! Your counter reset after redemption. Your next cycle is already at ${progress} of 3 paid washes.`;
    } else if (!isLoyaltyEligibleType(item.vehicle_type)) {
      loyaltyMessage = "🎁 Wash Depot Loyalty Rewards are available for Sedan, SUV and Bike only. This vehicle type is not included in the loyalty program.";
    } else if (!registration) {
      loyaltyMessage =
        "🎁 Wash Depot Loyalty Rewards: loyalty progress is tracked by vehicle registration number. Please make sure your registration is recorded on your next visit.";
    } else if (loyalty.freeWashInProgress) {
      loyaltyMessage =
        "🎁 Wash Depot Loyalty Rewards: your free wash reward has been unlocked and a free wash is currently in progress for this vehicle.";
    } else if (progress >= 3) {
      loyaltyMessage =
        "🎁 Wash Depot Loyalty Rewards: you have completed 3 paid washes! Your NEXT wash is FREE.";
    } else {
      loyaltyMessage = `🎁 Wash Depot Loyalty Rewards: ${progress} of 3 paid washes completed. ${remaining} more paid ${remaining === 1 ? "wash" : "washes"} until your next wash is FREE!`;
    }

    const message =
      `Hello! Your vehicle has been professionally cleaned and is ready for pickup. Thank you for choosing Wash Depot!\n\n${loyaltyMessage}`;

    let phone = String(item.phone || "").replace(/\D/g, "");

    if (!phone) {
      alert("This vehicle does not have a customer WhatsApp number saved.");
      return;
    }

    // Automatically add India country code for 10-digit numbers
    if (phone.length === 10) {
      phone = "91" + phone;
    }

    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      "_blank"
    );
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
      alert("Enter a valid registration number, for example KL 71 J 6430.");
      return;
    }
    if (originalItem && getItemRegistration(originalItem) && originalItem.loyalty_eligible === true && editedRegistration !== getItemRegistration(originalItem)) {
      alert("This visit is linked to loyalty history. Keep its registration unchanged; contact the owner to correct a registration typo.");
      return;
    }
    if (!originalItem?.is_free_wash && (!Number.isFinite(Number(editVehicle.amount)) || Number(editVehicle.amount) <= 0)) {
      alert("Amount must be greater than zero for a paid wash.");
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
      alert(error.message || "Could not save changes.");
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

  const todaysTotal = todaysVehicles.reduce(
    (sum, item) => sum + Number(item.amount),
    0
  );

  const todaysWorkerTotals = workers.map((worker) => {
    const workerVehicles = todaysVehicles.filter(
      (item) => item.assigned_worker === worker
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
    (sum, item) => sum + Number(item.amount),
    0
  );

  const historyWorkerTotals = workers.map((worker) => {
    const workerVehicles = historyVehicles.filter(
      (item) => item.assigned_worker === worker
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
        <header className="app-header">
          <div className="brand-lockup">
            <div className="brand-symbol" aria-hidden="true">WD</div>
            <div className="brand-copy">
              <h1>WASH DEPOT</h1>
              <p className="subtitle">Customer &amp; Vehicle Lookup</p>
            </div>
          </div>
          <span className="header-tag">CAR CARE MANAGEMENT</span>
        </header>
        <button type="button" className="back-button" onClick={() => setShowLookup(false)}>← Back to Today</button>
        <div className="lookup-panel">
          <label htmlFor="lookup-query">Search registration number or customer phone</label>
          <input
            id="lookup-query" type="search" value={lookupQuery}
            placeholder="e.g. KL71J6430 or 9876543210"
            onChange={(e) => setLookupQuery(e.target.value)}
          />
          <p className="lookup-help">Search by plate or at least the last 4 digits of the phone number. Results include previous visits and loyalty progress.</p>
        </div>
        {loading ? (
          <p>Loading saved vehicle records…</p>
        ) : !lookupQuery.trim() ? (
          <p>Enter a registration number or phone number to find saved details.</p>
        ) : lookupGroups.length === 0 ? (
          <p>No matching customer or vehicle found.</p>
        ) : (
          <div className="lookup-results">
            {lookupGroups.map((group) => {
              const eligible = isLoyaltyEligibleType(group.vehicleType);
              const paidProgress = Math.min(group.loyalty.paidWashes, 3);
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
                    <div><span>Total non-free spend recorded</span><strong>₹{group.totalSpend.toLocaleString("en-IN")}</strong></div>
                  </div>
                  <div className="lookup-loyalty">
                    <strong>Loyalty</strong>
                    <p>{!group.registration ? "Registration is missing; loyalty can't be safely matched." : !eligible ? `${group.vehicleType || "This type"} is not eligible. Rewards apply to Bike, Sedan and SUV.` : group.loyalty.freeWashInProgress ? "A free wash is currently in progress." : group.loyalty.freeWashDue ? "FREE wash earned — next eligible visit should redeem it." : `${paidProgress} of 3 completed paid washes toward the next free wash.`}</p>
                  </div>
                  <details className="lookup-history">
                    <summary>Visit history ({group.visits.length})</summary>
                    <div className="table-container">
                      <table>
                        <thead><tr><th>Date</th><th>Model</th><th>Type</th><th>Worker</th><th>Amount</th><th>Status</th></tr></thead>
                        <tbody>{group.visits.map((item) => (
                          <tr key={item.id}>
                            <td>{formatVisitDate(item)}</td><td>{getItemModel(item) || "—"}</td><td>{item.vehicle_type || "—"}</td><td>{item.assigned_worker || "—"}</td>
                            <td>{item.is_free_wash ? "FREE" : `₹${Number(item.amount || 0).toLocaleString("en-IN")}`}</td><td>{item.status}</td>
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
        <header className="app-header">
          <div className="brand-lockup">
            <div className="brand-symbol" aria-hidden="true">WD</div>
            <div className="brand-copy">
              <h1>WASH DEPOT</h1>
              <p className="subtitle">Vehicle History</p>
            </div>
          </div>
          <span className="header-tag">CAR CARE MANAGEMENT</span>
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
                </tr>
              </thead>

              <tbody>
                {historyVehicles.map((item) => (
                  <tr key={item.id}>
                    <td>{getItemDisplayName(item)}</td>
                    <td>{item.vehicle_type}</td>
                    <td>{item.assigned_worker}</td>
                    <td>{item.is_free_wash ? <strong>FREE</strong> : `₹${item.amount}`}</td>

                    <td
                      className={
                        item.status === "Completed"
                          ? "completed"
                          : "washing"
                      }
                    >
                      {item.status}
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
      <header className="app-header">
        <div className="brand-lockup">
          <div className="brand-symbol" aria-hidden="true">WD</div>
          <div className="brand-copy">
            <h1>WASH DEPOT</h1>
            <p className="subtitle">Vehicle Service Management</p>
          </div>
        </div>
        <span className="header-tag">CAR CARE MANAGEMENT</span>
      </header>

      <section className="page-intro">
        <div className="page-intro-copy">
          <p className="eyebrow">DAILY OPERATIONS</p>
          <h2>Add Vehicle</h2>
          <p className="section-description">Register a vehicle, track its wash, and keep customer details ready for next time.</p>
        </div>
        <button type="button" className="lookup-button" onClick={() => { setLookupQuery(""); setShowLookup(true); }}>
          <span aria-hidden="true">⌕</span><span>Find Customer / Vehicle</span>
        </button>
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
              <p>You have completed 3 paid washes. This visit will be FREE! The counter resets after this free wash is completed.</p>
            ) : freeWashInProgress ? (
              <p>A free wash is already in progress for this vehicle. Complete it before registering another visit.</p>
            ) : (
              <p>{Math.min(currentLoyalty.paidWashes, 3)} of 3 paid washes completed. {3 - Math.min(currentLoyalty.paidWashes, 3)} more paid {3 - Math.min(currentLoyalty.paidWashes, 3) === 1 ? "wash" : "washes"} until the next wash is free.</p>
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

                      <td>{item.status}</td>

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

                      <td
                        className={
                          item.status === "Completed"
                            ? "completed"
                            : "washing"
                        }
                      >
                        {item.status}
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

                        {item.status === "Washing" ? (
                          <button
                            className="small-button"
                            onClick={() =>
                              markCompleted(item.id)
                            }
                          >
                            Completed
                          </button>
                        ) : (
                          <button
                            className="whatsapp-button"
                            onClick={() =>
                              sendWhatsApp(item)
                            }
                          >
                            WhatsApp
                          </button>
                        )}
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

export default App;