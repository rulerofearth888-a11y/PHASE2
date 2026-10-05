import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { toast } from 'sonner'
import { ticketService } from '../../services/ticketService'

// Assigning a support ticket (server/ticketRouting.js has the rules).
// Super Admin: choose the ticket's store - the store covering the farmer's
// delivery district is pre-selected when there is one - then one of that
// store's admins; nobody from another store can be picked. Store admin: hand
// the ticket to an employee, delivery or billing member of their own store.
// Used by pages/superadmin/SupportTicketSystem.jsx and pages/admin/SupportTickets.jsx.
export default function TicketAssignControls({ ticket, onAssigned, compact = false }) {
  const [options, setOptions] = useState(null)
  const [storeId, setStoreId] = useState('')
  const [staffId, setStaffId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!ticket?.id) return undefined
    let cancelled = false
    setOptions(null); setError(''); setStaffId('')
    axios.get(`/api/tickets/${encodeURIComponent(ticket.id)}/assign-options`)
      .then(({ data }) => {
        if (cancelled) return
        const opts = data?.data || { mode: 'none' }
        setOptions(opts)
        setStoreId(opts.currentStoreId || opts.suggestedStoreId || '')
      })
      .catch(err => { if (!cancelled) setError(err.response?.data?.message || 'Could not load who this ticket can go to') })
    return () => { cancelled = true }
  }, [ticket?.id, ticket?.updatedAt])

  const store = useMemo(() => options?.stores?.find(s => s.id === storeId) || null, [options, storeId])
  const people = options?.mode === 'stores' ? (store?.admins || []) : (options?.staff || [])

  const assign = async () => {
    if (!staffId) return
    setBusy(true)
    try {
      const updated = await ticketService.assignTicket(ticket.id, { assignedToId: staffId, storeId: options?.mode === 'stores' ? storeId : undefined })
      const who = people.find(p => p.id === staffId)
      toast.success(`Ticket ${ticket.id} assigned to ${who?.name || 'staff'}${store ? ` (${store.name})` : ''}`)
      setStaffId('')
      onAssigned?.(updated)
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Could not assign ticket')
    } finally {
      setBusy(false)
    }
  }

  if (error) return <p className="tkt-assign-note is-warn">{error}</p>
  if (!options) return <p className="tkt-assign-note">Loading…</p>
  if (options.mode === 'none') {
    return <p className="tkt-assign-note">Only the Super Admin assigns tickets to stores. Once this ticket is assigned to your store, you can hand it to your own staff.</p>
  }

  const suggested = options.suggestedStoreId && options.stores?.find(s => s.id === options.suggestedStoreId)
  return (
    <div className={`tkt-assign${compact ? ' is-compact' : ''}`}>
      {options.mode === 'stores' && (
        <>
          <label className="tkt-assign-label" htmlFor={`tktStore-${ticket.id}`}>1. Ticket's store</label>
          <select id={`tktStore-${ticket.id}`} className="tkt-assign-select" value={storeId} onChange={e => { setStoreId(e.target.value); setStaffId('') }}>
            <option value="">-- Choose the store --</option>
            {options.stores.map(s => (
              <option key={s.id} value={s.id}>{s.name}{s.location ? ` · ${s.location}` : ''}{s.id === options.suggestedStoreId ? ' (suggested)' : ''}</option>
            ))}
          </select>
          <p className={`tkt-assign-note${suggested ? ' is-ok' : ''}`}>
            {suggested
              ? `Suggested: ${suggested.name} covers the farmer's district (${options.district}).`
              : options.district
                ? `No store covers ${options.district} yet - choose the nearest or main store.`
                : 'No delivery district on this ticket - choose the store that should handle it.'}
          </p>
        </>
      )}
      <label className="tkt-assign-label" htmlFor={`tktStaff-${ticket.id}`}>{options.mode === 'stores' ? '2. Store admin' : 'Hand to your staff'}</label>
      <div className="tkt-assign-row">
        <select
          id={`tktStaff-${ticket.id}`}
          className="tkt-assign-select"
          value={staffId}
          onChange={e => setStaffId(e.target.value)}
          disabled={options.mode === 'stores' && !store}
        >
          <option value="">{options.mode === 'stores' ? (store ? '-- Choose an admin of this store --' : 'Choose the store first') : '-- Choose a staff member --'}</option>
          {people.map(p => (
            <option key={p.id} value={p.id}>{p.name}{p.designation ? ` · ${p.designation}` : ''}{options.mode === 'staff' ? ` (${p.role})` : ''}</option>
          ))}
        </select>
        <button type="button" className="tkt-assign-btn" onClick={assign} disabled={!staffId || busy}>
          {busy ? 'Assigning…' : 'Assign'}
        </button>
      </div>
      {options.mode === 'stores' && store && people.length === 0 && (
        <p className="tkt-assign-note is-warn">{store.name} has no active admin. Add one under Stores / Users first.</p>
      )}
    </div>
  )
}
