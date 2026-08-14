import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'

// ── Monochrome brand palette (matches the admin) ──
const INK = '#18181B'
const MUTED = '#71717A'
const LINE = '#E4E4E7'
const BLACK = '#1C1A16'
const STONE = '#F4F4F5'

const num = (n: number) => Number(n || 0).toFixed(2)

export interface TimesheetRow {
  date: string          // e.g. "17-Jul-2026"
  clockIn: string       // e.g. "7:00 AM" or "—"
  clockOut: string
  location: string      // "Onsite" | "Offsite" | "—"
  project: string
  regularHours: number
  overtimeHours: number
  totalHours: number
}

export interface TimesheetPdfProps {
  buildOneLogo: string  // data URI
  arkoLogo: string      // data URI
  employeeName: string
  employeeEmail: string
  entityName: string
  periodLabel: string   // e.g. "17 Jul – 30 Jul 2026"
  generatedAt: string
  rows: TimesheetRow[]
}

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 52, paddingHorizontal: 34, fontSize: 8.5, color: INK, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  logoRow: { flexDirection: 'row', alignItems: 'center' },
  logoBuildOne: { height: 34, width: 136, objectFit: 'contain' },
  // ARKO logo is light-coloured — sit it on a black rounded panel so it reads.
  arkoBox: { marginLeft: 12, backgroundColor: BLACK, borderRadius: 4, paddingVertical: 5, paddingHorizontal: 8 },
  logoArko: { height: 26, width: 88, objectFit: 'contain' },
  headRight: { alignItems: 'flex-end' },
  docTitle: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: BLACK },
  meta: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  rule: { borderBottomWidth: 1.5, borderBottomColor: BLACK, marginTop: 10, marginBottom: 12 },

  empBox: { marginBottom: 12 },
  empName: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: INK },
  empSub: { fontSize: 8.5, color: MUTED, marginTop: 1 },

  thead: { flexDirection: 'row', backgroundColor: BLACK, paddingVertical: 5, paddingHorizontal: 4 },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: '#FFFFFF', textTransform: 'uppercase' },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 5, paddingHorizontal: 4, alignItems: 'center' },
  rowAlt: { backgroundColor: STONE },

  cDate: { flex: 1.4 },
  cIn: { flex: 1.1 },
  cOut: { flex: 1.1 },
  cLoc: { flex: 1.1 },
  cProj: { flex: 2.2 },
  cReg: { flex: 1, textAlign: 'right' },
  cOt: { flex: 1, textAlign: 'right' },
  cTot: { flex: 1, textAlign: 'right' },

  cellDate: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: INK },
  cell: { fontSize: 8.5, color: INK },
  cellMuted: { fontSize: 8, color: MUTED },
  cellNum: { fontSize: 8.5, textAlign: 'right' },
  cellTot: { fontSize: 8.5, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: INK },

  totalRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 4, borderTopWidth: 1.5, borderTopColor: BLACK, marginTop: 2 },
  totalLabel: { flex: 6.9, fontFamily: 'Helvetica-Bold', fontSize: 9, color: BLACK },
  totalNum: { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 9, color: BLACK },

  certify: { marginTop: 24, fontSize: 8, color: MUTED, lineHeight: 1.4 },
  sign: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 26 },
  signBox: { width: '45%' },
  signLine: { borderBottomWidth: 0.75, borderBottomColor: INK, marginBottom: 3, height: 18 },
  signLabel: { fontSize: 7.5, color: MUTED },

  footer: { position: 'absolute', bottom: 22, left: 34, right: 34, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: MUTED, borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 6 },
})

export function TimesheetPdf({
  buildOneLogo, arkoLogo, employeeName, employeeEmail, entityName, periodLabel, generatedAt, rows,
}: TimesheetPdfProps) {
  const totalReg = rows.reduce((s, r) => s + r.regularHours, 0)
  const totalOt = rows.reduce((s, r) => s + r.overtimeHours, 0)
  const totalAll = rows.reduce((s, r) => s + r.totalHours, 0)

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Header — Build One + ARKO logos side by side */}
        <View style={styles.header}>
          <View style={styles.logoRow}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {buildOneLogo ? <Image src={buildOneLogo} style={styles.logoBuildOne} /> : null}
            {arkoLogo ? (
              <View style={styles.arkoBox}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src={arkoLogo} style={styles.logoArko} />
              </View>
            ) : null}
          </View>
          <View style={styles.headRight}>
            <Text style={styles.docTitle}>Fortnightly Timesheet</Text>
            <Text style={styles.meta}>{entityName} · {periodLabel}</Text>
          </View>
        </View>
        <View style={styles.rule} />

        {/* Employee */}
        <View style={styles.empBox}>
          <Text style={styles.empName}>{employeeName}</Text>
          {employeeEmail ? <Text style={styles.empSub}>{employeeEmail}</Text> : null}
        </View>

        {/* Table head */}
        <View style={styles.thead}>
          <Text style={[styles.th, styles.cDate]}>Date</Text>
          <Text style={[styles.th, styles.cIn]}>Start</Text>
          <Text style={[styles.th, styles.cOut]}>Finish</Text>
          <Text style={[styles.th, styles.cLoc]}>Location</Text>
          <Text style={[styles.th, styles.cProj]}>Project</Text>
          <Text style={[styles.th, styles.cReg]}>Regular</Text>
          <Text style={[styles.th, styles.cOt]}>Overtime</Text>
          <Text style={[styles.th, styles.cTot]}>Total</Text>
        </View>

        {/* Rows */}
        {rows.length === 0 ? (
          <View style={styles.row}>
            <Text style={styles.cellMuted}>No timesheet records for this employee in this period.</Text>
          </View>
        ) : (
          rows.map((r, i) => (
            <View key={i} style={[styles.row, ...(i % 2 === 1 ? [styles.rowAlt] : [])]}>
              <Text style={[styles.cellDate, styles.cDate]}>{r.date}</Text>
              <Text style={[styles.cell, styles.cIn]}>{r.clockIn}</Text>
              <Text style={[styles.cell, styles.cOut]}>{r.clockOut}</Text>
              <Text style={[styles.cell, styles.cLoc]}>{r.location}</Text>
              <Text style={[styles.cell, styles.cProj]}>{r.project}</Text>
              <Text style={[styles.cellNum, styles.cReg]}>{num(r.regularHours)}</Text>
              <Text style={[styles.cellNum, styles.cOt]}>{r.overtimeHours > 0 ? num(r.overtimeHours) : '—'}</Text>
              <Text style={[styles.cellTot, styles.cTot]}>{num(r.totalHours)}</Text>
            </View>
          ))
        )}

        {/* Totals */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total Hours</Text>
          <Text style={styles.totalNum}>{num(totalReg)}</Text>
          <Text style={styles.totalNum}>{num(totalOt)}</Text>
          <Text style={styles.totalNum}>{num(totalAll)}</Text>
        </View>

        {/* Certification + signature */}
        <Text style={styles.certify}>
          I certify that the hours submitted are true and correct to the best of my knowledge.
        </Text>
        <View style={styles.sign}>
          <View style={styles.signBox}>
            <View style={styles.signLine} />
            <Text style={styles.signLabel}>Employee signature (full name)</Text>
          </View>
          <View style={styles.signBox}>
            <View style={styles.signLine} />
            <Text style={styles.signLabel}>Approved by</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>Timevera — Workforce Management</Text>
          <Text>Generated {generatedAt}</Text>
        </View>
      </Page>
    </Document>
  )
}
