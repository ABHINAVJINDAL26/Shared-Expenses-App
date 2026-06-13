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
