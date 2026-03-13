# Studio Fest Tracker — Setup Guide

## What you need
- A Google account
- A GitHub account (free) — github.com
- A Vercel account (free) — vercel.com

---

## Step 1 — Create your Google Sheet

1. Go to sheets.new to create a new blank spreadsheet
2. Name it "Studio Fest" (click the title at the top)
3. Copy the Sheet ID from the URL — it's the long string between /d/ and /edit
   Example: https://docs.google.com/spreadsheets/d/THIS_PART_HERE/edit
   Save this — you'll need it later

---

## Step 2 — Set up Google Cloud & create a Service Account

1. Go to console.cloud.google.com
2. Click "Select a project" at the top → "New Project"
3. Name it "studiofest" → click "Create"
4. Make sure your new project is selected in the top dropdown

### Enable the Google Sheets API
5. In the search bar at the top, search "Google Sheets API"
6. Click on it → click "Enable"

### Create a Service Account
7. In the left sidebar go to: IAM & Admin → Service Accounts
8. Click "+ Create Service Account"
9. Name it "studiofest-tracker" → click "Create and Continue"
10. For the role, choose "Editor" → click "Continue" → click "Done"

### Get the credentials key
11. Click on the service account you just created
12. Go to the "Keys" tab
13. Click "Add Key" → "Create new key"
14. Choose "JSON" → click "Create"
15. A JSON file will download — keep this safe, you'll need it in a moment

---

## Step 3 — Share your Google Sheet with the service account

1. Open the JSON file you downloaded — find the "client_email" field
   It looks like: studiofest-tracker@yourproject.iam.gserviceaccount.com
2. Go back to your Google Sheet
3. Click "Share" (top right)
4. Paste the client_email address into the share box
5. Set permission to "Editor"
6. Uncheck "Notify people" → click "Share"

---

## Step 4 — Push the code to GitHub

1. Go to github.com → click "New" to create a new repository
2. Name it "studiofest-tracker" → set it to Public → click "Create repository"
3. Upload all the project files:
   - Click "uploading an existing file"
   - Drag in the entire studiofest folder contents
   - Click "Commit changes"

---

## Step 5 — Deploy to Vercel

1. Go to vercel.com → sign up / log in with your GitHub account
2. Click "Add New Project"
3. Find and import your "studiofest-tracker" repo
4. Vercel will detect it's a Next.js project automatically
5. Before clicking Deploy, click "Environment Variables" and add these 3 variables:

   Variable 1:
   Name:  GOOGLE_SERVICE_ACCOUNT_EMAIL
   Value: (the client_email from your JSON file)
          e.g. studiofest-tracker@yourproject.iam.gserviceaccount.com

   Variable 2:
   Name:  GOOGLE_PRIVATE_KEY
   Value: (the private_key from your JSON file — copy the ENTIRE value including
          -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY-----)
   IMPORTANT: Copy it exactly as it appears in the JSON file, with \n characters

   Variable 3:
   Name:  GOOGLE_SHEET_ID
   Value: (the Sheet ID you copied in Step 1)

6. Click "Deploy"
7. Wait ~1 minute — Vercel will give you a live URL like https://studiofest-tracker.vercel.app

---

## Step 6 — Test it

1. Open your Vercel URL
2. Add a test ticket — you should see "Synced with Google Sheets" in green
3. Open your Google Sheet — the ticket should appear as a new row

---

## Updating the app later

If you need to make changes:
1. Edit the files on GitHub directly (click the file → pencil icon)
2. Vercel automatically redeploys within ~1 minute

---

## Troubleshooting

"Could not load — check your env vars"
→ Double-check your 3 environment variables in Vercel. Go to your project → Settings → Environment Variables

"Sync failed"
→ Make sure you shared the Google Sheet with the service account email (Step 3)

Private key errors
→ In Vercel, make sure the GOOGLE_PRIVATE_KEY value includes the full key with \n characters
   Some people need to wrap it in double quotes in Vercel

Sheet not updating
→ Make sure the service account has "Editor" access to the sheet, not just "Viewer"
