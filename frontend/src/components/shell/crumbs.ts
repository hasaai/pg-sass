import { createContext, useContext, useEffect } from 'react'

export interface Crumb {
  label: string
  to?: string
}

export const CrumbsContext = createContext<{ crumbs: Crumb[]; set: (c: Crumb[]) => void }>({
  crumbs: [],
  set: () => {},
})

/** A page names where it sits, e.g. [{label:'Properties', to:'/app/properties'}, {label: name}]. */
export function useBreadcrumbs(crumbs: Crumb[]) {
  const { set } = useContext(CrumbsContext)
  const key = JSON.stringify(crumbs)
  useEffect(() => {
    set(JSON.parse(key) as Crumb[])
    return () => set([])
  }, [key, set])
}
