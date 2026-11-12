// Pages that are not in the phone tab bar. The phone's account menu and the Account page list them.
export const morePages = (s) => [
  ...(s.health ? [{ name: 'reports', label: 'Reports', icon: 'lucide-chart-no-axes-column' }] : []),
  { name: 'give-out', label: 'Give out stock', icon: 'lucide-hand-heart' },
  ...(s.health ? [{ name: 'procedures', label: 'Treatment types', icon: 'lucide-list-checks' }] : []),
  ...(s.isAdmin ? [{ name: 'staff', label: 'Staff', icon: 'lucide-id-card' }] : []),
]
