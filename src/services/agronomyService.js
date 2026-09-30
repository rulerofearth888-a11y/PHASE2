import axios from 'axios'

// Agronomy experts are staff accounts an admin has marked as experts
// (Employees page). Bookings are stored on the server and tied to the
// signed-in account; the server decides which bookings each role sees.

function unwrap(res, fallbackMessage) {
  if (!res?.data?.success) throw new Error(res?.data?.message || fallbackMessage)
  return res.data.data
}

function notify(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

export const agronomyService = {
  // Active agronomy experts (public storefront directory)
  async getExperts() {
    const res = await axios.get('/api/agronomy-experts')
    const list = unwrap(res, 'Could not load experts')
    return Array.isArray(list) ? list : []
  },

  async getExpertById(expertId) {
    const list = await this.getExperts()
    return list.find(e => e.id === expertId || e.employeeId === expertId) || null
  },

  // Admin marks / unmarks a staff member as an Agronomy Expert
  async toggleEmployeeAgronomyExpert(employee, isExpert, customDetails = {}) {
    const empId = employee.id || employee._id
    const { specialization, qualification, bio, experienceYears, languages, cropsExpertise } = customDetails
    const res = await axios.put(`/api/admin/employees/${encodeURIComponent(empId)}/agronomy-expert`, {
      isAgronomyExpert: isExpert, specialization, qualification, bio, experienceYears, languages, cropsExpertise
    })
    unwrap(res, 'Could not update expert designation')
    const experts = await this.getExperts()
    notify('sathyam:experts-updated', experts)
    return experts
  },

  // Book a callback with an expert (requires a signed-in account)
  async bookSession({ expertId, user, crop, acreage = 1, preferredDate, preferredSlot, topic, notes = '', phone }) {
    if (!user) {
      throw new Error('You must be signed in to your account to book an Agronomy Expert session.')
    }
    const res = await axios.post('/api/agronomy-bookings', { expertId, crop, acreage, preferredDate, preferredSlot, topic, notes, phone })
    const booking = unwrap(res, 'Could not book the session')
    notify('sathyam:bookings-updated', booking)
    return booking
  },

  // The signed-in farmer's own bookings (the server filters by account)
  async getUserBookings() {
    return this.getAllBookings()
  },

  // Admins get every booking, experts the bookings made with them
  async getAllBookings() {
    const res = await axios.get('/api/agronomy-bookings')
    const list = unwrap(res, 'Could not load bookings')
    return Array.isArray(list) ? list : []
  },

  // Mark a callback as done and record the consultation notes
  async completeCallback(bookingId, { callbackNotes }) {
    const res = await axios.put(`/api/agronomy-bookings/${encodeURIComponent(bookingId)}/complete`, { callbackNotes })
    const booking = unwrap(res, 'Could not update the booking')
    notify('sathyam:bookings-updated', booking)
    return booking
  }
}
