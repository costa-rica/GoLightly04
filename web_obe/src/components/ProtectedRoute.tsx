"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppSelector } from '@/store/hooks'

type ProtectedRouteProps = {
  children: React.ReactNode
  requireAdmin?: boolean
}

export default function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const router = useRouter()
  const { isAuthenticated, user } = useAppSelector((state) => state.auth)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    if (!isAuthenticated || !user) {
      router.replace('/')
      return
    }

    if (requireAdmin && !user.isAdmin) {
      router.replace('/')
      return
    }

    setIsChecking(false)
  }, [isAuthenticated, user, requireAdmin, router])

  if (isChecking) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-calm-500">
        Checking access...
      </div>
    )
  }

  return <>{children}</>
}
