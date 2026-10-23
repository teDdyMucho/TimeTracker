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
4. **Overtime** lists overtime requests. Each one shows who the worker sent it to. Only the approvers (Robbie, Mitch, Chris, Terry — set under Employees) can approve or reject, here or from the push notification on their phone; everyone else can view. Overtime is unpaid until approved: the pay run lists it as "OT awaiting approval" and pays it once approved (click Recalculate on the run after approving). The timesheet shows the approver's name and time.
5. **Download timesheets** (Attendance, above the table, and Reports): any employee or all employees, any period, as Excel, PDF or CSV.
6. **Leave** lists leave requests. Approved leave is sent to Xero with the next payroll push.

### Every fortnight: payroll
1. The morning after a pay period ends, a **draft pay run** is created automatically for each company and you get a "Pay run ready for review" notification (bell at the top right). If there was no approved attendance yet you get a reminder instead; approve it and click **Run now** in Settings → Automatic pay run, or create the run yourself with **+ New pay run**.
2. Open **Payroll** → **View salaries** on the run. Check each person's hours per band, unpaid breaks, allowances and gross. Add **allowances** inline if needed.
3. Approved more attendance after the run was created? Click **Recalculate** on the run.
4. **Mark reviewed**, then **Approve**.
5. **View PDF** or **CSV** if you want a copy (the CSV is your fallback if Xero is ever unavailable).
6. **Push to Xero**. Hours (and approved leave) go to Xero as draft timesheets; Xero works out the pay from each employee's pay template. The run becomes **Exported** and is locked. If the push says the hours no longer match the approved attendance, click **Recalculate** first, check the run, then push again. Pushing again is safe: a draft already in Xero is updated, a timesheet you have already approved or paid in Xero is left alone (it counts as done when the hours agree, and is flagged if they differ), and leave already filed is not filed twice. Someone who is not on that company's Xero payroll stops the push with "Not in … Xero payroll": either add them in Xero with the same name or email, or untick **Paid through Xero payroll** on their profile (directors, people paid another way) and they are skipped. The Xero column on the Payroll list shows the outcome in words under the status: **Synced** (everyone went through, with a summary), **Partly sent** (most went through; the people left out and why), or **Failed** (nothing was sent, and why). Fix what it names and push again.
7. **Verify in Xero** on the run page compares our hours per earnings rate with the Xero timesheets, and once Xero has a pay run for the period, our gross with the Xero wages.
8. In Xero: approve the timesheets and run payroll as usual.

### Reports
**Reports** has a tab per company (All / Build One / ARKO Joinery) and a **Pay period** picker. It shows labour cost by project (with budget variance), by employee, by business, site vs factory, **Hours by Project** (project, employee, company, regular, overtime, total — no dollar figures), **Approved Overtime** (per pay period, with who approved and when; Terry or Chanelle can run and export it) and the overtime report, with **Excel** and CSV buttons on each table. Hours count against the project worked on; wages always go to the employee's own employer. The **Dashboard** shows this week's hours, labour cost, overtime cost and when payroll is next due.

**Pay rules (fixed):** 30 minutes unpaid break on any day of 5 hours or more; 7.6 hours regular a day; anything over is overtime and stays unpaid until approved. Entities → Pay settings only holds the overtime, weekend and public-holiday multipliers.

### Setting things up
- **Employees:** invite a worker (they get an email with their login), set their hourly rate, flat rate if they have one, which companies they can clock into, their **employer** (the company whose payroll pays them, whatever project they work on), their **supervisor**, whether they **can approve overtime**, and whether they are **paid through Xero payroll** (untick for a director or anyone paid another way, so the Xero push skips them instead of failing). A person with the **Dashboard admin** badge (Chris, Robbie, Terry, Mitch, set by the developer) signs in to this dashboard with their own login and sees everything an admin sees, while staying an employee or supervisor everywhere else (pay runs, reports, the app). When you change a rate, pick the date it **applies from**: days worked before that date keep the old rate, and a pay run that spans both prices each day with the rate in force that day. Supervisors can sign in to the portal and see only their own team's attendance, overtime and leave.
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
- **Working overtime?** Switch **Overtime today?** on, give the reason, pick who should approve it (Robbie, Mitch, Chris or Terry) and tap **Send request now**. They get a notification with Approve / Reject. While your request is in, you will not be clocked out automatically at 3:06 pm.
- Reminders on work days: 6:50 and 7:10 in the morning if you have not clocked in, and 2:55 pm to clock out (you can turn these off in Settings). No reminders on Saturdays or Sundays.
- **3:06 pm rule:** anyone still clocked in at 3:06 pm with no overtime request is clocked out automatically and the day is recorded as 7:00 am – 3:06 pm.

### Clocking out
Tap **Clock Out**. If you worked overtime and have not sent a request yet, switch **Overtime today?** on, give the reason and pick the approver first; the request goes with your clock-out. You will see "Timesheet submitted — … logged". Your hours are paid once the office approves them; overtime is paid once your approver approves it (My Timesheets shows who approved it and when).

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
- "Automatically clocked out": you were still clocked in at 3:06 pm (or overnight) without an overtime request, so the day was recorded as 7:00 am – 3:06 pm. Tell the office if you really worked longer; they can correct it.
- **Approvers (Robbie, Mitch, Chris, Terry):** Home shows "overtime requests to approve"; tap it, or use the Approve / Reject buttons on the notification itself.
- Forgot your password: use "Forgot password?" on the sign-in screen, or ask the office to reset it.
