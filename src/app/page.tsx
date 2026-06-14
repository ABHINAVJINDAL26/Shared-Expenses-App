"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

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
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"balances" | "import" | "members">("balances");
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Import State
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [stagedBatchId, setStagedBatchId] = useState<string | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [normalizedRows, setNormalizedRows] = useState<any[]>([]);
  const [decisions, setDecisions] = useState<Record<number, any>>({});
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [lastImportDetails, setLastImportDetails] = useState<{
    anomalies: Anomaly[];
    decisions: Record<number, any>;
    summary: ImportReport;
  } | null>(null);

  // Balances State
  const [pairwiseBalances, setPairwiseBalances] = useState<PairwiseBalance[]>([]);
  const [traces, setTraces] = useState<Record<string, TraceItem[]>>({});
  const [selectedTraceKey, setSelectedTraceKey] = useState<string | null>(null);
  const [balancesCount, setBalancesCount] = useState({ expenses: 0, settlements: 0 });

  // Modals Visibility
  const [isSettlementOpen, setIsSettlementOpen] = useState(false);
  const [isExpenseOpen, setIsExpenseOpen] = useState(false);
  const [isGroupOpen, setIsGroupOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isEditMemberTimelineOpen, setIsEditMemberTimelineOpen] = useState(false);

  // Form States
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState({
    description: "",
    amount: "",
    currency: "INR",
    exchangeRateUsed: "1.00",
    paidById: "",
    splitType: "equal",
    expenseDate: new Date().toISOString().substring(0, 10),
    splits: {} as Record<string, string>, // userId -> checked/amount/pct/share
    notes: "",
  });

  const [settleForm, setSettleForm] = useState({
    toUserId: "",
    amount: "",
    currency: "INR",
    note: "",
  });

  const [groupForm, setGroupForm] = useState({
    name: "",
    memberUserIds: [] as string[],
  });

  const [addMemberForm, setAddMemberForm] = useState({
    userName: "",
    email: "",
    isGuest: false,
    joinedAt: new Date().toISOString().substring(0, 10),
    leftAt: "",
  });

  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [memberTimelineForm, setMemberTimelineForm] = useState({
    joinedAt: "",
    leftAt: "",
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch Session User
  const checkSession = async () => {
    try {
      const res = await fetch("/api/auth/session");
      const data = await res.json();
      if (data.user) {
        setCurrentUser(data.user);
      } else {
        router.push("/login");
      }
    } catch (err) {
      router.push("/login");
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Fetch initial users and groups
  const fetchData = async (targetGroupId?: string) => {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      setUsers(data.users || []);
      setGroups(data.groups || []);
      
      if (data.groups && data.groups.length > 0) {
        const defaultGroupId = targetGroupId || selectedGroupId || data.groups[0].id;
        setSelectedGroupId(defaultGroupId);
      }
    } catch (err) {
      console.error("Failed to fetch metadata:", err);
    }
  };

  // Fetch balances for selected group
  const fetchBalances = async () => {
    if (!selectedGroupId) return;
    try {
      const res = await fetch(`/api/balances?groupId=${selectedGroupId}`);
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
    checkSession();
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchData();
    }
  }, [currentUser]);

  useEffect(() => {
    if (selectedGroupId) {
      fetchBalances();
    }
  }, [selectedGroupId]);

  const activeGroup = groups.find((g) => g.id === selectedGroupId);

  // Handle Logout
  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  // Handle file select & trigger upload/parse
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile || !selectedGroupId) return;

    setFile(selectedFile);
    setIsUploading(true);
    setImportReport(null);
    setLastImportDetails(null);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("groupId", selectedGroupId);

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
          if (a.anomalyType === "duplicate" || a.anomalyType === "zero_amount") {
            initialDecisions[a.rowNumber] = { action: "skip" };
          } else if (a.anomalyType === "fuzzy_duplicate") {
            initialDecisions[a.rowNumber] = { action: "skip" };
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
            const rawDate = a.rawRowData.date || "";
            const isMay4 = rawDate.startsWith("04-05");
            initialDecisions[a.rowNumber] = {
              action: "resolve_date",
              resolvedDate: isMay4 ? "2026-05-04" : "2026-04-05",
            };
          } else if (a.anomalyType === "missing_payer") {
            initialDecisions[a.rowNumber] = {
              action: "assign_payer",
              payerName: "Rohan",
            };
          } else {
            initialDecisions[a.rowNumber] = { action: "import" };
          }
        });
        setDecisions(initialDecisions);
      } else {
        alert("Upload error: " + (data.error || "Unknown error"));
        setFile(null);
      }
    } catch (err: any) {
      alert("Network error parsing CSV: " + err.message);
      setFile(null);
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
    if (!stagedBatchId || isSaving) return;
    setIsSaving(true);

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
        setLastImportDetails({
          anomalies,
          decisions,
          summary: data.summary,
        });
        setStagedBatchId(null);
        setAnomalies([]);
        setNormalizedRows([]);
        setFile(null);
        
        await fetchBalances();
        await fetchData();
      } else {
        alert("Import confirmation failed: " + data.error);
      }
    } catch (err: any) {
      alert("Network error confirming import: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Submit manual settlement
  const handleManualSettlementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedGroupId || isSaving) return;
    setIsSaving(true);

    try {
      const res = await fetch("/api/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: selectedGroupId,
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
    } finally {
      setIsSaving(false);
    }
  };

  // Helper: check if group member is active on chosen date
  const isMemberActiveOnDate = (m: GroupMember, dateStr: string) => {
    const dateVal = new Date(dateStr + "T00:00:00Z");
    const joined = new Date(m.joinedAt);
    const left = m.leftAt ? new Date(m.leftAt) : null;
    return dateVal >= joined && (!left || dateVal <= left);
  };

  // Get active members on the chosen expense date
  const getActiveTimelineMembers = () => {
    if (!activeGroup) return [];
    return activeGroup.members.filter((m) =>
      isMemberActiveOnDate(m, expenseForm.expenseDate)
    );
  };

  // Initialize splits on Form
  const initFormSplits = (type: string, activeMembersList: GroupMember[]) => {
    const defaultSplits: Record<string, string> = {};
    activeMembersList.forEach((m) => {
      if (type === "equal") {
        defaultSplits[m.userId] = "true"; // checkbox checked
      } else if (type === "percentage") {
        defaultSplits[m.userId] = (100 / activeMembersList.length).toFixed(1);
      } else if (type === "share") {
        defaultSplits[m.userId] = "1";
      } else if (type === "unequal") {
        defaultSplits[m.userId] = "0";
      }
    });
    setExpenseForm((prev) => ({
      ...prev,
      splitType: type,
      splits: defaultSplits,
    }));
  };

  // Open Expense Modal (Add Mode)
  const openAddExpense = () => {
    if (!currentUser || !selectedGroupId || !activeGroup) return;
    setEditingExpenseId(null);
    const today = new Date().toISOString().substring(0, 10);
    const activeMembers = activeGroup.members.filter((m) =>
      isMemberActiveOnDate(m, today)
    );

    const defaultSplits: Record<string, string> = {};
    activeMembers.forEach((m) => {
      defaultSplits[m.userId] = "true";
    });

    setExpenseForm({
      description: "",
      amount: "",
      currency: "INR",
      exchangeRateUsed: "1.00",
      paidById: currentUser.id,
      splitType: "equal",
      expenseDate: today,
      splits: defaultSplits,
      notes: "",
    });
    setIsExpenseOpen(true);
  };

  // Open Expense Modal (Edit Mode)
  const openEditExpense = async (expenseId: string) => {
    try {
      const res = await fetch(`/api/expenses/${expenseId}`);
      const data = await res.json();

      if (data.success && data.expense) {
        const exp = data.expense;
        setEditingExpenseId(expenseId);

        const loadedSplits: Record<string, string> = {};
        exp.splits.forEach((s: any) => {
          if (exp.splitType === "equal") {
            loadedSplits[s.userId] = "true";
          } else {
            loadedSplits[s.userId] = s.shareValue.toString();
          }
        });

        setExpenseForm({
          description: exp.description,
          amount: exp.amount.toString(),
          currency: exp.currency,
          exchangeRateUsed: exp.exchangeRateUsed.toString(),
          paidById: exp.paidById,
          splitType: exp.splitType,
          expenseDate: new Date(exp.expenseDate).toISOString().substring(0, 10),
          splits: loadedSplits,
          notes: exp.notes || "",
        });
        setIsExpenseOpen(true);
      } else {
        alert("Failed to load expense details.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Delete Expense
  const handleDeleteExpense = async (expenseId: string) => {
    if (!confirm("Are you sure you want to delete this expense? This action cannot be undone.")) return;

    try {
      const res = await fetch(`/api/expenses/${expenseId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        await fetchBalances();
      } else {
        alert("Failed to delete expense: " + data.error);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Save manual Expense (Add or Edit)
  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupId || isSaving) return;
    setIsSaving(true);

    const amt = parseFloat(expenseForm.amount);
    if (isNaN(amt) || amt <= 0) {
      alert("Please enter a valid positive amount");
      return;
    }

    const activeMembers = getActiveTimelineMembers();
    const splitsPayload = activeMembers
      .filter((m) => {
        if (expenseForm.splitType === "equal") {
          return expenseForm.splits[m.userId] === "true";
        }
        return true;
      })
      .map((m) => {
        let shareValue = 1.0;
        if (expenseForm.splitType === "percentage") {
          shareValue = parseFloat(expenseForm.splits[m.userId]) || 0;
        } else if (expenseForm.splitType === "share") {
          shareValue = parseFloat(expenseForm.splits[m.userId]) || 0;
        } else if (expenseForm.splitType === "unequal") {
          shareValue = parseFloat(expenseForm.splits[m.userId]) || 0;
        }
        return {
          userId: m.userId,
          shareValue,
        };
      });

    if (splitsPayload.length === 0) {
      alert("At least one member must be selected in the split");
      return;
    }

    // Front-end percentage validation
    if (expenseForm.splitType === "percentage") {
      const sum = splitsPayload.reduce((s, split) => s + split.shareValue, 0);
      if (Math.abs(sum - 100) > 0.1) {
        alert(`Split percentages must sum to exactly 100%. (Current sum is ${sum}%)`);
        return;
      }
    }

    // Front-end unequal sum validation
    if (expenseForm.splitType === "unequal") {
      const rate = expenseForm.currency === "USD" ? parseFloat(expenseForm.exchangeRateUsed) || 83 : 1;
      const amountInr = amt * rate;
      const sum = splitsPayload.reduce((s, split) => s + split.shareValue, 0);
      if (Math.abs(sum - amountInr) > 1.00) {
        alert(`Split amounts (₹${sum.toFixed(2)}) must sum to total amount in INR (₹${amountInr.toFixed(2)}).`);
        return;
      }
    }

    const payload = {
      groupId: selectedGroupId,
      description: expenseForm.description,
      amount: amt,
      currency: expenseForm.currency,
      exchangeRateUsed: parseFloat(expenseForm.exchangeRateUsed) || 1.00,
      paidById: expenseForm.paidById,
      splitType: expenseForm.splitType,
      expenseDate: expenseForm.expenseDate,
      splits: splitsPayload,
      notes: expenseForm.notes,
    };

    try {
      const url = editingExpenseId ? `/api/expenses/${editingExpenseId}` : "/api/expenses";
      const method = editingExpenseId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setIsExpenseOpen(false);
        setEditingExpenseId(null);
        await fetchBalances();
      } else {
        alert("Failed to save expense: " + data.error);
      }
    } catch (err: any) {
      alert("Network error saving expense: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Save manual Group
  const handleGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupForm.name || isSaving) return;
    setIsSaving(true);

    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(groupForm),
      });
      const data = await res.json();

      if (data.success && data.group) {
        setIsGroupOpen(false);
        setGroupForm({ name: "", memberUserIds: [] });
        await fetchData(data.group.id);
      } else {
        alert("Failed to create group: " + data.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  // Save manual Group Member Add
  const handleAddMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupId || !addMemberForm.userName || isSaving) return;
    setIsSaving(true);

    try {
      const res = await fetch(`/api/groups/${selectedGroupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName: addMemberForm.userName,
          email: addMemberForm.email,
          isGuest: addMemberForm.isGuest,
          joinedAt: addMemberForm.joinedAt,
          leftAt: addMemberForm.leftAt || null,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setIsAddMemberOpen(false);
        setAddMemberForm({ userName: "", email: "", isGuest: false, joinedAt: new Date().toISOString().substring(0, 10), leftAt: "" });
        await fetchData();
      } else {
        alert("Failed to add member: " + data.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  // Save Member Timeline Date Edit
  const handleUpdateMemberTimelineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupId || !selectedMemberId || isSaving) return;
    setIsSaving(true);

    try {
      const res = await fetch(`/api/groups/${selectedGroupId}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupMemberId: selectedMemberId,
          joinedAt: memberTimelineForm.joinedAt,
          leftAt: memberTimelineForm.leftAt || null,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setIsEditMemberTimelineOpen(false);
        setSelectedMemberId("");
        await fetchData();
        await fetchBalances();
      } else {
        alert("Failed to update membership: " + data.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate Net User Balance
  const calculateNetUserBalance = () => {
    if (!currentUser) return 0;
    let net = 0;
    pairwiseBalances.forEach((b) => {
      if (b.toUserId === currentUser.id) {
        net += b.amount;
      } else if (b.fromUserId === currentUser.id) {
        net -= b.amount;
      }
    });
    return Math.round(net * 100) / 100;
  };

  const currentNetBalance = calculateNetUserBalance();

  // Filter balance nets to show relationships with logged-in user
  const filteredPairwiseBalances = pairwiseBalances.filter((b) => {
    if (!currentUser) return true;
    return b.fromUserId === currentUser.id || b.toUserId === currentUser.id;
  });

  if (isAuthLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", backgroundColor: "var(--bg-primary)" }}>
        <div className="logo-icon" style={{ animation: "pulse 1.5s infinite" }}>S</div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Header Bar */}
      <header className="header">
        <div className="logo-container">
          <div className="logo-icon">S</div>
          <h1 className="logo-text">Splitwise Pro</h1>
        </div>

        <div className="header-right">
          {/* Group Switcher Selector */}
          <div className="header-group-switcher">
            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Active Group:</span>
            <select
              className="select-input"
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <button 
              className="btn btn-secondary" 
              style={{ padding: "0.45rem 0.75rem", fontSize: "0.8rem" }}
              onClick={() => setIsGroupOpen(true)}
            >
              + Add Group
            </button>
          </div>

          {/* User Profile Info & Logout */}
          {currentUser && (
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div className="active-user-pill">
                <span className="user-indicator-dot"></span>
                <span style={{ fontWeight: 600 }}>{currentUser.name}</span>
              </div>
              <button className="btn btn-secondary" style={{ padding: "0.45rem 0.75rem", fontSize: "0.8rem" }} onClick={handleLogout}>
                Logout
              </button>
            </div>
          )}
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

              {/* Action Buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1.5rem" }}>
                <button 
                  className="btn btn-primary" 
                  style={{ width: "100%" }}
                  onClick={openAddExpense}
                >
                  + Add Shared Expense
                </button>
                <button 
                  className="btn btn-secondary" 
                  style={{ width: "100%" }}
                  onClick={() => {
                    if (currentUser) {
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
                        const currentUserPaid = item.payerId === currentUser?.id;
                        
                        let displayPrefix = "";
                        let displayColor = "var(--text-primary)";
                        
                        if (isSettlement) {
                          if (currentUserPaid) {
                            displayPrefix = "+";
                            displayColor = "var(--success)";
                          } else {
                            displayPrefix = "-";
                            displayColor = "var(--danger)";
                          }
                        } else {
                          if (currentUserPaid) {
                            displayPrefix = "+";
                            displayColor = "var(--success)";
                          } else {
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
                            
                            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                              <div className="trace-amount-details" style={{ textAlign: "right" }}>
                                <span className="trace-computed-val" style={{ color: displayColor }}>
                                  {displayPrefix}₹{item.yourShare.toLocaleString()}
                                </span>
                                <span className="trace-raw-val">
                                  Total: {item.amountInr !== item.yourShare ? `₹${item.amountInr.toLocaleString()}` : "direct"}
                                </span>
                              </div>

                              {/* Manual CRUD Action Buttons */}
                              {!isSettlement && (
                                <div style={{ display: "flex", gap: "0.25rem" }}>
                                  <button 
                                    className="btn btn-secondary" 
                                    style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                                    onClick={() => openEditExpense(item.id)}
                                  >
                                    Edit
                                  </button>
                                  <button 
                                    className="btn btn-secondary" 
                                    style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", background: "rgba(239, 68, 68, 0.15)", color: "var(--danger)" }}
                                    onClick={() => handleDeleteExpense(item.id)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
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
            {!stagedBatchId && !importReport && (
              <div className="card" style={{ padding: "3rem" }}>
                <h2 style={{ textAlign: "center", marginBottom: "1.5rem", fontFamily: "var(--font-display)" }}>
                  Import Expenses Export CSV
                </h2>
                <p style={{ color: "var(--text-secondary)", textAlign: "center", maxWidth: "600px", margin: "0 auto 2rem" }}>
                  Upload the roommate's spreadsheet. Our engine will detect duplicate entries, ambiguous dates, stale memberships, negative refund calculations, and percentage mismatches, surfacing them for your review.
                </p>

                <div 
                  className="upload-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="upload-icon">📁</div>
                  <h3>{isUploading ? "Processing..." : "Select expenses_export.csv File"}</h3>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Upload file as-is. Relational SQL staging wizard will load issues.
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

            {/* Show Staged Resolution Wizard */}
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
                          
                          {/* Case A: Duplicates */}
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
                                {activeGroup?.members.map(m => (
                                  <option key={m.userId} value={m.user.name}>{m.user.name}</option>
                                ))}
                              </select>
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
                    disabled={isSaving}
                  >
                    {isSaving ? "Importing..." : "Resolve & Import Staged Rows"}
                  </button>
                </div>
              </div>
            )}

            {/* Show Import Report on completion */}
            {importReport && (
              <div className="card printable-section" style={{ borderLeft: "4px solid var(--success)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <h2 style={{ fontSize: "1.4rem", color: "var(--success)", fontFamily: "var(--font-display)" }}>
                    ✓ CSV Import Report Generated
                  </h2>
                  <button 
                    className="btn btn-secondary"
                    style={{ fontSize: "0.8rem", padding: "0.45rem 0.85rem" }}
                    onClick={() => window.print()}
                  >
                    Print / Export PDF
                  </button>
                </div>
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

                {/* Detailed Anomaly Audit Log */}
                {lastImportDetails && lastImportDetails.anomalies.length > 0 && (
                  <div style={{ marginTop: "2rem", overflowX: "auto" }}>
                    <h3 style={{ fontSize: "1.1rem", marginBottom: "1rem", fontFamily: "var(--font-display)" }}>Anomaly Resolution Log</h3>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid var(--border-color)", textAlign: "left" }}>
                          <th style={{ padding: "0.75rem" }}>Row</th>
                          <th style={{ padding: "0.75rem" }}>Expense Name</th>
                          <th style={{ padding: "0.75rem" }}>Detected Issue</th>
                          <th style={{ padding: "0.75rem" }}>Applied Action</th>
                          <th style={{ padding: "0.75rem", textAlign: "right" }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lastImportDetails.anomalies.map((a) => {
                          const decision = lastImportDetails.decisions[a.rowNumber] || { action: "import" };
                          const isSkipped = decision.action === "skip";
                          
                          return (
                            <tr key={a.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                              <td style={{ padding: "0.75rem", fontWeight: 600 }}>{a.rowNumber}</td>
                              <td style={{ padding: "0.75rem", color: "var(--text-primary)" }}>{a.rawRowData.description}</td>
                              <td style={{ padding: "0.75rem" }}>{a.description}</td>
                              <td style={{ padding: "0.75rem", fontFamily: "monospace" }}>{decision.action.toUpperCase()}</td>
                              <td style={{ padding: "0.75rem", textAlign: "right", color: isSkipped ? "var(--text-muted)" : "var(--success)" }}>
                                {isSkipped ? "Skipped" : "Resolved"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div style={{ display: "flex", gap: "1rem", marginTop: "2rem" }} className="print-hide">
                  <button 
                    className="btn btn-primary"
                    onClick={() => {
                      setImportReport(null);
                      setLastImportDetails(null);
                      setActiveTab("balances");
                    }}
                  >
                    View Updated Balances
                  </button>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => {
                      setImportReport(null);
                      setLastImportDetails(null);
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.35rem", fontFamily: "var(--font-display)" }}>
                Group Membership Timeline
              </h2>
              <button 
                className="btn btn-primary" 
                style={{ padding: "0.45rem 0.85rem", fontSize: "0.85rem" }}
                onClick={() => setIsAddMemberOpen(true)}
              >
                + Add Member/Guest
              </button>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "2rem" }}>
              Roommates' active periods in the flat. Expenses only apply to members during their active timeline.
            </p>

            <div className="member-timeline-list">
              {activeGroup?.members.map((m) => {
                let statusBadge = "badge-expense";
                let isMeera = m.user.name === "Meera";
                let isSam = m.user.name === "Sam";
                
                if (m.leftAt) {
                  statusBadge = "badge-anomaly";
                } else if (isSam) {
                  statusBadge = "badge-settlement";
                }

                let timeline = `Joined ${new Date(m.joinedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })} • Present`;
                if (m.leftAt) {
                  timeline = `Joined ${new Date(m.joinedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })} • Left ${new Date(m.leftAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`;
                }

                return (
                  <div key={m.id} className="member-timeline-card">
                    <div className="member-time-info">
                      <span className="user-name-highlight" style={{ fontSize: "1.1rem" }}>
                        {m.user.name} {m.user.isGuest && <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>(Guest)</span>}
                      </span>
                      <span className="member-date-range">{timeline}</span>
                    </div>
                    
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                      <span className={`badge ${statusBadge}`}>
                        {m.leftAt ? "Inactive" : m.user.isGuest ? "Guest" : "Active Member"}
                      </span>
                      <button 
                        className="btn btn-secondary"
                        style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}
                        onClick={() => {
                          setSelectedMemberId(m.id);
                          setMemberTimelineForm({
                            joinedAt: new Date(m.joinedAt).toISOString().substring(0, 10),
                            leftAt: m.leftAt ? new Date(m.leftAt).toISOString().substring(0, 10) : "",
                          });
                          setIsEditMemberTimelineOpen(true);
                        }}
                      >
                        Adjust Dates
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </main>

      {/* MODAL 1: Create Group */}
      {isGroupOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Create New Expense Group</h3>
              <button className="modal-close" onClick={() => setIsGroupOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleGroupSubmit}>
              <div className="form-group">
                <label className="form-label">Group Name:</label>
                <input 
                  type="text" 
                  className="text-input" 
                  style={{ width: "100%" }}
                  value={groupForm.name} 
                  onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} 
                  placeholder="e.g. Goa Trip 2026"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Select Members to Include:</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "150px", overflowY: "auto", padding: "0.5rem", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)" }}>
                  {users.filter(u => u.id !== currentUser?.id).map((u) => {
                    const isChecked = groupForm.memberUserIds.includes(u.id);
                    return (
                      <label key={u.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem" }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            const updated = isChecked 
                              ? groupForm.memberUserIds.filter(id => id !== u.id)
                              : [...groupForm.memberUserIds, u.id];
                            setGroupForm({ ...groupForm, memberUserIds: updated });
                          }}
                        />
                        <span>{u.name} {u.isGuest && "(Guest)"}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsGroupOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? "Creating..." : "Create Group"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Add Group Member */}
      {isAddMemberOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Add Roommate or Guest</h3>
              <button className="modal-close" onClick={() => setIsAddMemberOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleAddMemberSubmit}>
              <div className="form-group">
                <label className="form-label">Full Name:</label>
                <input 
                  type="text" 
                  className="text-input" 
                  style={{ width: "100%" }}
                  value={addMemberForm.userName} 
                  onChange={(e) => setAddMemberForm({ ...addMemberForm, userName: e.target.value })} 
                  placeholder="e.g. Abhinav"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email (Optional):</label>
                <input 
                  type="email" 
                  className="text-input" 
                  style={{ width: "100%" }}
                  value={addMemberForm.email} 
                  onChange={(e) => setAddMemberForm({ ...addMemberForm, email: e.target.value })} 
                  placeholder="e.g. abhinav@example.com"
                />
              </div>

              <div className="form-group" style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: "1rem 0" }}>
                <input 
                  type="checkbox" 
                  id="chk-guest"
                  checked={addMemberForm.isGuest} 
                  onChange={(e) => setAddMemberForm({ ...addMemberForm, isGuest: e.target.checked })}
                />
                <label htmlFor="chk-guest" className="form-label" style={{ margin: 0 }}>Mark as temporary Guest (like Kabir/Dev)</label>
              </div>

              <div className="form-group">
                <label className="form-label">Joined At Date:</label>
                <input 
                  type="date" 
                  className="text-input" 
                  style={{ width: "100%" }}
                  value={addMemberForm.joinedAt} 
                  onChange={(e) => setAddMemberForm({ ...addMemberForm, joinedAt: e.target.value })} 
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Left At Date (Leave empty if active):</label>
                <input 
                  type="date" 
                  className="text-input" 
                  style={{ width: "100%" }}
                  value={addMemberForm.leftAt} 
                  onChange={(e) => setAddMemberForm({ ...addMemberForm, leftAt: e.target.value })}
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsAddMemberOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? "Adding..." : "Add Member"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Edit Member Timeline */}
      {isEditMemberTimelineOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Adjust Active Timeline</h3>
              <button className="modal-close" onClick={() => setIsEditMemberTimelineOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleUpdateMemberTimelineSubmit}>
              <div className="form-group">
                <label className="form-label">Joined At (Timeline Start):</label>
                <input 
                  type="date" 
                  className="text-input" 
                  style={{ width: "100%" }}
                  value={memberTimelineForm.joinedAt} 
                  onChange={(e) => setMemberTimelineForm({ ...memberTimelineForm, joinedAt: e.target.value })} 
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Left At (Timeline End - Leave empty if present):</label>
                <input 
                  type="date" 
                  className="text-input" 
                  style={{ width: "100%" }}
                  value={memberTimelineForm.leftAt} 
                  onChange={(e) => setMemberTimelineForm({ ...memberTimelineForm, leftAt: e.target.value })}
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsEditMemberTimelineOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Record Direct Payment */}
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
                  {activeGroup?.members.filter(u => u.userId !== currentUser?.id).map((u) => (
                    <option key={u.id} value={u.userId}>
                      {u.user.name}
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
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "Save Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Add or Edit Manual Expense */}
      {isExpenseOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "550px" }}>
            <div className="modal-header">
              <h3>{editingExpenseId ? "Edit Expense Details" : "Log New Shared Expense"}</h3>
              <button className="modal-close" onClick={() => setIsExpenseOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleExpenseSubmit}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Description / Bill Name:</label>
                  <input 
                    type="text" 
                    className="text-input" 
                    style={{ width: "100%" }}
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                    placeholder="e.g. Grocery DMart"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Expense Date:</label>
                  <input 
                    type="date" 
                    className="text-input" 
                    style={{ width: "100%" }}
                    value={expenseForm.expenseDate}
                    onChange={(e) => {
                      const updatedDate = e.target.value;
                      // When date changes, active member list changes. Reinitialize splits for new list.
                      if (activeGroup) {
                        const activeList = activeGroup.members.filter((m) =>
                          isMemberActiveOnDate(m, updatedDate)
                        );
                        const defaultSplits: Record<string, string> = {};
                        activeList.forEach((m) => {
                          if (expenseForm.splitType === "equal") {
                            defaultSplits[m.userId] = "true";
                          } else if (expenseForm.splitType === "percentage") {
                            defaultSplits[m.userId] = (100 / activeList.length).toFixed(1);
                          } else if (expenseForm.splitType === "share") {
                            defaultSplits[m.userId] = "1";
                          } else if (expenseForm.splitType === "unequal") {
                            defaultSplits[m.userId] = "0";
                          }
                        });
                        setExpenseForm({
                          ...expenseForm,
                          expenseDate: updatedDate,
                          splits: defaultSplits,
                        });
                      }
                    }}
                    required
                  />
                </div>
              </div>

              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label">Amount:</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="text-input" 
                    style={{ width: "100%" }}
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Currency:</label>
                  <select 
                    className="select-input"
                    style={{ width: "100%" }}
                    value={expenseForm.currency}
                    onChange={(e) => setExpenseForm({ ...expenseForm, currency: e.target.value })}
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
                {expenseForm.currency === "USD" && (
                  <div className="form-group">
                    <label className="form-label">Exchange Rate (INR):</label>
                    <input 
                      type="number" 
                      step="0.01"
                      className="text-input" 
                      style={{ width: "100%" }}
                      value={expenseForm.exchangeRateUsed}
                      onChange={(e) => setExpenseForm({ ...expenseForm, exchangeRateUsed: e.target.value })}
                      placeholder="83.00"
                      required
                    />
                  </div>
                )}
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Paid By:</label>
                  <select 
                    className="select-input"
                    style={{ width: "100%" }}
                    value={expenseForm.paidById}
                    onChange={(e) => setExpenseForm({ ...expenseForm, paidById: e.target.value })}
                    required
                  >
                    {activeGroup?.members.map(m => (
                      <option key={m.userId} value={m.userId}>{m.user.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Split Method:</label>
                  <select 
                    className="select-input"
                    style={{ width: "100%" }}
                    value={expenseForm.splitType}
                    onChange={(e) => initFormSplits(e.target.value, getActiveTimelineMembers())}
                    required
                  >
                    <option value="equal">Equally (Equal)</option>
                    <option value="percentage">Percentage (%)</option>
                    <option value="share">Shares / Ratio</option>
                    <option value="unequal">Unequally (INR Amounts)</option>
                  </select>
                </div>
              </div>

              {/* Dynamic Split Splits Form List */}
              <div className="form-group" style={{ margin: "1rem 0" }}>
                <label className="form-label" style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: "0.25rem", marginBottom: "0.5rem" }}>
                  Split Allocations (Active timeline members on this date):
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "150px", overflowY: "auto", padding: "0.25rem" }}>
                  {getActiveTimelineMembers().map((m) => {
                    const isChecked = expenseForm.splits[m.userId] === "true";
                    
                    return (
                      <div key={m.userId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9rem" }}>
                        <span>{m.user.name}</span>
                        <div>
                          {expenseForm.splitType === "equal" && (
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => setExpenseForm({
                                ...expenseForm,
                                splits: {
                                  ...expenseForm.splits,
                                  [m.userId]: e.target.checked ? "true" : "false",
                                }
                              })}
                            />
                          )}

                          {expenseForm.splitType === "percentage" && (
                            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                              <input
                                type="number"
                                className="text-input"
                                style={{ width: "70px", padding: "0.25rem" }}
                                value={expenseForm.splits[m.userId] || "0"}
                                onChange={(e) => setExpenseForm({
                                  ...expenseForm,
                                  splits: {
                                    ...expenseForm.splits,
                                    [m.userId]: e.target.value,
                                  }
                                })}
                                required
                              />
                              <span>%</span>
                            </div>
                          )}

                          {expenseForm.splitType === "share" && (
                            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                              <input
                                type="number"
                                step="0.1"
                                className="text-input"
                                style={{ width: "70px", padding: "0.25rem" }}
                                value={expenseForm.splits[m.userId] || "1"}
                                onChange={(e) => setExpenseForm({
                                  ...expenseForm,
                                  splits: {
                                    ...expenseForm.splits,
                                    [m.userId]: e.target.value,
                                  }
                                })}
                                required
                              />
                              <span>shares</span>
                            </div>
                          )}

                          {expenseForm.splitType === "unequal" && (
                            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                              <span>₹</span>
                              <input
                                type="number"
                                step="0.01"
                                className="text-input"
                                style={{ width: "90px", padding: "0.25rem" }}
                                value={expenseForm.splits[m.userId] || "0"}
                                onChange={(e) => setExpenseForm({
                                  ...expenseForm,
                                  splits: {
                                    ...expenseForm.splits,
                                    [m.userId]: e.target.value,
                                  }
                                })}
                                required
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Notes / Details:</label>
                <input 
                  type="text" 
                  className="text-input" 
                  style={{ width: "100%" }}
                  value={expenseForm.notes}
                  onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                  placeholder="e.g. Dmart grocery items"
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsExpenseOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
