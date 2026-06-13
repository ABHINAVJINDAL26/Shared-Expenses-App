"use client";

import { useState, useEffect, useRef } from "react";

interface User {
  id: string;
  name: string;
  email: string | null;
  isGuest: boolean;
}

interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  joinedAt: string;
  leftAt: string | null;
  user: User;
}

interface Group {
  id: string;
  name: string;
  members: GroupMember[];
}

interface PairwiseBalance {
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  amount: number;
  traceKey: string;
}

interface TraceItem {
  type: "expense" | "settlement";
  id: string;
  description: string;
  date: string;
  amountInr: number;
  paidBy: string;
  payerId: string;
  yourShare: number;
}

interface Anomaly {
  id: string;
  rowNumber: number;
  anomalyType: string;
  description: string;
  suggestedAction: string;
  rawRowData: any;
}

interface ImportReport {
  totalProcessed: number;
  cleanImportsCount: number;
  resolvedAnomaliesCount: number;
  skippedCount: number;
  expensesCreated: number;
  settlementsCreated: number;
}

export default function SharedExpensesDashboard() {
  const [activeTab, setActiveTab] = useState<"balances" | "import" | "members">("balances");
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Import State
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [stagedBatchId, setStagedBatchId] = useState<string | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [normalizedRows, setNormalizedRows] = useState<any[]>([]);
  const [decisions, setDecisions] = useState<Record<number, any>>({});
  const [importReport, setImportReport] = useState<ImportReport | null>(null);

  // Balances State
  const [pairwiseBalances, setPairwiseBalances] = useState<PairwiseBalance[]>([]);
  const [traces, setTraces] = useState<Record<string, TraceItem[]>>({});
  const [selectedTraceKey, setSelectedTraceKey] = useState<string | null>(null);
  const [balancesCount, setBalancesCount] = useState({ expenses: 0, settlements: 0 });

  // Manual Settlement Modal
  const [isSettlementOpen, setIsSettlementOpen] = useState(false);
  const [settleForm, setSettleForm] = useState({
    toUserId: "",
    amount: "",
    currency: "INR",
    note: "",
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch initial users and groups
  const fetchData = async () => {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (data.users && data.users.length > 0) {
        setUsers(data.users);
        setGroups(data.groups || []);
        
        // Default current user to Aisha (not guest)
        const defaultUser = data.users.find((u: any) => u.name === "Aisha") || data.users[0];
        setCurrentUser(defaultUser);
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    }
  };

  // Fetch balances
  const fetchBalances = async () => {
    try {
      const res = await fetch("/api/balances");
      const data = await res.json();
      if (data.success) {
        setPairwiseBalances(data.pairwiseBalances || []);
        setTraces(data.traces || {});
        setBalancesCount({
          expenses: data.expensesCount,
          settlements: data.settlementsCount,
        });
        
        // Auto-select first trace if available
        if (data.pairwiseBalances && data.pairwiseBalances.length > 0) {
          setSelectedTraceKey(data.pairwiseBalances[0].traceKey);
        } else {
          setSelectedTraceKey(null);
        }
      }
    } catch (err) {
      console.error("Failed to fetch balances:", err);
    }
  };

  useEffect(() => {
    fetchData();
    fetchBalances();
  }, []);

  // Handle file select & trigger upload/parse
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsUploading(true);
    setImportReport(null);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        setStagedBatchId(data.importBatchId);
        setAnomalies(data.anomalies || []);
        setNormalizedRows(data.normalizedRows || []);
        
        // Initialize decisions with suggested actions
        const initialDecisions: Record<number, any> = {};
        data.anomalies.forEach((a: Anomaly) => {
          // Defaults based on suggested actions
          if (a.anomalyType === "duplicate" || a.anomalyType === "zero_amount") {
            initialDecisions[a.rowNumber] = { action: "skip" };
          } else if (a.anomalyType === "fuzzy_duplicate") {
            initialDecisions[a.rowNumber] = { action: "skip" }; // keep first, skip second
          } else if (a.anomalyType === "percentage_sum") {
            initialDecisions[a.rowNumber] = { action: "normalize_percentages" };
          } else if (a.anomalyType === "stale_membership") {
            initialDecisions[a.rowNumber] = { action: "exclude_and_redistribute" };
          } else if (a.anomalyType === "guest_participant") {
            initialDecisions[a.rowNumber] = { action: "absorb_into_host" };
          } else if (a.anomalyType === "possible_settlement") {
            initialDecisions[a.rowNumber] = { action: "convert_to_settlement" };
          } else if (a.anomalyType === "missing_currency") {
            initialDecisions[a.rowNumber] = { action: "default_inr" };
          } else if (a.anomalyType === "contradictory_split") {
            initialDecisions[a.rowNumber] = { action: "use_shares" };
          } else if (a.anomalyType === "ambiguous_date") {
            // Pick April 5 (2026-04-05) for 05-04-2026, May 4 (2026-05-04) for 04-05-2026
            const rawDate = a.rawRowData.date || "";
            const isMay4 = rawDate.startsWith("04-05");
            initialDecisions[a.rowNumber] = {
              action: "resolve_date",
              resolvedDate: isMay4 ? "2026-05-04" : "2026-04-05",
            };
          } else if (a.anomalyType === "missing_payer") {
            initialDecisions[a.rowNumber] = {
              action: "assign_payer",
              payerName: "Rohan", // Default fallback assign
            };
          } else {
            initialDecisions[a.rowNumber] = { action: "import" };
          }
        });
        setDecisions(initialDecisions);
      } else {
        alert("Upload error: " + (data.error || "Unknown error"));
      }
    } catch (err: any) {
      alert("Network error parsing CSV: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  // Update specific anomaly decision
  const handleDecisionChange = (rowNumber: number, field: string, value: any) => {
    setDecisions((prev) => ({
      ...prev,
      [rowNumber]: {
        ...prev[rowNumber],
        [field]: value,
      },
    }));
  };

  // Confirm Import Batch
  const handleConfirmImport = async () => {
    if (!stagedBatchId) return;

    try {
      const res = await fetch("/api/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          importBatchId: stagedBatchId,
          normalizedRows,
          decisions,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setImportReport(data.summary);
        setStagedBatchId(null);
        setAnomalies([]);
        setNormalizedRows([]);
        setFile(null);
        
        // Refresh Balances & Users list
        await fetchBalances();
        await fetchData();
      } else {
        alert("Import confirmation failed: " + data.error);
      }
    } catch (err: any) {
      alert("Network error confirming import: " + err.message);
    }
  };

  // Submit manual settlement
  const handleManualSettlementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    try {
      const res = await fetch("/api/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromUserId: currentUser.id,
          toUserId: settleForm.toUserId,
          amount: parseFloat(settleForm.amount),
          currency: settleForm.currency,
          note: settleForm.note,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setIsSettlementOpen(false);
        setSettleForm({ toUserId: "", amount: "", currency: "INR", note: "" });
        await fetchBalances();
      } else {
        alert("Failed to save settlement: " + data.error);
      }
    } catch (err: any) {
      alert("Network error: " + err.message);
    }
  };

  // Filter pairwise balances to only show relationships affecting the current active user (Sam/Meera check)
  const filteredPairwiseBalances = pairwiseBalances.filter((b) => {
    if (!currentUser) return true;
    return b.fromUserId === currentUser.id || b.toUserId === currentUser.id;
  });

  // Calculate Net balance summary for current switched user
  const calculateNetUserBalance = () => {
    if (!currentUser) return 0;
    let net = 0;
    pairwiseBalances.forEach((b) => {
      if (b.toUserId === currentUser.id) {
        net += b.amount; // someone owes current user
      } else if (b.fromUserId === currentUser.id) {
        net -= b.amount; // current user owes someone
      }
    });
    return Math.round(net * 100) / 100;
  };

  const currentNetBalance = calculateNetUserBalance();

  return (
    <div className="app-container">
      {/* Header Bar */}
      <header className="header">
        <div className="logo-container">
          <div className="logo-icon">S</div>
          <h1 className="logo-text">Splitwise Pro</h1>
        </div>

        {/* Switched Identity Selector */}
        <div className="user-selector">
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Active Identity:</span>
          {currentUser && (
            <div className="active-user-pill">
              <span className="user-indicator-dot"></span>
              <span style={{ fontWeight: 600 }}>{currentUser.name}</span>
            </div>
          )}
          <select
            className="select-input"
            value={currentUser?.id || ""}
            onChange={(e) => {
              const matched = users.find((u) => u.id === e.target.value);
              if (matched) {
                setCurrentUser(matched);
                // Clear trace key on switch so it refreshes
                setSelectedTraceKey(null);
              }
            }}
          >
            {users.filter(u => !u.isGuest).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Main Dashboard Container */}
      <main className="main-content">
        
        {/* Switched User Info Row */}
        {currentUser && (
          <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderLeft: "4px solid var(--accent-teal)" }}>
            <div>
              <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Logged-in User</span>
              <h2 style={{ fontSize: "1.6rem", fontWeight: 700, margin: "0.15rem 0" }}>{currentUser.name}</h2>
              <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                Active Window: {currentUser.name === "Meera" ? "Feb 1 - Mar 31, 2026" : currentUser.name === "Sam" ? "Apr 8, 2026 - Present" : "Feb 1, 2026 - Present"}
              </p>
            </div>
            
            <div style={{ textAlign: "right" }}>
              <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Net Balance</span>
              <div 
                style={{ 
                  fontSize: "2rem", 
                  fontWeight: 800, 
                  color: currentNetBalance > 0 ? "var(--success)" : currentNetBalance < 0 ? "var(--danger)" : "var(--text-secondary)" 
                }}
              >
                {currentNetBalance > 0 ? `+₹${currentNetBalance.toLocaleString()}` : currentNetBalance < 0 ? `-₹${Math.abs(currentNetBalance).toLocaleString()}` : "₹0.00"}
              </div>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                {currentNetBalance > 0 ? "you are owed" : currentNetBalance < 0 ? "you owe total" : "settled up"}
              </span>
            </div>
          </div>
        )}

        {/* Global Tabs */}
        <div className="tabs-container">
          <button 
            className={`tab-btn ${activeTab === "balances" ? "active" : ""}`}
            onClick={() => setActiveTab("balances")}
          >
            Balances & Trace
          </button>
          <button 
            className={`tab-btn ${activeTab === "import" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("import");
              setImportReport(null);
            }}
          >
            Smart CSV Importer
          </button>
          <button 
            className={`tab-btn ${activeTab === "members" ? "active" : ""}`}
            onClick={() => setActiveTab("members")}
          >
            Group Members
          </button>
        </div>

        {/* TABS CONTENT */}

        {/* Tab 1: Balances & Trace */}
        {activeTab === "balances" && (
          <div className="balance-summary-grid">
            {/* Pairwise Debt Nets (Aisha's requirement) */}
            <div className="card">
              <div className="card-title">
                <h3>Balances Summary</h3>
                <span className="badge badge-expense" style={{ fontSize: "0.8rem" }}>
                  {balancesCount.expenses} Expenses | {balancesCount.settlements} Payments
                </span>
              </div>

              {filteredPairwiseBalances.length === 0 ? (
                <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-secondary)" }}>
                  <p>All settled up! No active debts found for {currentUser?.name}.</p>
                  <button 
                    className="btn btn-secondary" 
                    style={{ marginTop: "1rem" }}
                    onClick={() => {
                      // switch to another user to see if they have balances
                      const other = users.find(u => u.id !== currentUser?.id && !u.isGuest);
                      if (other) setCurrentUser(other);
                    }}
                  >
                    Switch Identity
                  </button>
                </div>
              ) : (
                <div className="pairwise-list">
                  {filteredPairwiseBalances.map((b) => {
                    const isSelected = selectedTraceKey === b.traceKey;
                    return (
                      <div 
                        key={b.traceKey} 
                        className={`pairwise-item ${isSelected ? "selected" : ""}`}
                        onClick={() => setSelectedTraceKey(b.traceKey)}
                      >
                        <div className="pairwise-direction">
                          <span className="user-name-highlight">
                            {b.fromUserId === currentUser?.id ? `You owe ${b.toUserName}` : `${b.fromUserName} owes You`}
                          </span>
                          <span className="direction-text">
                            Click to drill-down trace
                          </span>
                        </div>
                        <div 
                          className="pairwise-amount"
                          style={{ color: b.fromUserId === currentUser?.id ? "var(--danger)" : "var(--success)" }}
                        >
                          ₹{b.amount.toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Record manual settlement button */}
              <button 
                className="btn btn-primary" 
                style={{ width: "100%", marginTop: "1.5rem" }}
                onClick={() => {
                  if (currentUser) {
                    // Prepopulate modal
                    const firstDebt = filteredPairwiseBalances[0];
                    let defaultToUserId = "";
                    if (firstDebt) {
                      defaultToUserId = firstDebt.fromUserId === currentUser.id ? firstDebt.toUserId : firstDebt.fromUserId;
                    }
                    setSettleForm({
                      toUserId: defaultToUserId || users.find(u => u.id !== currentUser.id)?.id || "",
                      amount: "",
                      currency: "INR",
                      note: "",
                    });
                    setIsSettlementOpen(true);
                  }
                }}
              >
                Record Payment / Settle Debt
              </button>
            </div>

            {/* Trace Drilldown (Rohan's requirement) */}
            <div className="card">
              <div className="trace-container">
                {selectedTraceKey && traces[selectedTraceKey] ? (
                  <>
                    <div className="trace-header">
                      <h3>Math Trace / Explanation</h3>
                      <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                        Drill-down breakdown of individual shared items contributing to this balance.
                      </p>
                    </div>

                    <div className="trace-items-list">
                      {traces[selectedTraceKey].map((item) => {
                        const isSettlement = item.type === "settlement";
                        
                        // Check if current user is the payer of this trace item
                        const currentUserPaid = item.payerId === currentUser?.id;
                        
                        // Formatting positive/negative impact
                        // If it's an expense and current user paid: they are owed +share
                        // If it's an expense and other user paid: they owe -share
                        // If it's a settlement and current user sent: reduces debt +settle
                        // If it's a settlement and other user sent: reduces debt -settle
                        let displayPrefix = "";
                        let displayColor = "var(--text-primary)";
                        
                        if (isSettlement) {
                          if (currentUserPaid) {
                            // You sent payment -> reduces what you owe
                            displayPrefix = "+";
                            displayColor = "var(--success)";
                          } else {
                            // They sent payment -> reduces what they owe you
                            displayPrefix = "-";
                            displayColor = "var(--danger)";
                          }
                        } else {
                          if (currentUserPaid) {
                            // You paid -> other owes you their share
                            displayPrefix = "+";
                            displayColor = "var(--success)";
                          } else {
                            // They paid -> you owe your share
                            displayPrefix = "-";
                            displayColor = "var(--danger)";
                          }
                        }

                        return (
                          <div key={item.id} className="trace-card">
                            <div className="trace-info">
                              <span className="trace-title">{item.description}</span>
                              <div className="trace-meta">
                                <span>{item.date}</span>
                                <span>Paid by {item.paidBy}</span>
                                <span className={`badge ${isSettlement ? "badge-settlement" : "badge-expense"}`}>
                                  {isSettlement ? "Payment" : "Expense"}
                                </span>
                              </div>
                            </div>
                            
                            <div className="trace-amount-details">
                              <span className="trace-computed-val" style={{ color: displayColor }}>
                                {displayPrefix}₹{item.yourShare.toLocaleString()}
                              </span>
                              <span className="trace-raw-val">
                                Total: {item.amountInr !== item.yourShare ? `₹${item.amountInr.toLocaleString()}` : "direct"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: "center", padding: "6rem 2rem", color: "var(--text-muted)" }}>
                    <p style={{ fontSize: "1.2rem", fontWeight: 600 }}>No Balance Item Selected</p>
                    <p style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
                      Select a pairwise balance from the left panel to drill down into the transaction log.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Smart CSV Importer */}
        {activeTab === "import" && (
          <div className="wizard-container">
            {/* Show Upload Dropzone if no batch is active */}
            {!stagedBatchId && !importReport && (
              <div className="card" style={{ padding: "3rem" }}>
                <h2 style={{ textAlign: "center", marginBottom: "1.5rem", fontFamily: "var(--font-display)" }}>
                  Import Expenses Export CSV
                </h2>
                <p style={{ color: "var(--text-secondary)", textAlign: "center", maxWidth: "600px", margin: "0 auto 2rem" }}>
                  Upload the roommate's messy spreadsheet. Our engine will detect duplicate entries, ambiguous dates, stale memberships, negative refund calculations, and percentage mismatches, surfacing them for your review.
                </p>

                <div 
                  className="upload-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="upload-icon">📁</div>
                  <h3>{isUploading ? "Processing..." : "Select expenses_export.csv File"}</h3>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Upload file as-is without hand edits. Only relational SQL staging will be used.
                  </p>
                  <input
                    type="file"
                    accept=".csv"
                    ref={fileInputRef}
                    style={{ display: "none" }}
                    onChange={handleFileChange}
                    disabled={isUploading}
                  />
                </div>
              </div>
            )}

            {/* Show Staged Resolution Wizard if batch is parsed */}
            {stagedBatchId && anomalies.length > 0 && (
              <div className="card">
                <div className="card-title" style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: "1rem" }}>
                  <div>
                    <h2 style={{ fontSize: "1.35rem" }}>CSV Anomaly Resolution Wizard</h2>
                    <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                      {anomalies.length} data anomalies require review. Make your decisions below.
                    </p>
                  </div>
                  <span className="badge badge-anomaly">{anomalies.length} Flagged Issues</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginTop: "1.5rem" }}>
                  {anomalies.map((a, idx) => {
                    const rowDecision = decisions[a.rowNumber] || { action: "import" };

                    return (
                      <div key={a.id} className="card anomaly-card">
                        <div className="anomaly-header">
                          <span className="badge badge-anomaly" style={{ fontSize: "0.7rem" }}>
                            Row {a.rowNumber} • {a.anomalyType.toUpperCase().replace("_", " ")}
                          </span>
                          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                            Anomaly {idx + 1} of {anomalies.length}
                          </span>
                        </div>

                        <h4 style={{ margin: "0.25rem 0 0.5rem" }}>"{a.rawRowData.description}" - {a.rawRowData.amount} {a.rawRowData.currency || "INR"}</h4>
                        <p className="anomaly-desc">{a.description}</p>

                        <div className="anomaly-action-container">
                          {/* Resolution Form mapping to each anomaly type */}
                          
                          {/* Case A: Duplicates (Exact or Fuzzy) */}
                          {(a.anomalyType === "duplicate" || a.anomalyType === "fuzzy_duplicate") && (
                            <div className="form-group">
                              <label className="form-label">Duplicate Resolution Policy:</label>
                              <div className="radio-group">
                                <label className="radio-option">
                                  <input
                                    type="radio"
                                    name={`dec-${a.rowNumber}`}
                                    checked={rowDecision.action === "skip"}
                                    onChange={() => handleDecisionChange(a.rowNumber, "action", "skip")}
                                  />
                                  <span>Skip / Archive duplicate row (Recommended - Meera approved)</span>
                                </label>
                                <label className="radio-option">
                                  <input
                                    type="radio"
                                    name={`dec-${a.rowNumber}`}
                                    checked={rowDecision.action === "import"}
                                    onChange={() => handleDecisionChange(a.rowNumber, "action", "import")}
                                  />
                                  <span>Import duplicate anyway (Keep both rows)</span>
                                </label>
                              </div>
                            </div>
                          )}

                          {/* Case B: Stale Membership */}
                          {a.anomalyType === "stale_membership" && (
                            <div className="form-group">
                              <label className="form-label">Stale Membership Policy:</label>
                              <div className="radio-group">
                                <label className="radio-option">
                                  <input
                                    type="radio"
                                    name={`dec-${a.rowNumber}`}
                                    checked={rowDecision.action === "exclude_and_redistribute"}
                                    onChange={() => handleDecisionChange(a.rowNumber, "action", "exclude_and_redistribute")}
                                  />
                                  <span>Exclude stale member & redistribute share (Recommended - fixes Sam's complaint)</span>
                                </label>
                                <label className="radio-option">
                                  <input
                                    type="radio"
                                    name={`dec-${a.rowNumber}`}
                                    checked={rowDecision.action === "keep_as_is"}
                                    onChange={() => handleDecisionChange(a.rowNumber, "action", "keep_as_is")}
                                  />
                                  <span>Force import (Keep stale member in split)</span>
                                </label>
                                <label className="radio-option">
                                  <input
                                    type="radio"
                                    name={`dec-${a.rowNumber}`}
                                    checked={rowDecision.action === "skip"}
                                    onChange={() => handleDecisionChange(a.rowNumber, "action", "skip")}
                                  />
                                  <span>Skip this entire row</span>
                                </label>
                              </div>
                            </div>
                          )}

                          {/* Case C: Percentage Sum Mismatch */}
                          {a.anomalyType === "percentage_sum" && (
                            <div className="form-group">
                              <label className="form-label">Mismatch Resolution Policy:</label>
                              <div className="radio-group">
                                <label className="radio-option">
                                  <input
                                    type="radio"
                                    name={`dec-${a.rowNumber}`}
                                    checked={rowDecision.action === "normalize_percentages"}
                                    onChange={() => handleDecisionChange(a.rowNumber, "action", "normalize_percentages")}
                                  />
                                  <span>Rescale percentages proportionally to equal 100% (Recommended)</span>
                                </label>
                                <label className="radio-option">
                                  <input
                                    type="radio"
                                    name={`dec-${a.rowNumber}`}
                                    checked={rowDecision.action === "skip"}
                                    onChange={() => handleDecisionChange(a.rowNumber, "action", "skip")}
                                  />
                                  <span>Reject and Skip this row</span>
                                </label>
                              </div>
                            </div>
                          )}

                          {/* Case D: Missing Payer */}
                          {a.anomalyType === "missing_payer" && (
                            <div className="form-group">
                              <label className="form-label">Assign Payer:</label>
                              <select
                                className="select-input"
                                style={{ width: "200px" }}
                                value={rowDecision.payerName || "Rohan"}
                                onChange={(e) => handleDecisionChange(a.rowNumber, "payerName", e.target.value)}
                              >
                                <option value="Aisha">Aisha</option>
                                <option value="Rohan">Rohan</option>
                                <option value="Priya">Priya</option>
                                <option value="Meera">Meera</option>
                              </select>
                              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                                Select who paid for this expense.
                              </span>
                            </div>
                          )}

                          {/* Case E: Guest Participant */}
                          {a.anomalyType === "guest_participant" && (
                            <div className="form-group">
                              <label className="form-label">Guest Participant Policy:</label>
                              <div className="radio-group">
                                <label className="radio-option">
                                  <input
                                    type="radio"
                                    name={`dec-${a.rowNumber}`}
                                    checked={rowDecision.action === "absorb_into_host"}
                                    onChange={() => handleDecisionChange(a.rowNumber, "action", "absorb_into_host")}
                                  />
                                  <span>Absorb Kabir's share into Dev's share (Recommended - Dev's host responsibility)</span>
                                </label>
                                <label className="radio-option">
                                  <input
                                    type="radio"
                                    name={`dec-${a.rowNumber}`}
                                    checked={rowDecision.action === "create_guest"}
                                    onChange={() => handleDecisionChange(a.rowNumber, "action", "create_guest")}
                                  />
                                  <span>Create a guest record for Kabir (splits debt directly with Kabir)</span>
                                </label>
                              </div>
                            </div>
                          )}

                          {/* Case F: Possible Settlement */}
                          {a.anomalyType === "possible_settlement" && (
                            <div className="form-group">
                              <label className="form-label">Transaction Mapping Choice:</label>
                              <div className="radio-group">
                                <label className="radio-option">
                                  <input
                                    type="radio"
                                    name={`dec-${a.rowNumber}`}
                                    checked={rowDecision.action === "convert_to_settlement"}
                                    onChange={() => handleDecisionChange(a.rowNumber, "action", "convert_to_settlement")}
                                  />
                                  <span>Import as a Settlement/Payment (Recommended - nets balance without creating split)</span>
                                </label>
                                <label className="radio-option">
                                  <input
                                    type="radio"
                                    name={`dec-${a.rowNumber}`}
                                    checked={rowDecision.action === "import"}
                                    onChange={() => handleDecisionChange(a.rowNumber, "action", "import")}
                                  />
                                  <span>Import as a standard Shared Expense</span>
                                </label>
                              </div>
                            </div>
                          )}

                          {/* Case G: Ambiguous Date */}
                          {a.anomalyType === "ambiguous_date" && (
                            <div className="form-group">
                              <label className="form-label">Resolve Ambiguous Date:</label>
                              <div className="radio-group">
                                <label className="radio-option">
                                  <input
                                    type="radio"
                                    name={`dec-${a.rowNumber}`}
                                    checked={rowDecision.resolvedDate === "2026-04-05"}
                                    onChange={() => handleDecisionChange(a.rowNumber, "resolvedDate", "2026-04-05")}
                                  />
                                  <span>April 5, 2026 (DD-MM-YYYY standard entry)</span>
                                </label>
                                <label className="radio-option">
                                  <input
                                    type="radio"
                                    name={`dec-${a.rowNumber}`}
                                    checked={rowDecision.resolvedDate === "2026-05-04"}
                                    onChange={() => handleDecisionChange(a.rowNumber, "resolvedDate", "2026-05-04")}
                                  />
                                  <span>May 4, 2026 (MM-DD-YYYY alternate format entry)</span>
                                </label>
                              </div>
                            </div>
                          )}

                          {/* Case H: Missing Currency */}
                          {a.anomalyType === "missing_currency" && (
                            <div className="form-group">
                              <label className="form-label">Currency Resolution Policy:</label>
                              <div className="radio-group">
                                <label className="radio-option">
                                  <input
                                    type="radio"
                                    name={`dec-${a.rowNumber}`}
                                    checked={rowDecision.action === "default_inr"}
                                    onChange={() => handleDecisionChange(a.rowNumber, "action", "default_inr")}
                                  />
                                  <span>Default to INR (Recommended)</span>
                                </label>
                                <label className="radio-option">
                                  <input
                                    type="radio"
                                    name={`dec-${a.rowNumber}`}
                                    checked={rowDecision.action === "skip"}
                                    onChange={() => handleDecisionChange(a.rowNumber, "action", "skip")}
                                  />
                                  <span>Skip row</span>
                                </label>
                              </div>
                            </div>
                          )}

                          {/* Case I: Zero Amount */}
                          {a.anomalyType === "zero_amount" && (
                            <div className="form-group">
                              <label className="form-label">Zero Amount Resolution Policy:</label>
                              <div className="radio-group">
                                <label className="radio-option">
                                  <input
                                    type="radio"
                                    name={`dec-${a.rowNumber}`}
                                    checked={rowDecision.action === "skip"}
                                    onChange={() => handleDecisionChange(a.rowNumber, "action", "skip")}
                                  />
                                  <span>Skip importing (Recommended - Swiggy double logged fix)</span>
                                </label>
                                <label className="radio-option">
                                  <input
                                    type="radio"
                                    name={`dec-${a.rowNumber}`}
                                    checked={rowDecision.action === "import"}
                                    onChange={() => handleDecisionChange(a.rowNumber, "action", "import")}
                                  />
                                  <span>Import anyway as ₹0.00 expense</span>
                                </label>
                              </div>
                            </div>
                          )}

                          {/* Case J: Contradictory Split */}
                          {a.anomalyType === "contradictory_split" && (
                            <div className="form-group">
                              <label className="form-label">Split Details Discrepancy Policy:</label>
                              <div className="radio-group">
                                <label className="radio-option">
                                  <input
                                    type="radio"
                                    name={`dec-${a.rowNumber}`}
                                    checked={rowDecision.action === "use_shares"}
                                    onChange={() => handleDecisionChange(a.rowNumber, "action", "use_shares")}
                                  />
                                  <span>Override split type and use shares in split_details (Recommended)</span>
                                </label>
                                <label className="radio-option">
                                  <input
                                    type="radio"
                                    name={`dec-${a.rowNumber}`}
                                    checked={rowDecision.action === "use_equal"}
                                    onChange={() => handleDecisionChange(a.rowNumber, "action", "use_equal")}
                                  />
                                  <span>Ignore split_details and divide equally</span>
                                </label>
                              </div>
                            </div>
                          )}

                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: "2rem", display: "flex", justifyContent: "flex-end", gap: "1rem" }}>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => {
                      setStagedBatchId(null);
                      setAnomalies([]);
                      setNormalizedRows([]);
                      setFile(null);
                    }}
                  >
                    Cancel Upload
                  </button>
                  <button 
                    className="btn btn-primary"
                    onClick={handleConfirmImport}
                  >
                    Resolve & Import Staged Rows
                  </button>
                </div>
              </div>
            )}

            {/* Show Import Report on completion */}
            {importReport && (
              <div className="card" style={{ borderLeft: "4px solid var(--success)" }}>
                <h2 style={{ fontSize: "1.4rem", marginBottom: "1rem", color: "var(--success)", fontFamily: "var(--font-display)" }}>
                  ✓ CSV Import Report Generated
                </h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
                  The data import batch has been committed. All user decisions were applied, and the pairwise database balances have been updated.
                </p>

                <div className="grid-3" style={{ marginBottom: "2rem" }}>
                  <div className="card" style={{ background: "rgba(0,0,0,0.15)", padding: "1.25rem" }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Total CSV Rows</span>
                    <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{importReport.totalProcessed}</div>
                  </div>
                  <div className="card" style={{ background: "rgba(0,0,0,0.15)", padding: "1.25rem" }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Clean Imports</span>
                    <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--success)" }}>{importReport.cleanImportsCount}</div>
                  </div>
                  <div className="card" style={{ background: "rgba(0,0,0,0.15)", padding: "1.25rem" }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Resolved Anomalies</span>
                    <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--accent-teal)" }}>{importReport.resolvedAnomaliesCount}</div>
                  </div>
                  <div className="card" style={{ background: "rgba(0,0,0,0.15)", padding: "1.25rem" }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Skipped / Duplicates</span>
                    <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-secondary)" }}>{importReport.skippedCount}</div>
                  </div>
                  <div className="card" style={{ background: "rgba(0,0,0,0.15)", padding: "1.25rem" }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Created Expenses</span>
                    <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--accent-blue)" }}>{importReport.expensesCreated}</div>
                  </div>
                  <div className="card" style={{ background: "rgba(0,0,0,0.15)", padding: "1.25rem" }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Created Settlements</span>
                    <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--accent-purple)" }}>{importReport.settlementsCreated}</div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "1rem" }}>
                  <button 
                    className="btn btn-primary"
                    onClick={() => {
                      setImportReport(null);
                      setActiveTab("balances");
                    }}
                  >
                    View Updated Balances
                  </button>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => {
                      setImportReport(null);
                    }}
                  >
                    Import Another File
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Group Members */}
        {activeTab === "members" && (
          <div className="card">
            <h2 style={{ fontSize: "1.35rem", marginBottom: "1rem", fontFamily: "var(--font-display)" }}>
              Group Membership Timeline
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "2rem" }}>
              Roommates' active periods in the flat. Expenses only apply to members during their active timeline.
            </p>

            <div className="member-timeline-list">
              {users.map((u) => {
                let statusBadge = "badge-expense"; // default
                let timeline = "Active from Feb 1, 2026 - Present";
                
                if (u.name === "Meera") {
                  statusBadge = "badge-anomaly";
                  timeline = "Joined Feb 1, 2026 • Moved out Mar 31, 2026";
                } else if (u.name === "Sam") {
                  statusBadge = "badge-settlement";
                  timeline = "Joined Apr 8, 2026 • Present";
                } else if (u.name === "Dev") {
                  statusBadge = "badge-anomaly";
                  timeline = "Goa Trip Guest (Mar 8 - Mar 14, 2026)";
                } else if (u.name === "Kabir") {
                  statusBadge = "badge-anomaly";
                  timeline = "Parasailing Day Guest (Mar 11, 2026)";
                }

                return (
                  <div key={u.id} className="member-timeline-card">
                    <div className="member-time-info">
                      <span className="user-name-highlight" style={{ fontSize: "1.1rem" }}>
                        {u.name} {u.isGuest && <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>(Guest)</span>}
                      </span>
                      <span className="member-date-range">{timeline}</span>
                    </div>
                    <span className={`badge ${statusBadge}`}>
                      {u.name === "Meera" ? "Inactive" : u.isGuest ? "Guest" : "Active Member"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </main>

      {/* Manual Settlement / Record Payment Modal */}
      {isSettlementOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Record Direct Payment</h3>
              <button className="modal-close" onClick={() => setIsSettlementOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleManualSettlementSubmit}>
              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <span className="form-label">From:</span>
                <span style={{ fontWeight: 600, fontSize: "1.1rem" }}>{currentUser?.name} (You)</span>
              </div>

              <div className="form-group">
                <label className="form-label">To Roommate:</label>
                <select
                  className="select-input"
                  style={{ width: "100%" }}
                  value={settleForm.toUserId}
                  onChange={(e) => setSettleForm({ ...settleForm, toUserId: e.target.value })}
                  required
                >
                  <option value="" disabled>Select a roommate...</option>
                  {users.filter(u => u.id !== currentUser?.id && !u.isGuest).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Amount:</label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    type="number"
                    step="0.01"
                    className="text-input"
                    style={{ flex: 1 }}
                    value={settleForm.amount}
                    onChange={(e) => setSettleForm({ ...settleForm, amount: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                  <select
                    className="select-input"
                    value={settleForm.currency}
                    onChange={(e) => setSettleForm({ ...settleForm, currency: e.target.value })}
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description / Note:</label>
                <input
                  type="text"
                  className="text-input"
                  value={settleForm.note}
                  onChange={(e) => setSettleForm({ ...settleForm, note: e.target.value })}
                  placeholder="e.g. Paid back rent share"
                />
              </div>

              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setIsSettlementOpen(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                >
                  Save Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
