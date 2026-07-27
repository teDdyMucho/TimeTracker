import { PageHeader } from '@/components/ui'
import InstallLinks from './install-links'
import ShareInstallLink from './share-install-link'

export const dynamic = 'force-dynamic'

export default function DownloadsPage() {
  return (
    <div>
      <PageHeader
        title="Get the App"
        subtitle="Share the public install page with your workers — no login needed on their end."
      />

      <ShareInstallLink />

      <h2 className="text-sm font-bold text-ink mb-3 mt-2">Direct install links</h2>
      <InstallLinks />
    </div>
  )
}
