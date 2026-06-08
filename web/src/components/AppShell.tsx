"use client"

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Navigation from '@/components/Navigation'
import ModalLogin from '@/components/modals/ModalLogin'
import ModalRegister from '@/components/modals/ModalRegister'
import ModalInformationOk from '@/components/modals/ModalInformationOk'
import LoadingOverlay from '@/components/LoadingOverlay'

type AppShellProps = {
  children: React.ReactNode
}

type Theme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'golightly.theme'
const DEFAULT_THEME: Theme = 'light'

function getCurrentTheme(): Theme {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME
  }

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    return storedTheme === 'dark' || storedTheme === 'light' ? storedTheme : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

function withThemeParam(rawUrl: string, theme: Theme): string {
  const url = new URL(rawUrl, window.location.origin)
  url.searchParams.set('theme', theme)
  return url.toString()
}

export default function AppShell({ children }: AppShellProps) {
  const [isLoginOpen, setIsLoginOpen] = useState(false)
  const [isRegisterOpen, setIsRegisterOpen] = useState(false)
  const formyUrl = process.env.NEXT_PUBLIC_URL_TO_FORMY?.trim()
  const [formyThemedUrl, setFormyThemedUrl] = useState(formyUrl || '')
  const [verificationError, setVerificationError] = useState<{
    title: string
    message: string
  } | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const wantsLogin = searchParams.get('login') === '1'
    const wantsRegister = searchParams.get('register') === '1'
    const hasVerifyError = searchParams.get('verify_error') === '1'

    if (wantsLogin) {
      setIsRegisterOpen(false)
      setIsLoginOpen(true)
    }

    if (wantsRegister) {
      setIsLoginOpen(false)
      setIsRegisterOpen(true)
    }

    if (hasVerifyError) {
      const errorTitle = searchParams.get('error_title') || 'Verification Failed'
      const errorMessage = searchParams.get('error_message') || 'Unable to verify your email.'
      setVerificationError({
        title: errorTitle,
        message: errorMessage,
      })
      // Clean up URL params after reading them
      router.replace('/')
    }
  }, [searchParams, router])

  useEffect(() => {
    if (!formyUrl) {
      setFormyThemedUrl('')
      return
    }

    setFormyThemedUrl(withThemeParam(formyUrl, getCurrentTheme()))
  }, [formyUrl])

  const handleCloseVerificationError = () => {
    setVerificationError(null)
  }

  const handleFormyClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!formyUrl) {
      return
    }

    const nextUrl = withThemeParam(formyUrl, getCurrentTheme())
    event.currentTarget.href = nextUrl
    setFormyThemedUrl(nextUrl)
  }

  return (
    <>
      <div className="min-h-screen flex flex-col bg-canvas text-ink">
        <Navigation onLoginClick={() => setIsLoginOpen(true)} />
        <div className="pt-16 flex-1">{children}</div>
        <footer className="px-4 py-6 text-xs text-slate-500 dark:text-calm-400">
          <div className="mx-auto max-w-app">
            <div className="flex items-center gap-2">
              <a
                className="hover:text-slate-700 transition-colors dark:hover:text-calm-200"
                href="mailto:nrodrig1@gmail.com"
              >
                Contact Us
              </a>
              {formyUrl ? (
                <>
                  <span className="text-slate-400 dark:text-calm-600">|</span>
                  <a
                    className="hover:text-slate-700 transition-colors dark:hover:text-calm-200"
                    href={formyThemedUrl}
                    onClick={handleFormyClick}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Help Us Improve
                  </a>
                </>
              ) : null}
            </div>
          </div>
        </footer>
      </div>
      <ModalLogin
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onSwitchToRegister={() => {
          setIsLoginOpen(false)
          setIsRegisterOpen(true)
        }}
        onSwitchToForgotPassword={() => {
          setIsLoginOpen(false)
          router.push('/forgot-password')
        }}
      />
      <ModalRegister
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onSwitchToLogin={() => {
          setIsRegisterOpen(false)
          setIsLoginOpen(true)
        }}
      />
      <ModalInformationOk
        isOpen={verificationError !== null}
        onClose={handleCloseVerificationError}
        variant="error"
        title={verificationError?.title || ''}
        message={verificationError?.message || ''}
      />
      <LoadingOverlay />
    </>
  )
}
