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

// Accept common Indian registration formats. The app's vehicle field can contain
// either a registration alone or "REGISTRATION / MODEL".
function getVehicleRegistration(value) {
  const prefix = String(value || "").split("/")[0].trim().toUpperCase();
  const normalized = prefix.replace(/[^A-Z0-9]/g, "");
  const standardRegistration = /^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{1,4}$/.test(normalized);
  const bharatRegistration = /^\d{2}BH\d{4}[A-Z]{1,2}$/.test(normalized);

  return standardRegistration || bharatRegistration ? normalized : "";
}

function getItemRegistration(item) {
  const savedRegistration = String(item.vehicle_registration || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  return savedRegistration || getVehicleRegistration(item.vehicle_name);
}

// Return the latest saved vehicle details for a normalized registration. The
// type and phone are found independently so a newer visit with a blank phone
// does not erase a number saved on an earlier visit.
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

  return {
    vehicleType: latestWithType?.vehicle_type || "",
    phone: latestWithPhone?.phone || "",
  };
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
    name: "",
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
    name: "",
    type: "",
    worker: "",
    phone: "",
    amount: "",
  });

  const [loading, setLoading] = useState(true);
  const [memoryNotice, setMemoryNotice] = useState(null);
  const [memoryCheckedRegistration, setMemoryCheckedRegistration] = useState("");

  const currentRegistration = getVehicleRegistration(vehicle.name);
  const currentLoyalty = getLoyaltyStatus(vehicles, currentRegistration);
  const freeWashDue = currentLoyalty.freeWashDue;

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
  // A registration is checked once per value, so changes elsewhere in the app
  // will not repeatedly overwrite details a worker has manually edited.
  useEffect(() => {
    const registration = getVehicleRegistration(vehicle.name);

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
      // Do not apply a stale lookup if the worker has already changed plates.
      if (getVehicleRegistration(current.name) !== registration) return current;

      return {
        ...current,
        ...(remembered.vehicleType ? { type: remembered.vehicleType } : {}),
        ...(remembered.phone ? { phone: remembered.phone } : {}),
      };
    });

    setMemoryNotice({
      kind: "found",
      registration,
      hasType: Boolean(remembered.vehicleType),
      hasPhone: Boolean(remembered.phone),
    });
  }, [vehicle.name, vehicles, loading, memoryCheckedRegistration, memoryNotice]);

  const handleVehicleNameChange = (e) => {
    const nextName = e.target.value;
    const oldRegistration = getVehicleRegistration(vehicle.name);
    const nextRegistration = getVehicleRegistration(nextName);

    if (oldRegistration && oldRegistration !== nextRegistration) {
      // Avoid carrying the previous vehicle's type or phone to another plate.
      setMemoryCheckedRegistration("");
      setMemoryNotice(null);
      setVehicle((current) => ({
        ...current,
        name: nextName,
        type: "",
        phone: "",
      }));
      return;
    }

    setVehicle((current) => ({ ...current, name: nextName }));
  };

  // Add vehicle through an atomic Supabase function. The database decides
  // whether this visit is paid or the earned free wash, even if another worker
  // has a more recent screen open.
  const addVehicle = async (e) => {
    e.preventDefault();

    const registration = getVehicleRegistration(vehicle.name);
    const loyalty = getLoyaltyStatus(vehicles, registration);

    if (!vehicle.name.trim() || !vehicle.type || !vehicle.worker) {
      alert("Please fill all required fields.");
      return;
    }

    if (!loyalty.freeWashDue && (vehicle.amount === "" || !Number.isFinite(Number(vehicle.amount)) || Number(vehicle.amount) <= 0)) {
      alert("Enter an amount greater than zero for a paid wash.");
      return;
    }

    if (loyalty.freeWashInProgress) {
      alert("A free wash is already in progress for this vehicle. Complete it before adding another visit.");
      return;
    }

    const { data, error } = await supabase.rpc("register_vehicle_visit", {
      p_vehicle_name: vehicle.name.trim(),
      p_vehicle_type: vehicle.type,
      p_assigned_worker: vehicle.worker,
      p_phone: vehicle.phone || null,
      p_amount: loyalty.freeWashDue ? 0 : Number(vehicle.amount),
      p_service_date: today,
    });

    if (error) {
      console.error("Error adding vehicle:", error);
      alert(error.message || "Could not add vehicle. Please refresh and try again.");
      return;
    }

    const newItem = Array.isArray(data) ? data[0] : data;
    setVehicle({ name: "", type: "", worker: "", phone: "", amount: "" });
    await loadVehicles();

    if (newItem?.is_free_wash && !loyalty.freeWashDue) {
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
      name: item.vehicle_name,
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

  // Save edits through a database function that protects completed loyalty visits.
  const saveEdit = async (id) => {
    const originalItem = vehicles.find((item) => item.id === id);
    const editedRegistration = getVehicleRegistration(editVehicle.name);

    if (originalItem && getItemRegistration(originalItem) && !editedRegistration) {
      alert("Keep the vehicle registration number in the vehicle name so loyalty progress stays linked to the correct vehicle.");
      return;
    }

    if (!originalItem?.is_free_wash && (!Number.isFinite(Number(editVehicle.amount)) || Number(editVehicle.amount) <= 0)) {
      alert("Amount must be greater than zero for a paid wash.");
      return;
    }

    const { data, error } = await supabase.rpc("update_wash_vehicle_details", {
      p_vehicle_id: id,
      p_vehicle_name: editVehicle.name.trim(),
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
      setVehicles((currentVehicles) =>
        currentVehicles.map((item) => item.id === id ? updatedItem : item)
      );
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

  // History page
  if (showHistory) {
    return (
      <div className="app">
        <h1>WASH DEPOT</h1>
        <p className="subtitle">Vehicle History</p>

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
                  <th>Vehicle</th>
                  <th>Type</th>
                  <th>Worker</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {historyVehicles.map((item) => (
                  <tr key={item.id}>
                    <td>{item.vehicle_name}</td>
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
      <h1>WASH DEPOT</h1>
      <p className="subtitle">
        Vehicle Service Management
      </p>

      <h2>Add Vehicle</h2>

      <form onSubmit={addVehicle}>
        <label>Vehicle Number / Model Name</label>

        <input
          type="text"
          placeholder="e.g. KL 07 AB 1234 / Fortuner"
          value={vehicle.name}
          onChange={handleVehicleNameChange}
        />

        {memoryNotice && (
          <p
            className={`memory-notice memory-notice-${memoryNotice.kind}`}
            role="status"
          >
            {memoryNotice.kind === "found" ? (
              <>
                <strong>Returning vehicle found: {memoryNotice.registration}.</strong>{" "}
                {memoryNotice.hasType && memoryNotice.hasPhone
                  ? "Vehicle type and customer number have been filled from a previous visit. Please verify them."
                  : memoryNotice.hasType
                    ? "Vehicle type has been filled in, but no customer number was saved before. Please enter it."
                    : memoryNotice.hasPhone
                      ? "Customer number has been filled in, but no vehicle type was saved before. Please select it."
                      : "A previous visit was found, but it has no saved type or customer number. Please enter them."}
              </>
            ) : (
              <>
                <strong>New vehicle: {memoryNotice.registration}.</strong>{" "}
                No previous visit was found. Enter its type and customer number; they can be remembered for the next visit.
              </>
            )}
          </p>
        )}

        {currentRegistration ? (
          <div className={`loyalty-status ${freeWashDue ? "loyalty-status-free" : ""}`}>
            <strong>Wash Depot Rewards · {currentRegistration}</strong>
            {freeWashDue ? (
              <p>You have completed 3 paid washes. This visit will be FREE! The counter resets after this free wash is completed.</p>
            ) : currentLoyalty.freeWashInProgress ? (
              <p>A free wash is already in progress for this vehicle. Complete it before registering another visit.</p>
            ) : (
              <p>{Math.min(currentLoyalty.paidWashes, 3)} of 3 paid washes completed. {3 - Math.min(currentLoyalty.paidWashes, 3)} more paid {3 - Math.min(currentLoyalty.paidWashes, 3) === 1 ? "wash" : "washes"} until the next wash is free.</p>
            )}
          </div>
        ) : (
          <p className="loyalty-hint">Loyalty rewards are tracked by registration number. Enter the plate number first, e.g. KL 07 AB 1234 / Fortuner.</p>
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

        <button type="submit" disabled={currentLoyalty.freeWashInProgress}>
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
                <th>Vehicle</th>
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
                        <input
                          className="table-input"
                          name="name"
                          value={editVehicle.name}
                          onChange={handleEditChange}
                        />
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
                      <td>{item.vehicle_name}</td>
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