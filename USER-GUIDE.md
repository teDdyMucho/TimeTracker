# Timevera — User Guide

**Audience:** Build One / ARKO Joinery office staff who run the admin portal (Chanelle and the directors) and the workers who use the phone app.
**As at:** 17 October 2026 (admin portal after the October updates, mobile app 7.6).

---

## Part A — Admin portal (https://timevera.netlify.app)

### Signing in
Use your admin email and password. If you have set up an authenticator app (Settings → Security), you will also be asked for the 6-digit code from that app.

### Every day: approve attendance
1. **Attendance** shows each clock-in with the selfie, address, times and duration. Default view is today; use "All days" or a date range to see more.
2. Check the photo and location, then **Approve** or **Reject**. Only approved attendance is paid. The worker gets a notification either way.
3. Need to add or fix a record? **Add attendance** or the row's **Edit** button (admins only). Supervisors can approve and reject but cannot change times.
4. **Overtime** lists overtime requests. Approve or reject them here. Whether an approval changes pay depends on the entity's "overtime must be approved" switch (see Settings below).
5. **Leave** lists leave requests. Approved leave is sent to Xero with the next payroll push.

### Every fortnight: payroll
1. The morning after a pay period ends, a **draft pay run** is created automatically for each company and you get a "Pay run ready for review" notification (bell at the top right). If there was no approved attendance yet you get a reminder instead; approve it and click **Run now** in Settings → Automatic pay run, or create the run yourself with **+ New pay run**.
2. Open **Payroll** → **View salaries** on the run. Check each person's hours per band, unpaid breaks, allowances and gross. Add **allowances** inline if needed.
3. Approved more attendance after the run was created? Click **Recalculate** on the run.
4. **Mark reviewed**, then **Approve**.
5. **View PDF** or **CSV** if you want a copy (the CSV is your fallback if Xero is ever unavailable).
6. **Push to Xero**. Hours (and approved leave) go to Xero as draft timesheets; Xero works out the pay from each employee's pay template. The run becomes **Exported** and is locked. If the push says the hours no longer match the approved attendance, click **Recalculate** first, check the run, then push again.
7. **Verify in Xero** on the run page compares our hours per earnings rate with the Xero timesheets, and once Xero has a pay run for the period, our gross with the Xero wages.
8. In Xero: approve the timesheets and run payroll as usual.

### Reports
**Reports** shows labour cost by project (with budget variance), by employee, by business, site vs factory, and the overtime report, for any date range, with a CSV button on each table. The **Dashboard** shows this week's hours, labour cost, overtime cost and when payroll is next due.

### Setting things up
- **Employees:** invite a worker (they get an email with their login), set their hourly rate, flat rate if they have one, which companies they work for, and their **supervisor**. When you change a rate, pick the date it **applies from**: days worked before that date keep the old rate, and a pay run that spans both prices each day with the rate in force that day. Supervisors can sign in to the portal and see only their own team's attendance, overtime and leave.
- **Projects:** create projects, set a labour **budget** and dates with Edit. The list shows actual hours and cost against budget.
- **Entities → Pay settings:** ordinary hours per day, overtime tiers, Saturday / Sunday / public-holiday rates, the **unpaid meal break** (default 30 minutes when a day is longer than 5 hours) and the **"overtime must be approved"** switch (off by default: overtime is paid from hours; on: only approved overtime is paid at overtime rates).
- **Public Holidays:** Victorian holidays are loaded to the end of 2027. Add or remove dates as needed (the AFL Grand Final Friday is added once Victoria announces it).
- **Settings:** pay cycle, automatic pay run, labour-cost alert threshold and default project budget, security (2FA).

### Two-factor authentication
Settings → Security → **Set up**: scan the QR code with Google Authenticator, Microsoft Authenticator or 1Password, enter the code, done. Tick "Require an authenticator app for every admin" to make it mandatory; admins without one are sent to Settings to set it up on their next sign-in.

---

## Part B — Worker app (Timevera on iPhone / Android)

### Getting the app
iPhone: ask the office for the App Store link. Android: open https://timevera.netlify.app/install on the phone and tap the Android download, then open the file and allow installation.

### Clocking in
1. Tap **Clock In**.
2. Take your selfie. Your location and the time are recorded automatically.
3. Pick the company (if you work for both), the project (there is a search box when the list is long) and **On Site** or **Factory / Workshop**.
4. Tap **Confirm Clock In**. You will see "Clocked in — You're on the clock for …".

### During the day
- **Switch Project** if you move to another job; your hours so far go to the first project.
- Reminders: 6:50 and 7:10 in the morning if you have not clocked in, 3:07 and 3:12 pm to clock out (you can turn these off in Settings).

### Clocking out
Tap **Clock Out**. If you worked overtime, switch **Overtime worked?** on and give a reason first. You will see "Timesheet submitted — … logged". Your hours are paid once the office approves them.

### No signal?
You can still clock in and out. The app saves it on your phone and shows a yellow "saved on this phone" banner; it sends everything to the office automatically when you are back online (or tap **Sync now**). Switching projects needs a connection, so clock out and in again instead. The project list you see with no signal is the one saved from your last connection, so open the app once with signal before your first day on a new site.

- "Already clocked in" when you try to clock in with no signal: the phone still has your earlier shift open. Clock out on the Home screen first.
- A red "could not be sent" card means the office did not receive that clock-in or clock-out. Tell the office the times so they can add them, then tap **Dismiss**.

### Other things
- **Request Leave** on the home screen.
- **Messages** to chat with the office, and **Notifications** for approvals and reminders.
- **My Timesheets** (View all) shows your history with photos.
- **Settings:** profile photo, reminders on/off, Face ID / fingerprint lock, change password.

### If something goes wrong
- "Automatically clocked out": you were on the clock for 16 hours, so the app closed the shift at 16 hours. Tell your supervisor if you really worked longer.
- Forgot your password: use "Forgot password?" on the sign-in screen, or ask the office to reset it.
