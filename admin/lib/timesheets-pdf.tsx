import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

// Monochrome brand palette (matches the admin and the payroll PDF)
const INK = '#18181B'
const MUTED = '#71717A'
const LINE = '#E4E4E7'
const BLACK = '#1C1A16'

export interface TimesheetPdfRow {
  date: string
  employee: string
  company: string
  project: string
  location: string
  clockIn: string
  clockOut: string
  worked: number
  breakHours: number
  regular: number
  overtime: number
  pendingOvertime: number
  otStatus: string
  approver: string
  decidedAt: string
  attendance: string
  autoClosed: boolean
}

export interface TimesheetsPdfProps {
  heading: string
  meta: string
  generatedAt: string
  /** Rows grouped by employee (one section each). */
  sections: { title: string; rows: TimesheetPdfRow[] }[]
}

const hrs = (n: number) => {
  const total = Math.round((n || 0) * 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (total === 0) return '—'
  if (h === 0) return `${m}m`
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

const styles = StyleSheet.create({
  page: { paddingTop: 32, paddingBottom: 44, paddingHorizontal: 28, fontSize: 7.5, color: INK, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 },
  docTitle: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: BLACK },
  meta: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  rule: { borderBottomWidth: 1.5, borderBottomColor: BLACK, marginTop: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: BLACK, marginTop: 10, marginBottom: 4 },
  thead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BLACK, paddingBottom: 3, marginBottom: 1 },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 6.5, color: MUTED, textTransform: 'uppercase' },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 3.5, alignItems: 'center' },
  cDate: { width: 50 }, cCompany: { width: 58 }, cProject: { flex: 1.6 }, cLoc: { width: 40 },
  cTime: { width: 40 }, cNum: { width: 38, textAlign: 'right' }, cStatus: { width: 48 }, cApprover: { width: 74 },
  sub: { fontSize: 6.5, color: MUTED },
  subtotal: { flexDirection: 'row', paddingVertical: 4, borderTopWidth: 1, borderTopColor: LINE, marginTop: 1 },
  subtotalLabel: { flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: MUTED },
  subtotalVal: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: INK, textAlign: 'right', width: 38 },
  footer: { position: 'absolute', bottom: 18, left: 28, right: 28, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: MUTED, borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 5 },
})

export function TimesheetsPdf({ heading, meta, generatedAt, sections }: TimesheetsPdfProps) {
  const grand = sections.flatMap((s) => s.rows)
  const sum = (rows: TimesheetPdfRow[], k: keyof TimesheetPdfRow) => rows.reduce((a, r) => a + Number(r[k] || 0), 0)
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.docTitle}>{heading}</Text>
            <Text style={styles.meta}>{meta}</Text>
          </View>
          <Text style={styles.meta}>Break 30 min on days of 5 h+ · 7.6 h regular · overtime paid once approved</Text>
        </View>
        <View style={styles.rule} />

        {sections.length === 0 ? (
          <Text style={{ color: MUTED }}>No timesheets match this selection.</Text>
        ) : sections.map((sec, si) => (
          <View key={si} wrap={false}>
            <Text style={styles.sectionTitle}>{sec.title}</Text>
            <View style={styles.thead}>
              <Text style={[styles.th, styles.cDate]}>Date</Text>
              <Text style={[styles.th, styles.cCompany]}>Company</Text>
              <Text style={[styles.th, styles.cProject]}>Project</Text>
              <Text style={[styles.th, styles.cLoc]}>Where</Text>
              <Text style={[styles.th, styles.cTime]}>In</Text>
              <Text style={[styles.th, styles.cTime]}>Out</Text>
              <Text style={[styles.th, styles.cNum]}>Worked</Text>
              <Text style={[styles.th, styles.cNum]}>Break</Text>
              <Text style={[styles.th, styles.cNum]}>Regular</Text>
              <Text style={[styles.th, styles.cNum]}>Overtime</Text>
              <Text style={[styles.th, styles.cNum]}>OT pend.</Text>
              <Text style={[styles.th, styles.cStatus]}>Attendance</Text>
              <Text style={[styles.th, styles.cApprover]}>Overtime approval</Text>
            </View>
            {sec.rows.map((r, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.cDate}>{r.date}</Text>
                <Text style={styles.cCompany}>{r.company}</Text>
                <Text style={styles.cProject}>{r.project}</Text>
                <Text style={styles.cLoc}>{r.location}</Text>
                <Text style={styles.cTime}>{r.clockIn}</Text>
                <Text style={styles.cTime}>{r.clockOut}{r.autoClosed ? ' *' : ''}</Text>
                <Text style={styles.cNum}>{hrs(r.worked)}</Text>
                <Text style={styles.cNum}>{hrs(r.breakHours)}</Text>
                <Text style={styles.cNum}>{hrs(r.regular)}</Text>
                <Text style={styles.cNum}>{hrs(r.overtime)}</Text>
                <Text style={styles.cNum}>{hrs(r.pendingOvertime)}</Text>
                <Text style={styles.cStatus}>{r.attendance}</Text>
                <View style={styles.cApprover}>
                  <Text>{r.otStatus === 'none' ? '—' : r.otStatus}</Text>
                  {r.approver ? <Text style={styles.sub}>{r.approver}{r.decidedAt ? ` · ${r.decidedAt}` : ''}</Text> : null}
                </View>
              </View>
            ))}
            <View style={styles.subtotal}>
              <Text style={styles.subtotalLabel}>{sec.title} — {sec.rows.length} day{sec.rows.length === 1 ? '' : 's'}</Text>
              <Text style={styles.subtotalVal}>{hrs(sum(sec.rows, 'worked'))}</Text>
              <Text style={styles.subtotalVal}>{hrs(sum(sec.rows, 'breakHours'))}</Text>
              <Text style={styles.subtotalVal}>{hrs(sum(sec.rows, 'regular'))}</Text>
              <Text style={styles.subtotalVal}>{hrs(sum(sec.rows, 'overtime'))}</Text>
              <Text style={styles.subtotalVal}>{hrs(sum(sec.rows, 'pendingOvertime'))}</Text>
              <View style={{ width: 48 + 74 }} />
            </View>
          </View>
        ))}

        {sections.length > 1 && (
          <View style={[styles.subtotal, { borderTopWidth: 1.5, borderTopColor: BLACK, marginTop: 8 }]}>
            <Text style={[styles.subtotalLabel, { color: BLACK, fontSize: 8.5 }]}>All employees — {grand.length} days</Text>
            <Text style={[styles.subtotalVal, { fontSize: 8.5 }]}>{hrs(sum(grand, 'worked'))}</Text>
            <Text style={[styles.subtotalVal, { fontSize: 8.5 }]}>{hrs(sum(grand, 'breakHours'))}</Text>
            <Text style={[styles.subtotalVal, { fontSize: 8.5 }]}>{hrs(sum(grand, 'regular'))}</Text>
            <Text style={[styles.subtotalVal, { fontSize: 8.5 }]}>{hrs(sum(grand, 'overtime'))}</Text>
            <Text style={[styles.subtotalVal, { fontSize: 8.5 }]}>{hrs(sum(grand, 'pendingOvertime'))}</Text>
            <View style={{ width: 48 + 74 }} />
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>Timevera — Build One / ARKO Joinery · * clock-out recorded automatically (7:00 am – 3:06 pm)</Text>
          <Text>Generated {generatedAt}</Text>
        </View>
      </Page>
    </Document>
  )
}
