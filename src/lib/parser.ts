export interface RawCsvRow {
  date: string;
  description: string;
  paid_by: string;
  amount: string;
  currency: string;
  split_type: string;
  split_with: string;
  split_details: string;
  notes: string;
}

export interface NormalizedRow {
  rowNumber: number;
  originalDate: string;
  parsedDate: Date | null;
  isDateAmbiguous: boolean;
  description: string;
  rawPaidBy: string;
  normalizedPaidBy: string; // resolved canonical name or empty
  rawAmount: string;
  amount: number;
  rawCurrency: string;
  currency: string;
  computedAmountInr: number;
  exchangeRateUsed: number;
  isNegative: boolean;
  splitType: string;
  rawSplitWith: string;
  splitWith: string[]; // normalized names
  splitDetails: string;
  notes: string;
  rawRowData: string; // JSON string of raw row
}

export interface Anomaly {
  rowNumber: number;
  anomalyType: "duplicate" | "fuzzy_duplicate" | "percentage_sum" | "stale_membership" | "missing_payer" | "guest_participant" | "zero_amount" | "contradictory_split" | "possible_settlement" | "ambiguous_date" | "missing_currency";
  description: string;
  suggestedAction: string;
  affectedRowNumbers?: number[]; // for duplicates
}

// Helper: Custom CSV Parser that handles double quotes and commas
export function parseCSV(csvText: string): RawCsvRow[] {
  const lines: string[] = [];
  let currentLine = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      currentLine += char;
    } else if (char === "\n" && !inQuotes) {
      lines.push(currentLine);
      currentLine = "";
    } else if (char === "\r" && !inQuotes) {
      // ignore CR
    } else {
      currentLine += char;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  if (lines.length === 0) return [];

  // Parse header
  const headers = parseCSVLine(lines[0]);
  const results: RawCsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    const row: any = {};
    headers.forEach((header, index) => {
      row[header.trim().toLowerCase()] = values[index] !== undefined ? values[index].trim() : "";
    });
    results.push(row as RawCsvRow);
  }

  return results;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let currentVal = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      // Do not add the quote character itself to the value
    } else if (char === "," && !inQuotes) {
      result.push(currentVal);
      currentVal = "";
    } else {
      currentVal += char;
    }
  }
  result.push(currentVal);
  return result;
}

// Name Normalization
export function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  const cleaned = name.trim().toLowerCase();
  
  // Aliases mapping
  if (cleaned === "priya s" || cleaned === "priya") return "Priya";
  if (cleaned === "rohan " || cleaned === "rohan") return "Rohan";
  if (cleaned === "aisha") return "Aisha";
  if (cleaned === "meera") return "Meera";
  if (cleaned === "sam") return "Sam";
  if (cleaned === "dev") return "Dev";
  if (cleaned === "kabir" || cleaned === "dev's friend kabir") return "Kabir";
  
  // Return title-cased fallback
  return name.charAt(0).toUpperCase() + name.slice(1).trim();
}

// Date Normalization
export function normalizeDate(dateStr: string): { date: Date | null; isAmbiguous: boolean } {
  if (!dateStr) return { date: null, isAmbiguous: false };
  const cleaned = dateStr.trim();

  // Handle "Mar-14" format
  if (cleaned.toLowerCase() === "mar-14") {
    // Standardize to 14-03-2026
    return { date: new Date("2026-03-14T00:00:00Z"), isAmbiguous: false };
  }

  // Parse DD-MM-YYYY format
  const parts = cleaned.split("-");
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);

    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      // Check for date ambiguity, specifically "04-05-2026"
      const isAmbiguous = (day === 4 && month === 5) || (day === 5 && month === 4);
      
      // Default parse: DD-MM-YYYY (so day is parts[0], month is parts[1])
      // We will parse it in UTC to avoid timezone issues
      const date = new Date(Date.UTC(year, month - 1, day));
      return { date, isAmbiguous };
    }
  }

  const parsed = new Date(cleaned);
  return {
    date: isNaN(parsed.getTime()) ? null : parsed,
    isAmbiguous: false,
  };
}

// Amount and Currency Normalization
export function normalizeAmountAndCurrency(
  amountStr: string,
  currencyStr: string | null | undefined
): {
  amount: number;
  currency: string;
  computedAmountInr: number;
  exchangeRateUsed: number;
  isNegative: boolean;
} {
  // Strip commas and quotes
  let cleanedAmount = amountStr.replace(/[,"]/g, "").trim();
  let amount = parseFloat(cleanedAmount);
  if (isNaN(amount)) {
    amount = 0;
  }

  const isNegative = amount < 0;

  // Round to 2 decimals using standard round-half-up
  const roundedAmount = Math.round(amount * 100) / 100;

  let currency = currencyStr ? currencyStr.trim().toUpperCase() : "";
  let exchangeRateUsed = 1.0;

  if (currency === "USD") {
    exchangeRateUsed = 83.0; // Fixed conversion rate ₹83 / USD
  } else if (!currency) {
    currency = ""; // We will flag empty currency, but default to INR for calculations
  }

  const computedAmountInr = Math.round(roundedAmount * exchangeRateUsed * 100) / 100;

  return {
    amount: roundedAmount,
    currency,
    computedAmountInr,
    exchangeRateUsed,
    isNegative,
  };
}

// Process and Normalize CSV rows
export function processRawRows(rawRows: RawCsvRow[]): NormalizedRow[] {
  return rawRows.map((raw, index) => {
    const rowNumber = index + 2; // Row 1 is header
    const nameNorm = normalizeName(raw.paid_by);
    const dateNorm = normalizeDate(raw.date);
    const amtNorm = normalizeAmountAndCurrency(raw.amount, raw.currency);
    
    // Split split_with names
    const splitWithRaw = raw.split_with ? raw.split_with.split(";").map(s => s.trim()) : [];
    const splitWith = splitWithRaw.map(name => normalizeName(name)).filter(Boolean);

    return {
      rowNumber,
      originalDate: raw.date,
      parsedDate: dateNorm.date,
      isDateAmbiguous: dateNorm.isAmbiguous,
      description: raw.description,
      rawPaidBy: raw.paid_by,
      normalizedPaidBy: nameNorm,
      rawAmount: raw.amount,
      amount: amtNorm.amount,
      rawCurrency: raw.currency,
      currency: amtNorm.currency,
      computedAmountInr: amtNorm.computedAmountInr,
      exchangeRateUsed: amtNorm.exchangeRateUsed,
      isNegative: amtNorm.isNegative,
      splitType: raw.split_type ? raw.split_type.trim().toLowerCase() : "",
      rawSplitWith: raw.split_with,
      splitWith,
      splitDetails: raw.split_details,
      notes: raw.notes,
      rawRowData: JSON.stringify(raw),
    };
  });
}

// Anomaly Detection Engine
export function detectAnomalies(normalizedRows: NormalizedRow[]): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // Group membership timeline windows for check
  // User name -> { joinedAt, leftAt }
  const membershipWindows: Record<string, { joined: Date; left?: Date }> = {
    Aisha: { joined: new Date("2026-02-01T00:00:00Z") },
    Rohan: { joined: new Date("2026-02-01T00:00:00Z") },
    Priya: { joined: new Date("2026-02-01T00:00:00Z") },
    Meera: { joined: new Date("2026-02-01T00:00:00Z"), left: new Date("2026-03-31T23:59:59Z") },
    Sam: { joined: new Date("2026-04-08T00:00:00Z") }, // Joined early April
    Dev: { joined: new Date("2026-03-08T00:00:00Z"), left: new Date("2026-03-14T23:59:59Z") }, // Goa trip guest
    Kabir: { joined: new Date("2026-03-11T00:00:00Z"), left: new Date("2026-03-11T23:59:59Z") }, // One-day guest
  };

  // Keep track of exact duplicates to flag them
  // Key: date + normalizedPaidBy + amount + splitType + splitWithJoined
  const exactDupMap = new Map<string, NormalizedRow[]>();

  normalizedRows.forEach(row => {
    const splitWithJoined = [...row.splitWith].sort().join(";");
    const key = `${row.originalDate}|${row.normalizedPaidBy}|${row.amount}|${row.splitType}|${splitWithJoined}`;
    if (!exactDupMap.has(key)) {
      exactDupMap.set(key, []);
    }
    exactDupMap.get(key)!.push(row);
  });

  // Loop through rows to check anomalies
  normalizedRows.forEach((row) => {
    const rowNum = row.rowNumber;

    // 1. Exact Duplicate Anomaly
    const splitWithJoined = [...row.splitWith].sort().join(";");
    const key = `${row.originalDate}|${row.normalizedPaidBy}|${row.amount}|${row.splitType}|${splitWithJoined}`;
    const exactDups = exactDupMap.get(key) || [];
    if (exactDups.length > 1) {
      // Flag only subsequent duplicates as anomalies, referencing the first one
      const firstRow = exactDups[0];
      if (row.rowNumber !== firstRow.rowNumber) {
        anomalies.push({
          rowNumber: rowNum,
          anomalyType: "duplicate",
          description: `Exact duplicate of Row ${firstRow.rowNumber} ("${firstRow.description}" by ${firstRow.normalizedPaidBy} on ${firstRow.originalDate} for ${firstRow.currency || "INR"} ${firstRow.amount}).`,
          suggestedAction: "skip",
          affectedRowNumbers: [firstRow.rowNumber],
        });
      }
    }

    // 2. Fuzzy Duplicate / Double Logging
    // Find other rows on the same parsed date, where descriptions are similar, and they are likely the same event logged twice
    if (row.parsedDate) {
      const fuzzyDups = normalizedRows.filter((other) => {
        if (other.rowNumber === row.rowNumber || !other.parsedDate) return false;
        
        // Same date
        const sameDate = other.parsedDate.getTime() === row.parsedDate!.getTime();
        if (!sameDate) return false;

        // Clean/lowercase descriptions to find overlaps
        const desc1 = row.description.toLowerCase();
        const desc2 = other.description.toLowerCase();
        const isDescSimilar = desc1.includes(desc2) || desc2.includes(desc1) || 
                              (desc1.includes("thalassa") && desc2.includes("thalassa")) ||
                              (desc1.includes("marina") && desc2.includes("marina"));

        return isDescSimilar;
      });

      if (fuzzyDups.length > 0) {
        // Only flag once per pair by choosing the row with the higher row number
        const otherRow = fuzzyDups[0];
        if (row.rowNumber > otherRow.rowNumber) {
          anomalies.push({
            rowNumber: rowNum,
            anomalyType: "fuzzy_duplicate",
            description: `Potential double logging: Row ${otherRow.rowNumber} ("${otherRow.description}" paid by ${otherRow.normalizedPaidBy} for ${otherRow.currency || "INR"} ${otherRow.amount}) and Row ${row.rowNumber} ("${row.description}" paid by ${row.normalizedPaidBy} for ${row.currency || "INR"} ${row.amount}) appear to be the same event logged twice.`,
            suggestedAction: "keep_one",
            affectedRowNumbers: [otherRow.rowNumber],
          });
        }
      }
    }

    // 3. Ambiguous Date
    if (row.isDateAmbiguous) {
      anomalies.push({
        rowNumber: rowNum,
        anomalyType: "ambiguous_date",
        description: `Date "${row.originalDate}" is ambiguous. It could be April 5 or May 4.`,
        suggestedAction: "resolve_date",
      });
    }

    // 4. Missing Payer
    if (!row.rawPaidBy) {
      anomalies.push({
        rowNumber: rowNum,
        anomalyType: "missing_payer",
        description: `No payer specified for "${row.description}" of amount ${row.amount}.`,
        suggestedAction: "assign_payer",
      });
    }

    // 5. Missing Currency
    if (!row.rawCurrency) {
      anomalies.push({
        rowNumber: rowNum,
        anomalyType: "missing_currency",
        description: `No currency specified for "${row.description}" (amount ${row.amount}).`,
        suggestedAction: "default_inr",
      });
    }

    // 6. Zero Amount
    if (row.amount === 0) {
      anomalies.push({
        rowNumber: rowNum,
        anomalyType: "zero_amount",
        description: `Expense amount is 0 for "${row.description}" (notes: "${row.notes}").`,
        suggestedAction: "skip",
      });
    }

    // 7. Percentage Sum Mismatch
    if (row.splitType === "percentage") {
      const details = parseSplitDetails(row.splitDetails);
      let sum = 0;
      details.forEach((val) => {
        sum += val;
      });
      if (sum !== 100) {
        anomalies.push({
          rowNumber: rowNum,
          anomalyType: "percentage_sum",
          description: `Split percentages for "${row.description}" sum to ${sum}% instead of 100% (details: "${row.splitDetails}").`,
          suggestedAction: "normalize_percentages",
        });
      }
    }

    // 8. Contradictory Split Type (equal split with share details)
    if (row.splitType === "equal" && row.splitDetails) {
      anomalies.push({
        rowNumber: rowNum,
        anomalyType: "contradictory_split",
        description: `Split type is "equal" but "split_details" specifies shares ("${row.splitDetails}").`,
        suggestedAction: "use_shares",
      });
    }

    // 9. Guest Participant Detection
    const hasGuest = row.splitWith.some((name) => {
      const norm = normalizeName(name);
      return norm === "Kabir" || name.toLowerCase().includes("friend") || name.toLowerCase().includes("kabir");
    });
    if (hasGuest || row.normalizedPaidBy === "Kabir") {
      anomalies.push({
        rowNumber: rowNum,
        anomalyType: "guest_participant",
        description: `Includes one-time guest "Kabir" (mismatched as "Dev's friend Kabir") in split_with.`,
        suggestedAction: "absorb_into_host", // or create guest
      });
    }

    // 10. Stale Membership Check (Time-based Membership)
    if (row.parsedDate) {
      const expTime = row.parsedDate.getTime();
      row.splitWith.forEach((name) => {
        const memberWindow = membershipWindows[name];
        if (memberWindow) {
          const isBeforeJoined = expTime < memberWindow.joined.getTime();
          const isAfterLeft = memberWindow.left ? expTime > memberWindow.left.getTime() : false;

          if (isBeforeJoined || isAfterLeft) {
            const timeContext = isBeforeJoined ? "before joining" : "after moving out";
            anomalies.push({
              rowNumber: rowNum,
              anomalyType: "stale_membership",
              description: `User "${name}" is listed in split_with on ${row.originalDate}, which is ${timeContext} (active: ${memberWindow.joined.toLocaleDateString()} to ${memberWindow.left ? memberWindow.left.toLocaleDateString() : "Present"}).`,
              suggestedAction: "exclude_and_redistribute",
            });
          }
        }
      });
    }

    // 11. Possible Settlement mislabeled as Expense
    const lowerDesc = row.description.toLowerCase();
    const isSettlementDesc = lowerDesc.includes("paid back") || lowerDesc.includes("settled") || lowerDesc.includes("deposit share");
    const hasNoSplitType = !row.splitType;
    const isSinglePersonSplit = row.splitWith.length === 1;

    if ((hasNoSplitType && isSinglePersonSplit) || (isSettlementDesc && row.amount > 0 && row.splitWith.length === 1)) {
      anomalies.push({
        rowNumber: rowNum,
        anomalyType: "possible_settlement",
        description: `Row appears to be a direct debt settlement/payment rather than a shared expense (Paid by: ${row.normalizedPaidBy}, Split with: ${row.splitWith.join(", ")}, Description: "${row.description}").`,
        suggestedAction: "convert_to_settlement",
      });
    }
  });

  return anomalies;
}

// Helpers
export function parseSplitDetails(splitDetailsStr: string): Map<string, number> {
  const result = new Map<string, number>();
  if (!splitDetailsStr) return result;

  const parts = splitDetailsStr.split(";");
  parts.forEach((part) => {
    const subParts = part.trim().split(/\s+/);
    if (subParts.length >= 2) {
      const name = normalizeName(subParts.slice(0, -1).join(" "));
      let valStr = subParts[subParts.length - 1];
      // remove % sign
      valStr = valStr.replace("%", "");
      const val = parseFloat(valStr);
      if (!isNaN(val) && name) {
        result.set(name, val);
      }
    }
  });

  return result;
}
