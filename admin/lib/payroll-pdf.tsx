import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import { PAY_BANDS, PAY_BAND_LABELS, type PayBand } from '@/lib/payroll'

// ── Monochrome brand palette (matches the admin) ──
const INK = '#18181B'
const MUTED = '#71717A'
const LINE = '#E4E4E7'
const BLACK = '#1C1A16'

const money = (n: number) => `$${Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`
const hrs = (n: number) => {
  const total = Math.round((n || 0) * 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export interface PdfEntry {
  name: string
  email: string
  entityName: string
  bandHours: Record<string, number>
  gross: number
}

export interface PdfSection {
  /** Heading for a group of rows (e.g. an entity name, or the period). */
  title: string
  subtitle?: string
  entries: PdfEntry[]
}

export interface PayrollPdfProps {
  logoSrc: string            // data URI or absolute URL
  heading: string            // e.g. "Payroll Summary"
  meta: string               // e.g. "ARKO Joinery · 12 Jun – 25 Jun 2026"
  generatedAt: string
  sections: PdfSection[]
  showEntityColumn?: boolean // show per-row entity (for cross-entity reports)
}

const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 40, fontSize: 9, color: INK, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  logo: { width: 150, height: 38, objectFit: 'contain' },
  headRight: { alignItems: 'flex-end' },
  docTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: BLACK },
  meta: { fontSize: 9, color: MUTED, marginTop: 2 },
  rule: { borderBottomWidth: 1.5, borderBottomColor: BLACK, marginTop: 12, marginBottom: 16 },

  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: BLACK, marginTop: 14, marginBottom: 2 },
  sectionSub: { fontSize: 8.5, color: MUTED, marginBottom: 8 },

  thead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BLACK, paddingBottom: 5, marginBottom: 2 },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: MUTED, textTransform: 'uppercase' },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 6, alignItems: 'center' },
  cellName: { flex: 2.4 },
  empName: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: INK },
  empEmail: { fontSize: 7.5, color: MUTED, marginTop: 1 },
  cellEntity: { flex: 1.4, fontSize: 8, color: MUTED },
  band: { flex: 1, textAlign: 'right', fontSize: 8.5 },
  gross: { flex: 1.2, textAlign: 'right', fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: INK },

  subtotalRow: { flexDirection: 'row', paddingVertical: 6, borderTopWidth: 1, borderTopColor: LINE, marginTop: 2 },
  subtotalLabel: { flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: MUTED },
  subtotalVal: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, color: INK, textAlign: 'right' },

  grandRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, paddingTop: 12, borderTopWidth: 2, borderTopColor: BLACK },
  grandLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: BLACK },
  grandVal: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: BLACK },

  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: MUTED, borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 6 },
})

export function PayrollPdf({ logoSrc, heading, meta, generatedAt, sections, showEntityColumn = false }: PayrollPdfProps) {
  // Which bands appear anywhere → only those columns
  const allEntries = sections.flatMap((s) => s.entries)
  const activeBands = PAY_BANDS.filter((b) => allEntries.some((e) => (e.bandHours?.[b] ?? 0) > 0))
  const bandsToShow: PayBand[] = activeBands.length > 0 ? activeBands : ['regular']
  const grandTotal = allEntries.reduce((s, e) => s + Number(e.gross || 0), 0)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={logoSrc} style={styles.logo} />
          <View style={styles.headRight}>
            <Text style={styles.docTitle}>{heading}</Text>
            <Text style={styles.meta}>{meta}</Text>
          </View>
        </View>
        <View style={styles.rule} />

        {sections.map((sec, si) => {
          const secTotal = sec.entries.reduce((s, e) => s + Number(e.gross || 0), 0)
          return (
            <View key={si} wrap={false}>
              <Text style={styles.sectionTitle}>{sec.title}</Text>
              {sec.subtitle ? <Text style={styles.sectionSub}>{sec.subtitle}</Text> : null}

              {/* table head */}
              <View style={styles.thead}>
                <Text style={[styles.th, styles.cellName]}>Employee</Text>
                {showEntityColumn && <Text style={[styles.th, styles.cellEntity]}>Entity</Text>}
                {bandsToShow.map((b) => (
                  <Text key={b} style={[styles.th, styles.band]}>{PAY_BAND_LABELS[b]}</Text>
                ))}
                <Text style={[styles.th, styles.gross]}>Gross</Text>
              </View>

              {sec.entries.length === 0 ? (
                <View style={styles.row}><Text style={{ color: MUTED }}>No employees in this group.</Text></View>
              ) : (
                sec.entries.map((e, i) => (
                  <View key={i} style={styles.row}>
                    <View style={styles.cellName}>
                      <Text style={styles.empName}>{e.name}</Text>
                      {e.email ? <Text style={styles.empEmail}>{e.email}</Text> : null}
                    </View>
                    {showEntityColumn && <Text style={styles.cellEntity}>{e.entityName}</Text>}
                    {bandsToShow.map((b) => (
                      <Text key={b} style={styles.band}>
                        {(e.bandHours?.[b] ?? 0) > 0 ? hrs(e.bandHours[b]) : '—'}
                      </Text>
                    ))}
                    <Text style={styles.gross}>{money(e.gross)}</Text>
                  </View>
                ))
              )}

              {/* per-section subtotal (only when multiple sections) */}
              {sections.length > 1 && (
                <View style={styles.subtotalRow}>
                  <Text style={styles.subtotalLabel}>{sec.title} subtotal</Text>
                  <Text style={[styles.subtotalVal, { flex: 1 }]}>{money(secTotal)}</Text>
                </View>
              )}
            </View>
          )
        })}

        {/* Grand total */}
        <View style={styles.grandRow}>
          <Text style={styles.grandLabel}>Total Gross Pay</Text>
          <Text style={styles.grandVal}>{money(grandTotal)}</Text>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>BuildOne — Workforce Management</Text>
          <Text>Generated {generatedAt}</Text>
        </View>
      </Page>
    </Document>
  )
}
