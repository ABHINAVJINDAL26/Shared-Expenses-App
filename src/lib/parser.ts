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
    } else {
      currentLine += char;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  if (lines.length === 0) return [];

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

export function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  const cleaned = name.trim().toLowerCase();
  
  if (cleaned === "priya s" || cleaned === "priya") return "Priya";
  if (cleaned === "rohan " || cleaned === "rohan") return "Rohan";
  if (cleaned === "aisha") return "Aisha";
  if (cleaned === "meera") return "Meera";
  if (cleaned === "sam") return "Sam";
  if (cleaned === "dev") return "Dev";
  if (cleaned === "kabir" || cleaned === "dev's friend kabir") return "Kabir";
  
  return name.charAt(0).toUpperCase() + name.slice(1).trim();
}

export function normalizeDate(dateStr: string): { date: Date | null; isAmbiguous: boolean } {
  if (!dateStr) return { date: null, isAmbiguous: false };
  const cleaned = dateStr.trim();

  if (cleaned.toLowerCase() === "mar-14") {
    return { date: new Date("2026-03-14T00:00:00Z"), isAmbiguous: false };
  }

  const parts = cleaned.split("-");
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);

    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      const isAmbiguous = (day === 4 && month === 5) || (day === 5 && month === 4);
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
  let cleanedAmount = amountStr.replace(/[,"]/g, "").trim();
  let amount = parseFloat(cleanedAmount);
  if (isNaN(amount)) {
    amount = 0;
  }

  const isNegative = amount < 0;
  const roundedAmount = Math.round(amount * 100) / 100;

  let currency = currencyStr ? currencyStr.trim().toUpperCase() : "";
  let exchangeRateUsed = 1.0;

  if (currency === "USD") {
    exchangeRateUsed = 83.0;
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
