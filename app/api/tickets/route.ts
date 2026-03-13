import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const SHEET_NAME = "Tickets";

function getAuth() {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

  if (!privateKey || !clientEmail) {
    throw new Error("Missing Google credentials in environment variables.");
  }

  return new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function getSheet() {
  const auth = getAuth();
  const authClient = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: authClient });
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("Missing GOOGLE_SHEET_ID");
  return { sheets, sheetId };
}

async function ensureHeader(sheets: any, sheetId: string) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${SHEET_NAME}!A1:F1`,
    });
    if (!res.data.values || res.data.values.length === 0) {
      console.log("[Sheets] Creating header row...");
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: "RAW",
        requestBody: {
          values: [["#", "Parent", "Seller", "Item", "Amount (€)", "Time"]],
        },
      });
      console.log("[Sheets] Header row created successfully");
    }
  } catch (err: any) {
    console.error("[Sheets] Error ensuring header:", err.message);
    throw err;
  }
}

// GET — fetch all tickets
export async function GET() {
  try {
    console.log("[Sheets] GET /api/tickets - Fetching tickets...");
    const { sheets, sheetId } = await getSheet();
    console.log("[Sheets] Connected to sheet:", sheetId);

    await ensureHeader(sheets, sheetId);

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${SHEET_NAME}!A2:F`,
    });

    const rows = res.data.values || [];
    console.log(`[Sheets] Retrieved ${rows.length} tickets from sheet`);

    const tickets = rows.map((row: string[]) => ({
      id: row[0],
      parent: row[1],
      seller: row[2],
      item: row[3],
      amount: parseFloat(row[4]) || 0,
      time: row[5],
    }));

    return NextResponse.json({ tickets });
  } catch (err: any) {
    console.error("[Sheets] GET error:", err.message, err.code || "");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — add, delete, or clear
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("[Sheets] POST /api/tickets - Action:", body.action);

    const { sheets, sheetId } = await getSheet();
    console.log("[Sheets] Connected to sheet:", sheetId);

    await ensureHeader(sheets, sheetId);

    if (body.action === "add") {
      console.log("[Sheets] Adding ticket:", {
        id: body.id,
        parent: body.parent,
        seller: body.seller,
        item: body.item,
        amount: body.amount,
      });

      const appendRes = await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${SHEET_NAME}!A:F`,
        valueInputOption: "RAW",
        requestBody: {
          values: [
            [
              body.id,
              body.parent,
              body.seller,
              body.item,
              body.amount,
              body.time,
            ],
          ],
        },
      });

      console.log(
        "[Sheets] Ticket added successfully. Updates:",
        appendRes.data.updates,
      );
      return NextResponse.json({
        status: "ok",
        updates: appendRes.data.updates,
      });
    }

    if (body.action === "delete") {
      console.log("[Sheets] Deleting ticket with ID:", body.id);

      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${SHEET_NAME}!A:A`,
      });

      const rows = res.data.values || [];
      const rowIndex = rows.findIndex(
        (r: string[]) => String(r[0]) === String(body.id),
      );

      if (rowIndex > 0) {
        console.log("[Sheets] Found ticket at row:", rowIndex);

        const sheetMeta = await sheets.spreadsheets.get({
          spreadsheetId: sheetId,
        });
        const sheet = sheetMeta.data.sheets?.find(
          (s: any) => s.properties?.title === SHEET_NAME,
        );
        const sheetGid = sheet?.properties?.sheetId ?? 0;

        const batchRes = await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [
              {
                deleteDimension: {
                  range: {
                    sheetId: sheetGid,
                    dimension: "ROWS",
                    startIndex: rowIndex,
                    endIndex: rowIndex + 1,
                  },
                },
              },
            ],
          },
        });

        console.log(
          "[Sheets] Ticket deleted successfully. Replies:",
          batchRes.data.replies,
        );
      } else {
        console.warn("[Sheets] Ticket not found for ID:", body.id);
      }

      return NextResponse.json({ status: "ok" });
    }

    if (body.action === "clear") {
      console.log("[Sheets] Clearing all tickets");

      const clearRes = await sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: `${SHEET_NAME}!A2:F`,
      });

      console.log(
        "[Sheets] All tickets cleared successfully. Cleared range:",
        clearRes.data.clearedRange,
      );
      return NextResponse.json({ status: "ok" });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("[Sheets] POST error:", err.message, err.code || "");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
