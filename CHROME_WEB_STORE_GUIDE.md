# Chrome Web Store Upload Guide

## Preparation Steps

### 1. Package Your Extension

Run the packaging script:

```powershell
npm run package
```

This will:

- Build your extension
- Copy all necessary files to `extension-package/`
- Show you next steps

### 2. Create ZIP File

Create a ZIP of the packaged extension:

```powershell
Compress-Archive -Path extension-package\* -DestinationPath lms-extension.zip -Force
```

## Chrome Web Store Submission

### Step 1: Create Developer Account

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Sign in with your Google account
3. Pay the **one-time $5 registration fee**
4. Accept the developer agreement

### Step 2: Upload Your Extension

1. Click **"New Item"** button
2. Click **"Choose file"** and upload `lms-extension.zip`
3. Chrome will validate your manifest and files
4. Click **"Upload"** after validation passes

### Step 3: Fill Store Listing

#### Required Information:

**Product Details:**

- **Name:** Bahria LMS Assignment Tracker
- **Summary:** Track assignment deadlines from Bahria University LMS with smart notifications
- **Description:** (Detailed description below)
- **Category:** Productivity
- **Language:** English

**Detailed Description:**

```
Stay on top of your Bahria University LMS assignments with smart deadline tracking and timely notifications!

✨ FEATURES:
• Automatically collect assignments from all your courses
• View all pending assignments in one clean interface
• Get reminder notifications 3 days, 2 days, and on the due date
• Assignments sorted by urgency with deadline countdown
• Modern, responsive design with orange Bahria theme
• Works entirely offline - all data stored locally

🔔 SMART NOTIFICATIONS:
• 3 days before: "Due in 3 days • Dec 3, 2025"
• 2 days before: "Due in 2 days • Dec 3, 2025"
• On due date: "Due today"
• Notifications stay visible until you dismiss them

🎯 HOW TO USE:
1. Install the extension
2. Visit lms.bahria.edu.pk and navigate to your Assignments page
3. Click the extension icon and press "Refresh"
4. Your assignments will sync across all courses
5. Get automatic reminders as deadlines approach

🔒 PRIVACY:
• All data stored locally on your device
• No external servers or data transmission
• No tracking or analytics
• Open source and transparent

📱 PERFECT FOR:
• Bahria University students
• Anyone who wants to never miss an assignment deadline
• Students managing multiple courses

Note: This is an independent tool and is not affiliated with Bahria University.
```

**Screenshots:** (You'll need to create these - see below)

- Minimum 1, recommended 3-5 screenshots
- Size: 1280x800 or 640x400 pixels
- Show: popup with assignments, notification examples, sync in action

**Icons:**

- ✅ Already configured in your manifest (16x16, 48x48, 128x128)

**Small Promo Tile (440x280):** Optional but recommended
**Marquee Promo Tile (1400x560):** Optional

#### Privacy Settings:

**Privacy Policy URL:**
Host your `PRIVACY_POLICY.md` somewhere public (GitHub Pages, personal website) and provide the URL, or paste it into the store listing.

**Single Purpose Description:**

```
Track assignment deadlines from Bahria University LMS and send reminder notifications.
```

**Permissions Justification:**
You'll need to explain each permission:

- **storage:** Store assignment data locally on the user's device
- **alarms:** Schedule reminder notifications for upcoming deadlines
- **notifications:** Display deadline reminder notifications to users
- **tabs:** Access LMS tabs to collect assignment information
- **scripting/activeTab:** Read assignment data from lms.bahria.edu.pk pages
- **host_permissions (lms.bahria.edu.pk):** Required to scrape assignment information from the university's LMS

### Step 4: Review & Submit

1. Review all information
2. Click **"Submit for review"**
3. Review process typically takes **1-3 business days**
4. You'll receive email updates on review status

## Common Review Issues to Avoid

✅ **Do:**

- Provide clear, accurate description
- Include high-quality screenshots
- Have a valid privacy policy
- Test extension thoroughly before submitting
- Justify all permissions clearly

❌ **Don't:**

- Use misleading names or descriptions
- Request unnecessary permissions
- Include obfuscated code (your code is clean!)
- Violate any Chrome Web Store policies

## After Approval

Once approved:

- Extension will be live on Chrome Web Store
- You can track installs and ratings in the dashboard
- Users can leave reviews
- You can publish updates anytime (new reviews for each update)

## Creating Screenshots

To create screenshots for the store:

1. **Load your extension** in Chrome
2. **Open the popup** (click extension icon)
3. Take screenshots showing:
   - Popup with sample assignments
   - Notification example
   - Sync process
4. Use Chrome DevTools to set popup size to 1280x800:
   - Right-click popup → Inspect
   - Toggle device toolbar (Ctrl+Shift+M)
   - Set custom size to 1280x800

Or use a screenshot tool like:

- Windows: Snipping Tool / Snip & Sketch
- PowerToys (Screen Ruler + Screenshot)
- Browser extensions like Awesome Screenshot

## Updating Your Extension

After publishing, to release updates:

1. Update version in `manifest.json` (e.g., 1.0.2 → 1.0.3)
2. Run `npm run package`
3. Create new ZIP
4. Go to developer dashboard
5. Click on your extension
6. Click "Package" → "Upload new package"
7. Upload new ZIP
8. Submit for review again

## Support & Monitoring

**Developer Dashboard:** https://chrome.google.com/webstore/devconsole

- View install statistics
- Monitor reviews and ratings
- Respond to user feedback
- Track crashes/errors

## Pricing

**One-time costs:**

- Developer registration: $5 (one-time, lifetime)

**No ongoing fees** for free extensions!

---

Good luck with your submission! 🚀
