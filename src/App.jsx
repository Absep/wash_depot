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
      return;
    }

    setVehicles(data || []);
    setLoading(false);
  };

  // Add vehicle
  const addVehicle = async (e) => {
    e.preventDefault();

    if (
      !vehicle.name ||
      !vehicle.type ||
      !vehicle.worker ||
      !vehicle.amount
    ) {
      alert("Please fill all required fields.");
      return;
    }

    const { data, error } = await supabase
      .from("vehicles")
      .insert([
        {
          vehicle_name: vehicle.name,
          vehicle_type: vehicle.type,
          assigned_worker: vehicle.worker,
          phone: vehicle.phone,
          amount: Number(vehicle.amount),
          status: "Washing",
          service_date: today,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error adding vehicle:", error);
      alert("Could not add vehicle.");
      return;
    }

    setVehicles([data, ...vehicles]);

    setVehicle({
      name: "",
      type: "",
      worker: "",
      phone: "",
      amount: "",
    });
  };

  // Mark completed
  const markCompleted = async (id) => {
    const { error } = await supabase
      .from("vehicles")
      .update({ status: "Completed" })
      .eq("id", id);

    if (error) {
      console.error("Error updating status:", error);
      alert("Could not update status.");
      return;
    }

    setVehicles(
      vehicles.map((item) =>
        item.id === id
          ? { ...item, status: "Completed" }
          : item
      )
    );
  };

  // Send WhatsApp
  const sendWhatsApp = (item) => {
    const message =
      "Hello! Your vehicle has been professionally cleaned and is ready for pickup. Thank you for choosing Wash Depot!";

    let phone = item.phone.replace(/\D/g, "");

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

  // Save edit
  const saveEdit = async (id) => {
    const { data, error } = await supabase
      .from("vehicles")
      .update({
        vehicle_name: editVehicle.name,
        vehicle_type: editVehicle.type,
        assigned_worker: editVehicle.worker,
        phone: editVehicle.phone,
        amount: Number(editVehicle.amount),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error editing vehicle:", error);
      alert("Could not save changes.");
      return;
    }

    setVehicles(
      vehicles.map((item) =>
        item.id === id ? data : item
      )
    );

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
                    <td>₹{item.amount}</td>

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
          onChange={(e) =>
            setVehicle({
              ...vehicle,
              name: e.target.value,
            })
          }
        />

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

        <label>Amount</label>

        <input
          type="number"
          placeholder="Enter amount"
          value={vehicle.amount}
          onChange={(e) =>
            setVehicle({
              ...vehicle,
              amount: e.target.value,
            })
          }
        />

        <button type="submit">
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
                          value={editVehicle.amount}
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
                      <td>₹{item.amount}</td>

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