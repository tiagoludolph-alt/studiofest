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
  const sheets = google.sheets({ version: "v4", auth });
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("Missing GOOGLE_SHEET_ID");
  return { sheets, sheetId };
}

async function ensureHeader(sheets: any, sheetId: string) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${SHEET_NAME}!A1:F1`,
  });
  if (!res.data.values || res.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [["#", "Parent", "Seller", "Item", "Amount (€)", "Time"]] },
    });
  }
}

// GET — fetch all tickets
export async function GET() {
  try {
    const { sheets, sheetId } = await getSheet();
    await ensureHeader(sheets, sheetId);
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${SHEET_NAME}!A2:F`,
    });
    const rows = res.data.values || [];
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — add, delete, or clear
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sheets, sheetId } = await getSheet();
    await ensureHeader(sheets, sheetId);

    if (body.action === "add") {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${SHEET_NAME}!A:F`,
        valueInputOption: "RAW",
        requestBody: {
          values: [[body.id, body.parent, body.seller, body.item, body.amount, body.time]],
        },
      });
      return NextResponse.json({ status: "ok" });
    }

    if (body.action === "delete") {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${SHEET_NAME}!A:A`,
      });
      const rows = res.data.values || [];
      const rowIndex = rows.findIndex((r: string[]) => String(r[0]) === String(body.id));
      if (rowIndex > 0) {
        const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
        const sheet = sheetMeta.data.sheets?.find(
          (s: any) => s.properties?.title === SHEET_NAME
        );
        const sheetGid = sheet?.properties?.sheetId ?? 0;
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [{
              deleteDimension: {
                range: { sheetId: sheetGid, dimension: "ROWS", startIndex: rowIndex, endIndex: rowIndex + 1 },
              },
            }],
          },
        });
      }
      return NextResponse.json({ status: "ok" });
    }

    if (body.action === "clear") {
      await sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: `${SHEET_NAME}!A2:F`,
      });
      return NextResponse.json({ status: "ok" });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
