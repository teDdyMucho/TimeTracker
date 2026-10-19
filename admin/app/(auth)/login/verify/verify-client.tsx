'use client'
import { useRouter } from 'next/navigation'
import MfaForm from '../mfa-form'

export default function VerifyClient() {
  const router = useRouter()
  return <MfaForm onDone={() => router.replace('/')} />
}
