import { useEffect, useState } from "react";
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

  const [vehicles, setVehicles] = useState(() => {
    const saved = localStorage.getItem("carWashVehicles");
    return saved ? JSON.parse(saved) : [];
  });

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

  // Save vehicles whenever they change
  useEffect(() => {
    localStorage.setItem(
      "carWashVehicles",
      JSON.stringify(vehicles)
    );
  }, [vehicles]);

  // -----------------------------
  // FORM
  // -----------------------------

  const handleChange = (e) => {
    setVehicle({
      ...vehicle,
      [e.target.name]: e.target.value,
    });
  };

  const addVehicle = (e) => {
    e.preventDefault();

    const newVehicle = {
      id: Date.now(),

      name: vehicle.name,
      type: vehicle.type,
      worker: vehicle.worker,
      phone: vehicle.phone,
      amount: Number(vehicle.amount),

      date: today,

      status: "Washing",
    };

    setVehicles([...vehicles, newVehicle]);

    setVehicle({
      name: "",
      type: "",
      worker: "",
      phone: "",
      amount: "",
    });
  };

  // -----------------------------
  // COMPLETE VEHICLE
  // -----------------------------

  const markCompleted = (id) => {
    setVehicles(
      vehicles.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "Completed",
            }
          : item
      )
    );
  };

  // -----------------------------
  // WHATSAPP
  // -----------------------------

  const sendWhatsApp = (item) => {
    const message =
      "Hello! Your vehicle has been professionally cleaned and is ready for pickup. Thank you for choosing Wash Depot!";

    const phone = item.phone.replace(/\D/g, "");

    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      "_blank"
    );
  };

  // -----------------------------
  // START EDITING
  // -----------------------------

  const startEditing = (item) => {
    setEditingId(item.id);

    setEditVehicle({
      name: item.name,
      type: item.type,
      worker: item.worker,
      phone: item.phone,
      amount: item.amount,
    });
  };

  // -----------------------------
  // EDIT FORM CHANGE
  // -----------------------------

  const handleEditChange = (e) => {
    setEditVehicle({
      ...editVehicle,
      [e.target.name]: e.target.value,
    });
  };

  // -----------------------------
  // SAVE EDIT
  // -----------------------------

  const saveEdit = (id) => {
    setVehicles(
      vehicles.map((item) =>
        item.id === id
          ? {
              ...item,

              name: editVehicle.name,
              type: editVehicle.type,
              worker: editVehicle.worker,
              phone: editVehicle.phone,
              amount: Number(editVehicle.amount),
            }
          : item
      )
    );

    setEditingId(null);
  };

  // -----------------------------
  // CANCEL EDIT
  // -----------------------------

  const cancelEdit = () => {
    setEditingId(null);
  };

  // -----------------------------
  // TODAY'S DATA
  // -----------------------------

  const todaysVehicles = vehicles.filter(
    (item) => item.date === today
  );

  const todaysTotal = todaysVehicles.reduce(
    (sum, item) => sum + Number(item.amount),
    0
  );

  const todaysWorkerTotals = workers.map((worker) => {
    const workerVehicles = todaysVehicles.filter(
      (item) => item.worker === worker
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

  // -----------------------------
  // HISTORY DATA
  // -----------------------------

  const historyVehicles = vehicles.filter(
    (item) => item.date === selectedDate
  );

  const historyTotal = historyVehicles.reduce(
    (sum, item) => sum + Number(item.amount),
    0
  );

  const historyWorkerTotals = workers.map((worker) => {
    const workerVehicles = historyVehicles.filter(
      (item) => item.worker === worker
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

  // =====================================================
  // HISTORY PAGE
  // =====================================================

  if (showHistory) {
    return (
      <div className="app">

        <h1>WASH DEPOT</h1>

        <p className="subtitle">
          Vehicle History
        </p>

        <button
          className="back-button"
          onClick={() => setShowHistory(false)}
        >
          ← Back to Today
        </button>

        <div className="history-date">

          <label>
            Select Date
          </label>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) =>
              setSelectedDate(e.target.value)
            }
          />

        </div>

        <h2>
          Vehicles — {selectedDate}
        </h2>

        {historyVehicles.length === 0 ? (

          <p>
            No vehicles recorded on this date.
          </p>

        ) : (

          <>
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

                      <td>
                        {item.name}
                      </td>

                      <td>
                        {item.type}
                      </td>

                      <td>
                        {item.worker}
                      </td>

                      <td>
                        ₹{item.amount}
                      </td>

                      <td>

                        <span
                          className={
                            item.status ===
                            "Completed"
                              ? "completed"
                              : "washing"
                          }
                        >
                          {item.status}
                        </span>

                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

            <div className="totals">

              <h2>
                Daily Total
              </h2>

              <p>
                Total Vehicles:{" "}
                <strong>
                  {historyVehicles.length}
                </strong>
              </p>

              <p className="big-total">
                ₹{historyTotal}
              </p>

            </div>

            <div className="worker-section">

              <h2>
                Worker Totals
              </h2>

              <table>

                <thead>

                  <tr>
                    <th>Worker</th>
                    <th>Vehicles</th>
                    <th>Total</th>
                  </tr>

                </thead>

                <tbody>

                  {historyWorkerTotals.map(
                    (item) => (

                      <tr key={item.worker}>

                        <td>
                          {item.worker}
                        </td>

                        <td>
                          {item.count}
                        </td>

                        <td>
                          ₹{item.total}
                        </td>

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>
          </>

        )}

      </div>
    );
  }

  // =====================================================
  // MAIN PAGE
  // =====================================================

  return (
    <div className="app">

      <h1>
        WASH DEPOT
      </h1>

      <p className="subtitle">
        Vehicle Management
      </p>

      {/* ==========================
          ADD VEHICLE
      ========================== */}

      <h2>
        Add Vehicle
      </h2>

      <form onSubmit={addVehicle}>

        <label>
          Vehicle Number / Model Name
        </label>

        <input
          type="text"
          name="name"
          placeholder="KL 07 AB 1234 / Toyota Fortuner"
          value={vehicle.name}
          onChange={handleChange}
          required
        />

        <label>
          Vehicle Type
        </label>

        <select
          name="type"
          value={vehicle.type}
          onChange={handleChange}
          required
        >

          <option value="">
            Select vehicle type
          </option>

          {vehicleTypes.map((type) => (

            <option
              key={type}
              value={type}
            >
              {type}
            </option>

          ))}

        </select>

        <label>
          Assigned Worker
        </label>

        <select
          name="worker"
          value={vehicle.worker}
          onChange={handleChange}
          required
        >

          <option value="">
            Select worker
          </option>

          {workers.map((worker) => (

            <option
              key={worker}
              value={worker}
            >
              {worker}
            </option>

          ))}

        </select>

        <label>
          Customer WhatsApp Number
        </label>

        <input
          type="tel"
          name="phone"
          placeholder="+91 XXXXX XXXXX"
          value={vehicle.phone}
          onChange={handleChange}
          required
        />

        <label>
          Amount
        </label>

        <input
          type="number"
          name="amount"
          placeholder="₹ 600"
          value={vehicle.amount}
          onChange={handleChange}
          required
        />

        <button type="submit">
          Add Vehicle
        </button>

      </form>

      <hr />

      {/* ==========================
          TODAY'S VEHICLES
      ========================== */}

      <h2>
        Today's Vehicles
      </h2>

      {todaysVehicles.length === 0 ? (

        <p>
          No vehicles added today.
        </p>

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
                          value={
                            editVehicle.name
                          }
                          onChange={
                            handleEditChange
                          }
                        />
                      </td>

                      <td>
                        <select
                          className="table-input"
                          name="type"
                          value={
                            editVehicle.type
                          }
                          onChange={
                            handleEditChange
                          }
                        >

                          {vehicleTypes.map(
                            (type) => (

                              <option
                                key={type}
                                value={type}
                              >
                                {type}
                              </option>

                            )
                          )}

                        </select>
                      </td>

                      <td>
                        <select
                          className="table-input"
                          name="worker"
                          value={
                            editVehicle.worker
                          }
                          onChange={
                            handleEditChange
                          }
                        >

                          {workers.map(
                            (worker) => (

                              <option
                                key={worker}
                                value={worker}
                              >
                                {worker}
                              </option>

                            )
                          )}

                        </select>
                      </td>

                      <td>
                        <input
                          className="table-input"
                          type="number"
                          name="amount"
                          value={
                            editVehicle.amount
                          }
                          onChange={
                            handleEditChange
                          }
                        />
                      </td>

                      <td>
                        {item.status}
                      </td>

                      <td>

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
                      <td>
                        {item.name}
                      </td>

                      <td>
                        {item.type}
                      </td>

                      <td>
                        {item.worker}
                      </td>

                      <td>
                        ₹{item.amount}
                      </td>

                      <td>

                        <span
                          className={
                            item.status ===
                            "Completed"
                              ? "completed"
                              : "washing"
                          }
                        >
                          {item.status}
                        </span>

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

                        {item.status !==
                        "Completed" ? (

                          <button
                            className="small-button"
                            onClick={() =>
                              markCompleted(
                                item.id
                              )
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

      {/* ==========================
          DAILY TOTAL
      ========================== */}

      <div className="totals">

        <h2>
          Today's Total
        </h2>

        <p>
          Total Vehicles:{" "}
          <strong>
            {todaysVehicles.length}
          </strong>
        </p>

        <p className="big-total">
          ₹{todaysTotal}
        </p>

      </div>

      {/* ==========================
          WORKER TOTALS
      ========================== */}

      <div className="worker-section">

        <h2>
          Worker Totals
        </h2>

        <table>

          <thead>

            <tr>
              <th>Worker</th>
              <th>Vehicles</th>
              <th>Total</th>
            </tr>

          </thead>

          <tbody>

            {todaysWorkerTotals.map(
              (item) => (

                <tr key={item.worker}>

                  <td>
                    {item.worker}
                  </td>

                  <td>
                    {item.count}
                  </td>

                  <td>
                    ₹{item.total}
                  </td>

                </tr>

              )
            )}

          </tbody>

        </table>

      </div>

      {/* ==========================
          HISTORY
      ========================== */}

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