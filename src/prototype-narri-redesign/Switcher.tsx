// PROTOTYPE — Switcher. Throwaway. Remove entirely when a variant is chosen.
//
// Place <PrototypeSwitcher /> on the page alongside your variant content.
// Only renders in development — safe to leave until you pick a winner.
//
// ADAPT THE ROUTER IMPORT for your framework:
//
//   Next.js App Router (default below):
//     import { useRouter, useSearchParams } from 'next/navigation'
//     router.push('?variant=' + next)
//
//   Next.js Pages Router:
//     import { useRouter } from 'next/router'
//     const router = useRouter()
//     router.push({ query: { variant: next } })
//
//   React Router / Remix:
//     import { useNavigate, useSearchParams } from 'react-router-dom'
//     const navigate = useNavigate()
//     navigate('?variant=' + next)
//

'use client' // Remove if not using Next.js App Router

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useCallback } from 'react'

const VARIANTS = ['a', 'b', 'c'] as const
type Variant = typeof VARIANTS[number]

const VARIANT_NAMES: Record<Variant, string> = {
  a: 'Variant A',
  b: 'Variant B',
  c: 'Variant C'
}

export function PrototypeSwitcher() {
  const router      = useRouter()
  const searchParams = useSearchParams()
  const current     = (searchParams.get('variant') ?? VARIANTS[0]) as Variant
  const idx         = VARIANTS.indexOf(current)

  const go = useCallback((dir: 'prev' | 'next') => {
    const next = dir === 'next'
      ? VARIANTS[(idx + 1) % VARIANTS.length]
      : VARIANTS[(idx - 1 + VARIANTS.length) % VARIANTS.length]
    router.push('?variant=' + next)
  }, [idx, router])

  // Arrow key navigation — skips when an input field is focused
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowLeft')  go('prev')
      if (e.key === 'ArrowRight') go('next')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  // Never render in production — safety net so this cannot accidentally ship
  if (process.env.NODE_ENV === 'production') return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#0f0f23',
      color: '#c9c9e0',
      border: '1px solid #2a2a4a',
      borderRadius: 8,
      padding: '8px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      fontFamily: 'monospace',
      fontSize: 13,
      zIndex: 9999,
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      userSelect: 'none',
      whiteSpace: 'nowrap',
    }}>
      <Btn onClick={() => go('prev')}>prev</Btn>
      <span>PROTOTYPE · {VARIANT_NAMES[current]}</span>
      <Btn onClick={() => go('next')}>next</Btn>
    </div>
  )
}

function Btn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      background: 'transparent',
      border: '1px solid #3a3a5a',
      color: '#c9c9e0',
      borderRadius: 4,
      cursor: 'pointer',
      padding: '3px 10px',
      fontFamily: 'monospace',
      fontSize: 13,
    }}>
      {children}
    </button>
  )
}