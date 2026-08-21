import { useCallback, useEffect, useState } from 'react'

export interface HashLocation {
  raw: string
  path: string
  segments: string[]
  query: URLSearchParams
}

function parse(hash: string): HashLocation {
  const raw = hash.replace(/^#/, '').replace(/^\//, '')
  const [pathPart = '', queryPart = ''] = raw.split('?')
  const segments = pathPart.split('/').filter(Boolean)
  return {
    raw,
    path: segments[0] ?? '',
    segments,
    query: new URLSearchParams(queryPart),
  }
}

export function currentLocation(): HashLocation {
  return parse(typeof window === 'undefined' ? '' : window.location.hash)
}

export function navigate(to: string, replace = false): void {
  const next = to.startsWith('#') ? to : `#/${to.replace(/^\//, '')}`
  if (replace) {
    const url = `${window.location.pathname}${window.location.search}${next}`
    window.history.replaceState(null, '', url)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = next
  }
}

export function useHashRoute(): HashLocation {
  const [loc, setLoc] = useState<HashLocation>(() => currentLocation())

  const onChange = useCallback(() => {
    setLoc(currentLocation())
  }, [])

  useEffect(() => {
    window.addEventListener('hashchange', onChange)
    window.addEventListener('popstate', onChange)
    return () => {
      window.removeEventListener('hashchange', onChange)
      window.removeEventListener('popstate', onChange)
    }
  }, [onChange])

  return loc
}
