import fs from "fs";
import path from "path";
import { parseCSV, processRawRows, detectAnomalies, normalizeName } from "../lib/parser";

async function runTests() {
  console.log("Running Parser and Anomaly Detection tests...");

  // Load CSV content
  const csvPath = path.resolve(__dirname, "../../Expenses Export.csv");
  if (!fs.existsSync(csvPath)) {
    console.error("Test failed: Expenses Export.csv not found at", csvPath);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  console.log("CSV content loaded successfully. Length:", csvContent.length);

  // 1. Test CSV Parser
  const rawRows = parseCSV(csvContent);
  console.log(`Parsed ${rawRows.length} rows from CSV.`);
  
  if (rawRows.length !== 42) {
    console.error(`Assertion failed: Expected 42 rows, got ${rawRows.length}`);
    process.exit(1);
  } else {
    console.log("✓ CSV parser returned correct number of rows (42).");
  }

  // 2. Test Normalization
  const normalizedRows = processRawRows(rawRows);
  
  // Test Name Normalization
  const testNames = ["Priya S", "priya", "Rohan ", "rohan", "Dev's friend Kabir"];
  const expectedNames = ["Priya", "Priya", "Rohan", "Rohan", "Kabir"];
  testNames.forEach((n, i) => {
    const norm = normalizeName(n);
    if (norm !== expectedNames[i]) {
      console.error(`Assertion failed: normalizeName(${n}) -> Expected ${expectedNames[i]}, got ${norm}`);
      process.exit(1);
    }
  });
  console.log("✓ Name normalization matches canonical mapping.");

  // Test amount commas removal (Electricity Feb amount "1,200")
  const febElectricity = normalizedRows.find(r => r.description === "Electricity Feb");
  if (!febElectricity || febElectricity.amount !== 1200) {
    console.error("Assertion failed: Electricity Feb amount should be 1200, got", febElectricity?.amount);
    process.exit(1);
  } else {
    console.log("✓ Strip commas from amount parsed successfully.");
  }

  // Test sub-paisa rounding (Cylinder refill 899.995)
  const cylinderRefill = normalizedRows.find(r => r.description === "Cylinder refill");
  if (!cylinderRefill || cylinderRefill.amount !== 900.00) {
    console.error("Assertion failed: Cylinder refill rounded amount should be 900.00, got", cylinderRefill?.amount);
    process.exit(1);
  } else {
    console.log("✓ Round sub-paisa to 2 decimals successfully.");
  }

  // Test USD conversion
  const villaBooking = normalizedRows.find(r => r.description === "Goa villa booking");
  if (!villaBooking || villaBooking.computedAmountInr !== 44820) {
    console.error("Assertion failed: Goa villa booking 540 USD * 83 -> 44820 INR, got", villaBooking?.computedAmountInr);
    process.exit(1);
  } else {
    console.log("✓ USD to INR conversion rate applied successfully.");
  }

  // 3. Run Anomaly Detection
  const anomalies = detectAnomalies(normalizedRows);
  console.log(`Detected ${anomalies.length} total anomalies in CSV.`);

  // Print list of anomalies detected for visual inspection
  console.log("\n--- Detected Anomalies Summary ---");
  anomalies.forEach((a) => {
    console.log(`Row ${a.rowNumber} [${a.anomalyType.toUpperCase()}]: ${a.description} (Suggested: ${a.suggestedAction})`);
  });
  console.log("----------------------------------\n");

  // Verify key anomalies exist
  const types = anomalies.map(a => a.anomalyType);
  
  const expectedAnomalies = [
    "duplicate",
    "fuzzy_duplicate",
    "percentage_sum",
    "stale_membership",
    "missing_payer",
    "guest_participant",
    "zero_amount",
    "contradictory_split",
    "possible_settlement",
    "ambiguous_date",
    "missing_currency"
  ];

  expectedAnomalies.forEach((type) => {
    if (!types.includes(type as any)) {
      console.error(`Assertion failed: Expected anomaly type "${type}" was NOT detected by the engine.`);
      process.exit(1);
    } else {
      console.log(`✓ Anomaly type "${type}" detected successfully.`);
    }
  });

  console.log("\nAll parser and anomaly detection tests PASSED successfully!");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
