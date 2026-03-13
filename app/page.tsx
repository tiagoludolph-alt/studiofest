"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./page.module.css";

interface Ticket {
  id: number;
  parent: string;
  seller: string;
  item: string;
  amount: number;
  time: string;
}

type SyncState = "idle" | "syncing" | "synced" | "error";

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

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmMsg, setConfirmMsg2] = useState("");
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});

  const fetchTickets = useCallback(async () => {
    setSyncState("syncing");
    setSyncMsg("Loading from Google Sheets...");
    try {
      const res = await fetch("/api/tickets");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTickets(data.tickets);
      const maxId = data.tickets.reduce((m: number, t: Ticket) => Math.max(m, Number(t.id)), 0);
      setNextId(maxId + 1);
      setSyncState("synced");
      setSyncMsg("Synced with Google Sheets");
    } catch (err: any) {
      setSyncState("error");
      setSyncMsg("Could not load — check your env vars");
    }
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  async function addTicket() {
    if (!parent || !seller || !amount || !item) { alert("Please fill in all fields."); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 0) { alert("Please enter a valid amount."); return; }
    const ticket: Ticket = {
      id: nextId,
      parent, seller, item,
      amount: amt,
      time: new Date().toLocaleString("en-GB"),
    };
    setTickets(prev => [...prev, ticket]);
    setNextId(n => n + 1);
    setParent(""); setSeller(""); setAmount(""); setItem("");
    setAdding(true);
    setSyncState("syncing"); setSyncMsg("Syncing...");
    try {
      await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", ...ticket }),
      });
      setSyncState("synced"); setSyncMsg("Synced with Google Sheets");
    } catch {
      setSyncState("error"); setSyncMsg("Sync failed");
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
    const t = tickets.find(t => t.id === id);
    if (!t) return;
    openConfirm(
      "Delete this ticket?",
      `#${t.id} — ${t.parent} / ${t.seller} / €${t.amount.toFixed(2)}`,
      async () => {
        setTickets(prev => prev.filter(x => x.id !== id));
        setConfirmOpen(false);
        setSyncState("syncing"); setSyncMsg("Syncing...");
        await fetch("/api/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", id }),
        });
        setSyncState("synced"); setSyncMsg("Synced with Google Sheets");
      }
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
        setSyncState("syncing"); setSyncMsg("Syncing...");
        await fetch("/api/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "clear" }),
        });
        setSyncState("synced"); setSyncMsg("Synced with Google Sheets");
      }
    );
  }

  function exportCSV() {
    if (tickets.length === 0) { alert("No tickets to export."); return; }
    const rows = [["#", "Parent", "Seller", "Item", "Amount (EUR)", "Time"]];
    tickets.forEach(t => rows.push([String(t.id), t.parent, t.seller, t.item, t.amount.toFixed(2), t.time]));
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "studiofest_tickets.csv";
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  const filtered = tickets.filter(t =>
    t.parent.toLowerCase().includes(search.toLowerCase()) ||
    t.seller.toLowerCase().includes(search.toLowerCase()) ||
    t.item.toLowerCase().includes(search.toLowerCase())
  );
  const revenue = tickets.reduce((s, t) => s + t.amount, 0);
  const dateStr = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>Studio Fest Tracker</h1>
        <span className={styles.date}>{dateStr}</span>
      </header>

      <div className={`${styles.syncStatus} ${styles[syncState]}`}>
        <span className={`${styles.dot} ${syncState === "syncing" ? styles.pulse : ""}`} />
        <span>{syncMsg}</span>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Log a new purchase</div>
        <div className={styles.formGrid}>
          <div>
            <label>Parent name</label>
            <input value={parent} onChange={e => setParent(e.target.value)} placeholder="e.g. Mrs. Johnson" onKeyDown={e => e.key === "Enter" && addTicket()} />
          </div>
          <div>
            <label>Seller (student)</label>
            <input value={seller} onChange={e => setSeller(e.target.value)} placeholder="e.g. Alex" onKeyDown={e => e.key === "Enter" && addTicket()} />
          </div>
          <div>
            <label>Amount (€)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" min="0" step="0.25" onKeyDown={e => e.key === "Enter" && addTicket()} />
          </div>
        </div>
        <div className={styles.formFull}>
          <label>Item / product</label>
          <input value={item} onChange={e => setItem(e.target.value)} placeholder="e.g. Painted mug" onKeyDown={e => e.key === "Enter" && addTicket()} />
        </div>
        <div className={styles.formFooter}>
          {adding && <span className={styles.spinner}>Syncing...</span>}
          <button className={`${styles.btn} ${styles.primary}`} onClick={addTicket} disabled={adding}>
            Add ticket
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
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, seller or item..."
        />
        <button className={`${styles.btn} ${styles.exportBtn}`} onClick={exportCSV} style={{ marginLeft: "auto" }}>
          Export CSV
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th><th>Parent</th><th>Seller</th><th>Item</th><th>Amount</th><th>Time</th><th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => (
              <tr key={t.id}>
                <td className={styles.ticketNum}>#{t.id}</td>
                <td className={styles.bold}>{t.parent}</td>
                <td>{t.seller}</td>
                <td className={styles.muted}>{t.item}</td>
                <td className={styles.amount}>€{Number(t.amount).toFixed(2)}</td>
                <td className={styles.timeCell}>{t.time}</td>
                <td>
                  <button className={`${styles.btn} ${styles.dangerBtn}`} onClick={() => deleteTicket(t.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🎨</div>
            No tickets yet — add the first one above!
          </div>
        )}
        {tickets.length > 1 && (
          <div className={styles.clearAllRow}>
            <button className={`${styles.btn} ${styles.dangerBtn}`} onClick={clearAll}>
              Delete all tickets
            </button>
          </div>
        )}
      </div>

      {confirmOpen && (
        <div className={styles.overlay} onClick={() => setConfirmOpen(false)}>
          <div className={styles.confirmBox} onClick={e => e.stopPropagation()}>
            <h3 className={styles.confirmBoxTitle}>{confirmTitle}</h3>
            <p className={styles.confirmBoxMsg}>{confirmMsg}</p>
            <div className={styles.confirmActions}>
              <button className={styles.btn} onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button className={`${styles.btn} ${styles.dangerBtn}`} onClick={confirmAction}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
