import axios from 'axios'

const EXPERTS_STORAGE_KEY = 'sathyam_agronomy_experts_v1'
const BOOKINGS_STORAGE_KEY = 'sathyam_agronomy_bookings_v1'

// Default certified agronomy experts (assigned from qualified employees)
const DEFAULT_AGRONOMY_EXPERTS = [
  {
    id: 'EXP-101',
    employeeId: 'u3',
    name: 'Dr. K. Senthil Kumar',
    qualification: 'Ph.D. in Plant Pathology (TNAU)',
    specialization: 'Crop Disease Diagnostics & Biological Pest Shield',
    experienceYears: 14,
    rating: 4.95,
    reviewsCount: 312,
    languages: ['Tamil', 'English', 'Malayalam'],
    availableDays: 'Monday - Saturday',
    availableSlots: ['10:00 AM - 12:00 PM', '02:00 PM - 04:00 PM', '04:00 PM - 06:00 PM'],
    cropsExpertise: ['Paddy/Rice', 'Cotton', 'Chilli', 'Sugarcane', 'Banana'],
    bio: 'Former senior university researcher and field agronomist with 14+ years advising over 15,000 farmers across South India on blast control, organic bio-stimulants, and microbial pest deterrence.',
    phone: '9234567890',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    isAgronomyExpert: true,
    active: true,
    badges: ['TNAU Certified', 'Pest Doctor', 'Top Rated']
  },
  {
    id: 'EXP-102',
    employeeId: 'u6',
    name: 'Dr. Priya Sharma',
    qualification: 'M.Sc. in Soil Science & Agricultural Chemistry (IARI)',
    specialization: 'Soil Health Restoration & Bio-Fertilizer Consortia',
    experienceYears: 9,
    rating: 4.9,
    reviewsCount: 248,
    languages: ['Hindi', 'English', 'Punjabi'],
    availableDays: 'Monday - Friday',
    availableSlots: ['09:30 AM - 11:30 AM', '01:30 PM - 03:30 PM', '04:30 PM - 06:30 PM'],
    cropsExpertise: ['Wheat', 'Tomato', 'Mustard', 'Cotton', 'Paddy/Rice'],
    bio: 'Soil chemist dedicated to rejuvenating degraded agricultural lands. Expert in balancing NPK ratios, humic conditioning, mycorrhizal root colonization, and correcting secondary nutrient deficiencies.',
    phone: '9567890123',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80',
    isAgronomyExpert: true,
    active: true,
    badges: ['Soil Specialist', 'Organic Certified', 'IARI Alum']
  },
  {
    id: 'EXP-103',
    employeeId: 'u7',
    name: 'Arun Kumar',
    qualification: 'B.Sc. (Agri) & PG Dip in Precision Horticulture',
    specialization: 'High-Density Orchards, Drip Fertigation & Flower Drop Prevention',
    experienceYears: 7,
    rating: 4.86,
    reviewsCount: 189,
    languages: ['Tamil', 'Telugu', 'English'],
    availableDays: 'Monday - Saturday',
    availableSlots: ['10:00 AM - 12:00 PM', '02:00 PM - 04:00 PM'],
    cropsExpertise: ['Grapes', 'Pomegranate', 'Tomato', 'Citrus', 'Papaya'],
    bio: 'Horticulture specialist experienced in precision drip fertigation, micronutrient foliar schedule, flower preservation during extreme weather, and maximum brix development in fruit crops.',
    phone: '9678901234',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    isAgronomyExpert: true,
    active: true,
    badges: ['Horticulture Pro', 'Fertigation Specialist']
  }
]

const DEFAULT_BOOKINGS = [
  {
    id: 'AGR-BK-801',
    expertId: 'EXP-101',
    expertName: 'Dr. K. Senthil Kumar',
    userId: 'USR-1001',
    farmerName: 'Rameshwar Patel',
    farmerPhone: '9876543210',
    crop: 'Paddy/Rice',
    acreage: 5,
    preferredDate: '2026-10-02',
    preferredSlot: '10:00 AM - 12:00 PM',
    topic: 'Leaf Blast Outbreak & Chemical-Free Management',
    notes: 'Brown lesions starting to show on 30-day paddy. Need biological fungicide plan.',
    status: 'Scheduled',
    callbackCompleted: false,
    callbackNotes: null,
    createdAt: '2026-09-29T10:00:00.000Z'
  },
  {
    id: 'AGR-BK-802',
    expertId: 'EXP-102',
    expertName: 'Dr. Priya Sharma',
    userId: 'USR-1007',
    farmerName: 'Gurpreet Singh',
    farmerPhone: '9814077889',
    crop: 'Cotton',
    acreage: 12,
    preferredDate: '2026-09-30',
    preferredSlot: '01:30 PM - 03:30 PM',
    topic: 'Soil Alkalinity & High Salinity EC Management',
    notes: 'Soil test shows pH 8.4 and EC 2.1. Leaves curling and stunted cotton growth.',
    status: 'Completed',
    callbackCompleted: true,
    callbackNotes: 'Called farmer. Recommended Gypsum application @ 400kg/acre followed by Humic King foliar spray @ 5ml/L.',
    createdAt: '2026-09-28T14:30:00.000Z'
  }
]

function readStoredExperts() {
  try {
    const raw = localStorage.getItem(EXPERTS_STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(EXPERTS_STORAGE_KEY, JSON.stringify(DEFAULT_AGRONOMY_EXPERTS))
      return DEFAULT_AGRONOMY_EXPERTS
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_AGRONOMY_EXPERTS
  } catch {
    return DEFAULT_AGRONOMY_EXPERTS
  }
}

function writeStoredExperts(experts) {
  try {
    localStorage.setItem(EXPERTS_STORAGE_KEY, JSON.stringify(experts))
    window.dispatchEvent(new CustomEvent('sathyam:experts-updated', { detail: experts }))
  } catch (err) {
    console.error('Failed to write experts to storage', err)
  }
}

function readStoredBookings() {
  try {
    const raw = localStorage.getItem(BOOKINGS_STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(BOOKINGS_STORAGE_KEY, JSON.stringify(DEFAULT_BOOKINGS))
      return DEFAULT_BOOKINGS
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_BOOKINGS
  } catch {
    return DEFAULT_BOOKINGS
  }
}

function writeStoredBookings(bookings) {
  try {
    localStorage.setItem(BOOKINGS_STORAGE_KEY, JSON.stringify(bookings))
    window.dispatchEvent(new CustomEvent('sathyam:bookings-updated', { detail: bookings }))
  } catch (err) {
    console.error('Failed to write bookings to storage', err)
  }
}

export const agronomyService = {
  // Get all active agronomy experts (for public storefront & booking)
  async getExperts() {
    try {
      const res = await axios.get('/api/agronomy-experts').catch(() => null)
      if (res?.data?.success && Array.isArray(res.data.data) && res.data.data.length > 0) {
        return res.data.data
      }
    } catch {}
    return readStoredExperts().filter(e => e.active && e.isAgronomyExpert)
  },

  // Get single expert by ID
  async getExpertById(expertId) {
    const list = await this.getExperts()
    return list.find(e => e.id === expertId || e.employeeId === expertId) || null
  },

  // Super Admin & Admin assign / toggle employee as Agronomy Expert
  async toggleEmployeeAgronomyExpert(employee, isExpert, customDetails = {}) {
    const current = readStoredExperts()
    const empId = employee.id || employee._id

    let updated
    const existingIndex = current.findIndex(e => e.employeeId === empId || e.id === empId)

    if (existingIndex >= 0) {
      updated = current.map((item, idx) => {
        if (idx === existingIndex) {
          return {
            ...item,
            isAgronomyExpert: isExpert,
            active: isExpert,
            ...customDetails
          }
        }
        return item
      })
    } else if (isExpert) {
      const newExpert = {
        id: `EXP-${Math.floor(100 + Math.random() * 900)}`,
        employeeId: empId,
        name: employee.name,
        qualification: employee.profile?.qualification || 'B.Sc / M.Sc Agriculture',
        specialization: customDetails.specialization || employee.profile?.department || 'Field Crop Advisory',
        experienceYears: customDetails.experienceYears || 5,
        rating: 4.85,
        reviewsCount: 120,
        languages: customDetails.languages || ['Tamil', 'English'],
        availableDays: 'Monday - Saturday',
        availableSlots: ['10:00 AM - 12:00 PM', '02:00 PM - 04:00 PM', '04:00 PM - 06:00 PM'],
        cropsExpertise: customDetails.cropsExpertise || ['Paddy/Rice', 'Cotton', 'Tomato', 'Sugarcane'],
        bio: customDetails.bio || employee.profile?.bio || `Agronomy specialist with field expertise in crop protection and organic bio-nutrition.`,
        phone: employee.mobile || employee.phone || '',
        avatar: employee.profile?.profilePhoto || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
        isAgronomyExpert: true,
        active: true,
        badges: ['Certified Agronomist', 'Sathyam Bio Specialist']
      }
      updated = [newExpert, ...current]
    } else {
      updated = current
    }

    writeStoredExperts(updated)

    // Backend sync
    try {
      await axios.put(`/api/admin/employees/${empId}/agronomy-expert`, {
        isAgronomyExpert: isExpert,
        ...customDetails
      }).catch(() => null)
    } catch {}

    return updated
  },

  // User books consultation session with Agronomy Expert (User MUST have account)
  async bookSession({
    expertId,
    user,
    crop,
    acreage = 1,
    preferredDate,
    preferredSlot,
    topic,
    notes = '',
    phone
  }) {
    if (!user || (!user.id && !user._id)) {
      throw new Error('You must be signed in to your account to book an Agronomy Expert session.')
    }

    const expert = await this.getExpertById(expertId)
    const bookingId = `AGR-BK-${Math.floor(100 + Math.random() * 900)}`
    const now = new Date().toISOString()

    const newBooking = {
      id: bookingId,
      expertId: expert?.id || expertId,
      expertName: expert?.name || 'Assigned Agronomy Expert',
      userId: user.id || user._id,
      farmerName: user.name || 'Farmer',
      farmerPhone: phone || user.phone || user.mobile || '',
      farmerEmail: user.email || '',
      crop: crop || 'General Crops',
      acreage: Number(acreage) || 1,
      preferredDate: preferredDate || new Date().toISOString().split('T')[0],
      preferredSlot: preferredSlot || '10:00 AM - 12:00 PM',
      topic: topic || 'General Agronomy Advisory',
      notes,
      status: 'Scheduled',
      callbackCompleted: false,
      callbackNotes: null,
      createdAt: now
    }

    const bookings = readStoredBookings()
    const updated = [newBooking, ...bookings]
    writeStoredBookings(updated)

    // Try backend sync
    try {
      await axios.post('/api/agronomy-bookings', newBooking).catch(() => null)
    } catch {}

    return newBooking
  },

  // Get user's bookings
  async getUserBookings(userId, phone) {
    const all = readStoredBookings()
    return all.filter(b => {
      if (userId && b.userId === userId) return true
      if (phone && b.farmerPhone && b.farmerPhone.includes(phone.slice(-10))) return true
      return false
    })
  },

  // Get all bookings (for Super Admin, Admin, and assigned Experts)
  async getAllBookings(filter = {}) {
    const all = readStoredBookings()
    if (filter.expertId) {
      return all.filter(b => b.expertId === filter.expertId)
    }
    return all
  },

  // Mark session callback completed and add consultation notes
  async completeCallback(bookingId, { callbackNotes, expertName = 'Agronomy Expert' }) {
    const bookings = readStoredBookings()
    const now = new Date().toISOString()

    const updated = bookings.map(b => {
      if (b.id === bookingId) {
        return {
          ...b,
          status: 'Completed',
          callbackCompleted: true,
          callbackNotes,
          completedAt: now,
          completedBy: expertName
        }
      }
      return b
    })

    writeStoredBookings(updated)

    try {
      await axios.put(`/api/agronomy-bookings/${bookingId}/complete`, { callbackNotes, expertName }).catch(() => null)
    } catch {}

    return updated.find(b => b.id === bookingId)
  }
}
