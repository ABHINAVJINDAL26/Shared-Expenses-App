import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { parseCSV, processRawRows, detectAnomalies } from "@/lib/parser";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const csvText = await file.text();
    const rawRows = parseCSV(csvText);

    if (rawRows.length === 0) {
      return NextResponse.json({ error: "CSV file is empty" }, { status: 400 });
    }

    // Get the default group (Flat Share)
    let group = await prisma.group.findFirst();
    if (!group) {
      group = await prisma.group.create({
        data: { name: "Flat Share" },
      });
    }

    // Create an ImportBatch
    const importBatch = await prisma.importBatch.create({
      data: {
        groupId: group.id,
        filename: file.name,
        status: "pending",
      },
    });

    // Process and Normalize Rows
    const normalizedRows = processRawRows(rawRows);

    // Detect anomalies
    const anomalies = detectAnomalies(normalizedRows);

    // Store anomalies in DB
    const anomalyPromises = anomalies.map((anomaly) => {
      // Find the raw row matching the anomaly row number
      const rowData = normalizedRows.find((r) => r.rowNumber === anomaly.rowNumber);
      return prisma.importAnomaly.create({
        data: {
          importBatchId: importBatch.id,
          rowNumber: anomaly.rowNumber,
          rawRowData: rowData ? rowData.rawRowData : "",
          anomalyType: anomaly.anomalyType,
          description: anomaly.description,
          suggestedAction: anomaly.suggestedAction,
          resolved: false,
        },
      });
    });

    const savedAnomalies = await prisma.$transaction(anomalyPromises);

    return NextResponse.json({
      success: true,
      importBatchId: importBatch.id,
      filename: file.name,
      totalRows: normalizedRows.length,
      anomalies: savedAnomalies.map((sa) => ({
        id: sa.id,
        rowNumber: sa.rowNumber,
        anomalyType: sa.anomalyType,
        description: sa.description,
        suggestedAction: sa.suggestedAction,
        rawRowData: sa.rawRowData ? JSON.parse(sa.rawRowData) : {},
      })),
      normalizedRows: normalizedRows.map((nr) => ({
        rowNumber: nr.rowNumber,
        originalDate: nr.originalDate,
        parsedDate: nr.parsedDate,
        isDateAmbiguous: nr.isDateAmbiguous,
        description: nr.description,
        normalizedPaidBy: nr.normalizedPaidBy,
        amount: nr.amount,
        currency: nr.currency,
        computedAmountInr: nr.computedAmountInr,
        exchangeRateUsed: nr.exchangeRateUsed,
        splitType: nr.splitType,
        splitWith: nr.splitWith,
        splitDetails: nr.splitDetails,
        notes: nr.notes,
      })),
    });
  } catch (error: any) {
    console.error("API error /api/import:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
