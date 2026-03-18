"use client";

import { useState, useEffect, useCallback, InputHTMLAttributes } from "react";
import styles from "./page.module.css";

interface Ticket {
  id: number;
  parent: string;
  seller: string;
  item: string;
  amount: number;
  time: string;
}

interface InventoryItem {
  rowNumber: number;
  item: string;
  seller: string;
  amount: number;
}

type SyncState = "idle" | "syncing" | "synced" | "error";

function FormInput({
  icon,
  className,
  ...props
}: { icon: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={styles.inputWrap}>
      <span className={styles.inputIcon} aria-hidden="true">
        {icon}
      </span>
      <input
        className={`${styles.fieldInput} ${className ?? ""}`.trim()}
        {...props}
      />
    </div>
  );
}

export default function Home() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [nextId, setNextId] = useState(1);
  const [search, setSearch] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [syncMsg, setSyncMsg] = useState("Loading...");
  const [adding, setAdding] = useState(false);

  const [parent, setParent] = useState("");
  const [seller, setSeller] = useState("");
  const [amount, setAmount] = useState("");
  const [item, setItem] = useState("");
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [selectedInventoryRowNumber, setSelectedInventoryRowNumber] = useState<
    number | null
  >(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmMsg, setConfirmMsg2] = useState("");
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});
  const [validationError, setValidationError] = useState("");

  const fetchTickets = useCallback(async () => {
    setSyncState("syncing");
    setSyncMsg("Loading from Google Sheets...");
    try {
      const res = await fetch("/api/tickets");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTickets(data.tickets);
      const maxId = data.tickets.reduce(
        (m: number, t: Ticket) => Math.max(m, Number(t.id)),
        0,
      );
      setNextId(maxId + 1);
      setSyncState("synced");
      setSyncMsg("Synced with Google Sheets");
    } catch (err: any) {
      setSyncState("error");
      setSyncMsg("Could not load — check your env vars");
    }
  }, []);

  const fetchInventory = useCallback(async () => {
    try {
      const res = await fetch("/api/tickets?resource=inventory");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setInventory(data.inventory || []);
    } catch {
      setValidationError("✓ Could not load inventory");
      setInventory([]);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
    fetchInventory();
  }, [fetchTickets, fetchInventory]);

  function selectInventoryItem(selected: InventoryItem | null) {
    if (!selected) {
      setItem("");
      setSeller("");
      setAmount("");
      setSelectedInventoryRowNumber(null);
      return;
    }
    setItem(selected.item ?? "");
    setSeller(selected.seller ?? "");
    setAmount(String(selected.amount ?? ""));
    setSelectedInventoryRowNumber(selected.rowNumber ?? null);
  }

  async function addTicket() {
    setValidationError("");
    if (!parent || !seller || !amount || !item) {
      setValidationError("✓ Please fill in all fields");
      return;
    }
    if (!selectedInventoryRowNumber) {
      setValidationError("✓ Please select an inventory item");
      return;
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 0) {
      setValidationError("✓ Please enter a valid amount");
      return;
    }
    const ticket: Ticket = {
      id: nextId,
      parent,
      seller,
      item,
      amount: amt,
      time: new Date().toLocaleString("en-GB"),
    };
    setTickets((prev) => [...prev, ticket]);
    setNextId((n) => n + 1);
    setParent("");
    setSeller("");
    setAmount("");
    setItem("");
    setInventoryQuery("");
    setValidationError("");
    setAdding(true);
    setSyncState("syncing");
    setSyncMsg("Syncing...");
    try {
      await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", ...ticket }),
      });

      await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "markSold",
          rowNumber: selectedInventoryRowNumber,
          parent,
        }),
      });

      await fetchInventory();
      setSelectedInventoryRowNumber(null);

      setSyncState("synced");
      setSyncMsg("Synced with Google Sheets");
    } catch {
      setSyncState("error");
      setSyncMsg("Sync failed");
    }
    setAdding(false);
  }

  function openConfirm(title: string, msg: string, action: () => void) {
    setConfirmTitle(title);
    setConfirmMsg2(msg);
    setConfirmAction(() => action);
    setConfirmOpen(true);
  }

  function deleteTicket(id: number) {
    const t = tickets.find((t) => t.id === id);
    if (!t) return;
    openConfirm(
      "Delete this ticket?",
      `#${t.id} — ${t.parent} / ${t.seller} / €${t.amount.toFixed(2)}`,
      async () => {
        setTickets((prev) => prev.filter((x) => x.id !== id));
        setConfirmOpen(false);
        setSyncState("syncing");
        setSyncMsg("Syncing...");
        await fetch("/api/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", id }),
        });
        setSyncState("synced");
        setSyncMsg("Synced with Google Sheets");
      },
    );
  }

  function clearAll() {
    openConfirm(
      "Delete all tickets?",
      `This will remove all ${tickets.length} tickets and cannot be undone.`,
      async () => {
        setTickets([]);
        setNextId(1);
        setConfirmOpen(false);
        setSyncState("syncing");
        setSyncMsg("Syncing...");
        await fetch("/api/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "clear" }),
        });
        setSyncState("synced");
        setSyncMsg("Synced with Google Sheets");
      },
    );
  }

  function exportCSV() {
    if (tickets.length === 0) {
      setValidationError("✓ No tickets to export yet");
      return;
    }
    const rows = [["#", "Parent", "Seller", "Item", "Amount (EUR)", "Time"]];
    tickets.forEach((t) =>
      rows.push([
        String(t.id),
        t.parent,
        t.seller,
        t.item,
        t.amount.toFixed(2),
        t.time,
      ]),
    );
    const csv = rows
      .map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "studiofest_tickets.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const filtered = tickets.filter(
    (t) =>
      t.parent.toLowerCase().includes(search.toLowerCase()) ||
      t.seller.toLowerCase().includes(search.toLowerCase()) ||
      t.item.toLowerCase().includes(search.toLowerCase()),
  );
  const revenue = tickets.reduce((s, t) => s + t.amount, 0);
  const dateStr = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>Studio Fest Tracker</h1>
        <span className={styles.date}>{dateStr}</span>
      </header>

      <div className={`${styles.syncStatus} ${styles[syncState]}`}>
        <span
          className={`${styles.dot} ${syncState === "syncing" ? styles.pulse : ""}`}
        />
        <span>{syncMsg}</span>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Log a new purchase</div>
        <div className={styles.formFull}>
          <label>Inventory item</label>
          <div className={styles.inputWrap}>
            <span className={styles.inputIcon} aria-hidden="true">
              🔎
            </span>
            <input
              className={styles.fieldInput}
              value={inventoryQuery}
              onChange={(e) => setInventoryQuery(e.target.value)}
              placeholder="Search item or learner..."
            />
          </div>
          <div className={styles.tableWrap} style={{ marginTop: "10px" }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Seller</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {inventory
                  .filter((inv) => {
                    const q = inventoryQuery.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      inv.item.toLowerCase().includes(q) ||
                      inv.seller.toLowerCase().includes(q) ||
                      String(inv.amount).includes(q)
                    );
                  })
                  .slice(0, 30)
                  .map((inv) => {
                    const isSelected =
                      selectedInventoryRowNumber === inv.rowNumber;
                    return (
                      <tr
                        key={`${inv.rowNumber}-${inv.item}-${inv.seller}`}
                        onClick={() => selectInventoryItem(inv)}
                        style={{
                          cursor: "pointer",
                          background: isSelected
                            ? "var(--accent-light)"
                            : undefined,
                        }}
                      >
                        <td className={styles.bold}>{inv.item}</td>
                        <td>{inv.seller}</td>
                        <td className={styles.amount}>
                          €{Number(inv.amount).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                {inventory.filter((inv) => {
                  const q = inventoryQuery.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    inv.item.toLowerCase().includes(q) ||
                    inv.seller.toLowerCase().includes(q) ||
                    String(inv.amount).includes(q)
                  );
                }).length === 0 && (
                  <tr>
                    <td colSpan={3} className={styles.muted}>
                      No inventory items match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.formGrid}>
          <div>
            <label>Parent name</label>
            <FormInput
              icon="👤"
              value={parent}
              onChange={(e) => setParent(e.target.value)}
              placeholder="e.g. Mrs. Johnson"
              onKeyDown={(e) => e.key === "Enter" && addTicket()}
            />
          </div>
          <div>
            <label>Seller (student)</label>
            <FormInput
              icon="🎓"
              value={seller}
              onChange={(e) => setSeller(e.target.value)}
              placeholder="Auto-filled from inventory"
              readOnly
            />
          </div>
          <div>
            <label>Amount (€)</label>
            <FormInput
              icon="€"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.25"
              readOnly
            />
          </div>
        </div>
        <div className={styles.formFull}>
          <label>Item / product</label>
          <FormInput
            icon="🛍️"
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder="Auto-filled from inventory"
            readOnly
          />
        </div>
        <div className={styles.formFooter}>
          <div>
            {validationError && (
              <span
                style={{
                  color: "var(--danger)",
                  fontSize: "13px",
                  fontWeight: "500",
                }}
              >
                {validationError}
              </span>
            )}
            {adding && <span className={styles.spinner}>Syncing...</span>}
          </div>
          <button
            className={`${styles.btn} ${styles.primary}`}
            onClick={addTicket}
            disabled={adding}
          >
            {adding ? "Adding..." : "Add ticket"}
          </button>
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Total tickets</div>
          <div className={styles.statVal}>{tickets.length}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Total revenue</div>
          <div className={styles.statVal}>€{revenue.toFixed(2)}</div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, seller or item..."
        />
        <button
          className={`${styles.btn} ${styles.exportBtn}`}
          onClick={exportCSV}
          style={{ marginLeft: "auto" }}
        >
          Export CSV
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Parent</th>
              <th>Seller</th>
              <th>Item</th>
              <th>Amount</th>
              <th>Time</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id}>
                <td className={styles.ticketNum}>#{t.id}</td>
                <td className={styles.bold}>{t.parent}</td>
                <td>{t.seller}</td>
                <td className={styles.muted}>{t.item}</td>
                <td className={styles.amount}>
                  €{Number(t.amount).toFixed(2)}
                </td>
                <td className={styles.timeCell}>{t.time}</td>
                <td>
                  <button
                    className={`${styles.btn} ${styles.dangerBtn}`}
                    onClick={() => deleteTicket(t.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>📋</div>
            <div style={{ marginTop: "8px", fontWeight: "500" }}>
              {tickets.length === 0
                ? "No tickets yet — add the first one above!"
                : "No matching tickets"}
            </div>
          </div>
        )}
        {tickets.length > 1 && (
          <div className={styles.clearAllRow}>
            <button
              className={`${styles.btn} ${styles.dangerBtn}`}
              onClick={clearAll}
            >
              Delete all tickets
            </button>
          </div>
        )}
      </div>

      {confirmOpen && (
        <div className={styles.overlay} onClick={() => setConfirmOpen(false)}>
          <div
            className={styles.confirmBox}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.confirmBoxTitle}>⚠️ {confirmTitle}</h3>
            <p className={styles.confirmBoxMsg}>{confirmMsg}</p>
            <div className={styles.confirmActions}>
              <button
                className={styles.btn}
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                className={`${styles.btn} ${styles.dangerBtn}`}
                onClick={confirmAction}
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
