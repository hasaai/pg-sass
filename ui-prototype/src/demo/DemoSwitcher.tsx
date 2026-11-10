/** Floating "Viewing as" button: switch person and jump between the apps. Prototype only. */
import { Eye, RotateCcw } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'

import { cn } from '../lib/cn'

import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from '../components/ui-kit/menu'
import { toast } from '../components/ui-kit/toast'
import { resetDb } from '../data/store'
import { DEMO_PEOPLE, useSession } from './session'
import type { DemoRole } from './session'

const ORDER: DemoRole[] = ['owner', 'manager', 'accountant', 'caretaker', 'platform', 'tenant']

export function DemoSwitcher() {
  const { role, setRole } = useSession()
  const navigate = useNavigate()
  const inTenantApp = useLocation().pathname.startsWith('/tenant')
  return (
    <div
      className={cn(
        'fixed right-4 z-[60] print:hidden',
        inTenantApp ? 'bottom-20 md:bottom-4' : 'bottom-4',
      )}
    >
      <Menu>
        <MenuTrigger className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-[13px] font-medium text-white shadow-lg outline-none hover:bg-slate-800">
          <Eye className="size-4" />
          Viewing as: {DEMO_PEOPLE[role].label}
        </MenuTrigger>
        <MenuContent align="end" className="w-64">
          <MenuLabel>Prototype – see the app as</MenuLabel>
          {ORDER.map((r) => (
            <MenuItem
              key={r}
              onSelect={() => {
                setRole(r)
                navigate(DEMO_PEOPLE[r].home)
              }}
            >
              <span className="flex-1">
                {DEMO_PEOPLE[r].label}
                <span className="block text-xs text-muted-foreground">{DEMO_PEOPLE[r].name}</span>
              </span>
              {r === role && <span className="text-xs text-primary">current</span>}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem onSelect={() => navigate('/')}>Public website</MenuItem>
          <MenuItem onSelect={() => navigate('/register')}>Owner sign-up flow</MenuItem>
          <MenuItem onSelect={() => navigate('/screens')}>All screens (index)</MenuItem>
          <MenuSeparator />
          <MenuItem
            icon={<RotateCcw />}
            onSelect={() => {
              resetDb()
              toast.success('Sample data reset')
            }}
          >
            Reset sample data
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  )
}
