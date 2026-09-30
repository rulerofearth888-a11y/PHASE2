import axios from 'axios'

function unwrap(res, fallbackMessage) {
  if (!res?.data?.success) throw new Error(res?.data?.message || fallbackMessage)
  return res.data.data
}

function notifyUpdated(detail) {
  window.dispatchEvent(new CustomEvent('sathyam:soil-reports-updated', { detail }))
}

export const SAMPLE_SOIL_PRESETS = [
  {
    name: '🌾 Alkaline Paddy Soil (Cauvery Delta)',
    description: 'High pH (8.3), moderate salinity (EC 1.4), low organic carbon (0.38%), low zinc',
    values: {
      soilType: 'Clay Loam',
      crop: 'Paddy/Rice',
      areaAcres: 3,
      ph: 8.3,
      ec: 1.4,
      oc: 0.38,
      nitrogen: 210,
      phosphorus: 12.5,
      potassium: 195,
      zinc: 'Deficient',
      boron: 'Sufficient',
      iron: 'Sufficient',
      sulphur: 'Deficient'
    }
  },
  {
    name: '☁️ Low-Carbon Cotton Soil (Vidarbha / Deccan)',
    description: 'Black cotton soil with deficient organic carbon (0.42%), low N & P, marginal potassium',
    values: {
      soilType: 'Black Cotton Soil',
      crop: 'Cotton',
      areaAcres: 5,
      ph: 7.9,
      ec: 0.9,
      oc: 0.42,
      nitrogen: 185,
      phosphorus: 8.2,
      potassium: 240,
      zinc: 'Deficient',
      boron: 'Deficient',
      iron: 'Sufficient',
      sulphur: 'Deficient'
    }
  },
  {
    name: '🍅 Acidic Red Soil (Hill & Coastal Tract)',
    description: 'Acidic pH (5.6), low phosphorus fixation, low calcium, optimal organic carbon',
    values: {
      soilType: 'Red Sandy Loam',
      crop: 'Tomato & Solanaceous Vegetables',
      areaAcres: 2,
      ph: 5.6,
      ec: 0.5,
      oc: 0.72,
      nitrogen: 310,
      phosphorus: 6.8,
      potassium: 130,
      zinc: 'Sufficient',
      boron: 'Deficient',
      iron: 'Sufficient',
      sulphur: 'Sufficient'
    }
  },
  {
    name: '🎋 High Saline Sugarcane Soil (Coastal Belt)',
    description: 'High salinity (EC 2.1), pH 8.1, high potassium, low nitrogen & zinc',
    values: {
      soilType: 'Alluvial Soil',
      crop: 'Sugarcane',
      areaAcres: 4,
      ph: 8.1,
      ec: 2.1,
      oc: 0.48,
      nitrogen: 200,
      phosphorus: 14,
      potassium: 280,
      zinc: 'Deficient',
      boron: 'Sufficient',
      iron: 'Deficient',
      sulphur: 'Deficient'
    }
  }
]

// Real catalogue products (live ids) matched to a soil problem only where the
// product's own description supports it. Name, photo, price and packs are read
// from the live catalogue on the page; no doses are stated here - the label and
// the product page are the source. null = nothing we sell fits: advice only.
export const SATHYAM_PRODUCTS_MAP = {
  organicCarbon: {
    id: 'sb-MUBDCDHWIQ8S',
    name: 'Black Carbon',
    category: 'Fertilizer',
    benefit: 'Potassium humate soil conditioner: improves soil structure, moisture holding and nutrient availability.'
  },
  soilMaintenance: {
    id: 'sb-MUFKPNQJFI39',
    name: 'Soil Gold',
    category: 'Bio-Stimulant',
    benefit: 'Humic acid with seaweed extract to support soil fertility and vigorous plant growth.'
  },
  alkalinityGypsum: null,
  acidityLime: null,
  nitrogenDeficit: null,
  phosphorusDeficit: {
    id: 'sb-MUFKPO0FM3Q4',
    name: 'VAM',
    category: 'Fertilizer',
    benefit: 'Mycorrhiza that extends the root network so plants reach more soil water and nutrients.'
  },
  potashDeficit: {
    id: 'sb-MUFKPN2590CF',
    name: 'Kalium 20',
    category: 'Fertilizer',
    benefit: 'Water-soluble potash from red seaweed for fruit development and produce quality.'
  },
  zincDeficit: {
    id: 'sb-MUBDCL0PSSDO',
    name: 'Shakthi Dayanutri – Pro',
    category: 'Fertilizer',
    benefit: 'Micronutrient formulation for balanced crop nutrition and chlorophyll formation.'
  },
  boronDeficit: {
    id: 'sb-MUBDCL0PSSDO',
    name: 'Shakthi Dayanutri – Pro',
    category: 'Fertilizer',
    benefit: 'Micronutrient formulation supporting flowering and fruit development.'
  },
  salinityRemedy: null
}

// Master scientific crop database for real agronomic suitability modeling
export const CROP_SUITABILITY_RULES = [
  {
    name: 'Paddy/Rice',
    icon: '🌾',
    category: 'Cereal / Grain',
    season: 'Kharif / Rabi',
    idealPh: { min: 5.5, max: 7.5 },
    maxEc: 2.2, // Moderate salt tolerance
    minOc: 0.4,
    suitableSoilTypes: ['Clay Loam', 'Alluvial Soil', 'Black Cotton Soil', 'Sandy Clay Loam'],
    npkDemand: { n: 'High', p: 'Medium', k: 'High' },
    criticalMicro: ['Zinc', 'Silicon'],
    description: 'Requires high water holding capacity and clay-rich soil. Very responsive to Zinc in high pH conditions.'
  },
  {
    name: 'Cotton',
    icon: '☁️',
    category: 'Commercial / Fiber',
    season: 'Kharif',
    idealPh: { min: 6.5, max: 8.2 },
    maxEc: 2.5, // High salt tolerance
    minOc: 0.35,
    suitableSoilTypes: ['Black Cotton Soil', 'Clay Loam', 'Alluvial Soil'],
    npkDemand: { n: 'High', p: 'Medium', k: 'High' },
    criticalMicro: ['Boron', 'Zinc', 'Magnesium'],
    description: 'Deep taproot system thrives in black cotton soils. Tolerates moderate salinity, but demands good drainage.'
  },
  {
    name: 'Tomato & Solanaceous Vegetables',
    icon: '🍅',
    category: 'Horticulture / Vegetables',
    season: 'Year-round / Rabi',
    idealPh: { min: 6.0, max: 7.0 },
    maxEc: 1.2, // Low salt tolerance
    minOc: 0.6,
    suitableSoilTypes: ['Red Sandy Loam', 'Alluvial Soil', 'Sandy Clay Loam'],
    npkDemand: { n: 'Medium', p: 'High', k: 'Very High' },
    criticalMicro: ['Calcium', 'Boron', 'Zinc'],
    description: 'Requires loose, well-drained loam rich in organic matter. Sensitive to salinity and high alkalinity.'
  },
  {
    name: 'Sugarcane',
    icon: '🎋',
    category: 'Commercial / Cash Crop',
    season: 'Annual (10-12 months)',
    idealPh: { min: 6.2, max: 7.8 },
    maxEc: 1.8,
    minOc: 0.5,
    suitableSoilTypes: ['Alluvial Soil', 'Clay Loam', 'Black Cotton Soil', 'Red Sandy Loam'],
    npkDemand: { n: 'Very High', p: 'High', k: 'Very High' },
    criticalMicro: ['Iron', 'Zinc', 'Sulphur'],
    description: 'Heavy nutrient and water feeder. Needs deep, friable soil with active biology to sustain ratoon crops.'
  },
  {
    name: 'Chilli & Capsicum',
    icon: '🌶️',
    category: 'Spices / Vegetables',
    season: 'Kharif / Rabi',
    idealPh: { min: 6.2, max: 7.5 },
    maxEc: 1.3,
    minOc: 0.55,
    suitableSoilTypes: ['Red Sandy Loam', 'Clay Loam', 'Alluvial Soil'],
    npkDemand: { n: 'High', p: 'High', k: 'High' },
    criticalMicro: ['Sulphur', 'Zinc', 'Boron'],
    description: 'Prefers well-aerated loam with good drainage. Stagnant water or high salinity causes flower drop.'
  },
  {
    name: 'Maize / Corn',
    icon: '🌽',
    category: 'Cereal / Fodder',
    season: 'Kharif / Rabi',
    idealPh: { min: 6.0, max: 7.5 },
    maxEc: 1.6,
    minOc: 0.45,
    suitableSoilTypes: ['Alluvial Soil', 'Red Sandy Loam', 'Clay Loam'],
    npkDemand: { n: 'High', p: 'Medium', k: 'Medium' },
    criticalMicro: ['Zinc', 'Iron'],
    description: 'Fast-growing cereal with high nitrogen response. Susceptible to white bud when zinc is deficient.'
  },
  {
    name: 'Wheat',
    icon: '🌾',
    category: 'Cereal / Rabi',
    season: 'Rabi (Winter)',
    idealPh: { min: 6.5, max: 7.8 },
    maxEc: 1.8,
    minOc: 0.45,
    suitableSoilTypes: ['Alluvial Soil', 'Clay Loam', 'Black Cotton Soil'],
    npkDemand: { n: 'High', p: 'High', k: 'Medium' },
    criticalMicro: ['Zinc', 'Manganese'],
    description: 'Flourishes in rich alluvial or clay loam soils with cool root zones and balanced phosphorus.'
  },
  {
    name: 'Groundnut (Peanut)',
    icon: '🥜',
    category: 'Oilseed / Legume',
    season: 'Kharif / Summer',
    idealPh: { min: 6.0, max: 7.2 },
    maxEc: 1.1,
    minOc: 0.4,
    suitableSoilTypes: ['Red Sandy Loam', 'Sandy Clay Loam', 'Alluvial Soil'],
    npkDemand: { n: 'Low (Fixes N)', p: 'High', k: 'Medium' },
    criticalMicro: ['Calcium', 'Sulphur', 'Boron'],
    description: 'Requires friable, loose sandy soil for easy peg penetration and pod development. Heavy clay reduces yield.'
  },
  {
    name: 'Pulses (Blackgram / Greengram)',
    icon: '🌱',
    category: 'Pulses / Legumes',
    season: 'Rabi / Summer',
    idealPh: { min: 6.5, max: 7.8 },
    maxEc: 1.2,
    minOc: 0.4,
    suitableSoilTypes: ['Clay Loam', 'Red Sandy Loam', 'Alluvial Soil', 'Black Cotton Soil'],
    npkDemand: { n: 'Low', p: 'High', k: 'Medium' },
    criticalMicro: ['Molybdenum', 'Iron', 'Sulphur'],
    description: 'Natural nitrogen fixers that restore soil health. Highly responsive to PSB and Rhizobium consortia.'
  },
  {
    name: 'Millets (Ragi / Bajra / Jowar)',
    icon: '🌾',
    category: 'Millets / Dryland',
    season: 'Kharif / Dry season',
    idealPh: { min: 5.5, max: 8.5 },
    maxEc: 2.8,
    minOc: 0.3,
    suitableSoilTypes: ['Red Sandy Loam', 'Laterite Soil', 'Sandy Clay Loam', 'Alluvial Soil', 'Clay Loam'],
    npkDemand: { n: 'Low-Medium', p: 'Low', k: 'Low' },
    criticalMicro: ['Iron', 'Zinc'],
    description: 'Extremely drought, salinity and heat hardy. Gives dependable yields even on marginal soils.'
  },
  {
    name: 'Grapes & Pomegranate Orchards',
    icon: '🍇',
    category: 'Horticulture / Fruit',
    season: 'Perennial',
    idealPh: { min: 6.5, max: 7.6 },
    maxEc: 1.0,
    minOc: 0.65,
    suitableSoilTypes: ['Red Sandy Loam', 'Alluvial Soil', 'Sandy Clay Loam'],
    npkDemand: { n: 'Medium', p: 'High', k: 'Very High' },
    criticalMicro: ['Boron', 'Zinc', 'Magnesium', 'Potassium'],
    description: 'High-value fruit crops requiring excellent aeration, low salts, and abundant potassium for sweetness/brix.'
  },
  {
    name: 'Banana',
    icon: '🍌',
    category: 'Commercial / Fruit',
    season: 'Year-round',
    idealPh: { min: 6.5, max: 7.5 },
    maxEc: 1.2,
    minOc: 0.65,
    suitableSoilTypes: ['Alluvial Soil', 'Clay Loam', 'Red Sandy Loam'],
    npkDemand: { n: 'Very High', p: 'Medium', k: 'Extreme' },
    criticalMicro: ['Potassium', 'Boron', 'Magnesium'],
    description: 'Massive nutrient and water consumer. Demands high organic carbon and potash mobilization for heavy bunches.'
  }
]

export const soilTestService = {
  // Scientific crop suitability calculation based on soil chemistry & texture
  calculateCropSuitability(metrics) {
    const ph = Number(metrics.ph) || 7.0
    const ec = Number(metrics.ec) || 0.6
    const oc = Number(metrics.oc) || 0.5
    const soilType = metrics.soilType || 'Clay Loam'

    return CROP_SUITABILITY_RULES.map(crop => {
      let score = 100
      const reasons = []
      const limitations = []

      // 1. pH check
      if (ph >= crop.idealPh.min && ph <= crop.idealPh.max) {
        reasons.push(`pH ${ph} is in optimal root absorption range (${crop.idealPh.min} - ${crop.idealPh.max})`)
      } else if (ph < crop.idealPh.min) {
        const diff = Number((crop.idealPh.min - ph).toFixed(1))
        const penalty = Math.min(35, Math.round(diff * 22))
        score -= penalty
        limitations.push(`Soil is ${diff} units more acidic than ideal (min ${crop.idealPh.min})`)
      } else {
        const diff = Number((ph - crop.idealPh.max).toFixed(1))
        const penalty = Math.min(35, Math.round(diff * 24))
        score -= penalty
        limitations.push(`Soil is ${diff} units more alkaline than preferred (max ${crop.idealPh.max})`)
      }

      // 2. Salinity (EC) check
      if (ec <= crop.maxEc * 0.75) {
        reasons.push(`Salinity (EC ${ec} dS/m) is safe and well below threshold (${crop.maxEc} dS/m)`)
      } else if (ec <= crop.maxEc) {
        score -= 8
        reasons.push(`Salinity is acceptable but near limit (${ec} / ${crop.maxEc} dS/m)`)
      } else {
        const excess = Number((ec - crop.maxEc).toFixed(1))
        const penalty = Math.min(40, Math.round(excess * 30))
        score -= penalty
        limitations.push(`Excess salinity (+${excess} dS/m above tolerance). Risk of salt burn & osmotic stress`)
      }

      // 3. Soil Texture check
      if (crop.suitableSoilTypes.includes(soilType)) {
        score += 5
        reasons.push(`Soil texture (${soilType}) provides ideal root anchorage & moisture dynamics`)
      } else {
        score -= 14
        limitations.push(`Soil texture (${soilType}) is less favorable than preferred types (${crop.suitableSoilTypes.slice(0, 2).join(', ')})`)
      }

      // 4. Organic Carbon check
      if (oc >= crop.minOc) {
        score += 5
      } else {
        const penalty = Math.min(18, Math.round((crop.minOc - oc) * 25))
        score -= penalty
        limitations.push(`Organic carbon is below crop requirement (${oc}% vs target > ${crop.minOc}%)`)
      }

      // Clamp score
      score = Math.max(25, Math.min(98, score))

      let suitability = 'Highly Suitable'
      let badge = 'badge-green'
      if (score < 55) {
        suitability = 'High Risk / Unfavorable'
        badge = 'badge-red'
      } else if (score < 78) {
        suitability = 'Conditionally Suitable'
        badge = 'badge-yellow'
      }

      return {
        ...crop,
        score,
        suitability,
        badge,
        reasons,
        limitations
      }
    }).sort((a, b) => b.score - a.score)
  },

  // Calculate specific target crop gap, pre-measures and recommended products
  evaluateSpecificCrop(metrics, targetCropName) {
    const ph = Number(metrics.ph) || 7.0
    const ec = Number(metrics.ec) || 0.6
    const oc = Number(metrics.oc) || 0.5
    const n = Number(metrics.nitrogen) || 280
    const p = Number(metrics.phosphorus) || 16
    const k = Number(metrics.potassium) || 200
    const acres = Number(metrics.areaAcres) || 1
    const soilType = metrics.soilType || 'Clay Loam'

    const cropRule = CROP_SUITABILITY_RULES.find(c => c.name === targetCropName) || CROP_SUITABILITY_RULES[0]

    const premeasures = []
    const suggestedProducts = []
    const gaps = []

    // 1. pH Gap Analysis & Pre-measures
    if (ph < cropRule.idealPh.min) {
      const diff = (cropRule.idealPh.min - ph).toFixed(1)
      gaps.push({
        parameter: 'Soil Acidity',
        current: `pH ${ph}`,
        required: `pH ${cropRule.idealPh.min} - ${cropRule.idealPh.max}`,
        severity: 'High',
        impact: `Acidic soil restricts Phosphorus, Calcium and root cell elongation in ${cropRule.name}.`
      })
      premeasures.push({
        step: 1,
        title: 'Agricultural Lime / Dolomite Basal Treatment',
        timing: '20 - 25 days before sowing / transplanting',
        instruction: `Incorporate agricultural lime or dolomite during initial field ploughing to neutralize acidity (about ${Math.round(250 * acres)} kg across ${acres} acre(s); confirm the rate with your soil lab or agronomist).`,
        product: SATHYAM_PRODUCTS_MAP.acidityLime
      })
      suggestedProducts.push(SATHYAM_PRODUCTS_MAP.acidityLime)
    } else if (ph > cropRule.idealPh.max) {
      const diff = (ph - cropRule.idealPh.max).toFixed(1)
      gaps.push({
        parameter: 'Soil Alkalinity / Calcareousness',
        current: `pH ${ph}`,
        required: `pH ${cropRule.idealPh.min} - ${cropRule.idealPh.max}`,
        severity: 'High',
        impact: `High pH ties up Micronutrients (Zinc, Iron) and causes root sodium toxicity in ${cropRule.name}.`
      })
      premeasures.push({
        step: 1,
        title: 'SoilRevive / Agricultural Gypsum Soil Amendment',
        timing: '15 - 20 days before sowing',
        instruction: `Apply agricultural gypsum across ${acres} acre(s) as advised by your soil lab, then flood irrigate to flush displaced sodium salts.`,
        product: SATHYAM_PRODUCTS_MAP.alkalinityGypsum
      })
      suggestedProducts.push(SATHYAM_PRODUCTS_MAP.alkalinityGypsum)
    }

    // 2. Salinity (EC) Gap
    if (ec > cropRule.maxEc) {
      gaps.push({
        parameter: 'Electrical Conductivity (Salinity)',
        current: `EC ${ec} dS/m`,
        required: `< ${cropRule.maxEc} dS/m`,
        severity: 'Severe',
        impact: `Salinity exceeds ${cropRule.name}'s tolerance. Young rootlets will burn from osmotic water loss.`
      })
      premeasures.push({
        step: 2,
        title: 'Saline Soil Leaching & Salt Buffering',
        timing: '10 - 15 days before sowing',
        instruction: `Provide good drainage channels and irrigate with good-quality water to wash down soluble salts before sowing.`,
        product: SATHYAM_PRODUCTS_MAP.salinityRemedy
      })
      suggestedProducts.push(SATHYAM_PRODUCTS_MAP.salinityRemedy)
    }

    // 3. Organic Matter & Microbial Soil Humus
    if (oc < 0.6) {
      gaps.push({
        parameter: 'Organic Carbon (OC %)',
        current: `${oc}%`,
        required: `> 0.75% for optimal fertility`,
        severity: oc < 0.45 ? 'High' : 'Moderate',
        impact: `Low organic matter impairs moisture retention and soil biological life.`
      })
      premeasures.push({
        step: premeasures.length + 1,
        title: 'Humus Rebuilding & Mycorrhizal Pre-treatment',
        timing: '7 days before sowing or at final bed preparation',
        instruction: `Incorporate 3-5 tonnes of well-rotted Farmyard Manure (FYM) per acre, with Black Carbon as per label, to rebuild soil organic matter.`,
        product: SATHYAM_PRODUCTS_MAP.organicCarbon
      })
      suggestedProducts.push(SATHYAM_PRODUCTS_MAP.organicCarbon)
    }

    // 4. Nitrogen & Phosphorus Biological Inoculation
    if (n < 280) {
      premeasures.push({
        step: premeasures.length + 1,
        title: 'Biological Nitrogen Inoculation',
        timing: 'Seed treatment or final harrowing',
        instruction: `Use a nitrogen-fixing bio-fertilizer (Azospirillum / Rhizobium) as seed treatment or soil drench, and split nitrogen doses as your agronomist advises.`,
        product: SATHYAM_PRODUCTS_MAP.nitrogenDeficit
      })
      suggestedProducts.push(SATHYAM_PRODUCTS_MAP.nitrogenDeficit)
    }

    if (p < 12) {
      premeasures.push({
        step: premeasures.length + 1,
        title: 'Phosphorus Solubilization (PSB) Basal Mix',
        timing: 'Basal application at planting',
        instruction: `Apply VAM as per label, mixed with well-decomposed compost along seed furrows, to help roots take up soil phosphorus.`,
        product: SATHYAM_PRODUCTS_MAP.phosphorusDeficit
      })
      if (!suggestedProducts.some(p => p?.id === SATHYAM_PRODUCTS_MAP.phosphorusDeficit.id)) {
        suggestedProducts.push(SATHYAM_PRODUCTS_MAP.phosphorusDeficit)
      }
    }

    // 5. Potassium Requirement
    if (k < 130 || cropRule.name === 'Banana' || cropRule.name.includes('Vegetables') || cropRule.name.includes('Grapes')) {
      premeasures.push({
        step: premeasures.length + 1,
        title: 'Potassium Mobilization & Fruit/Grain Filling',
        timing: 'Basal or early vegetative stage',
        instruction: `Apply Kalium 20 as per label to support drought tolerance and produce quality.`,
        product: SATHYAM_PRODUCTS_MAP.potashDeficit
      })
      suggestedProducts.push(SATHYAM_PRODUCTS_MAP.potashDeficit)
    }

    // 6. Micronutrient Precaution
    if (metrics.zinc === 'Deficient') {
      premeasures.push({
        step: premeasures.length + 1,
        title: 'Zinc Chelate Foliar Armor',
        timing: '20 - 25 days after germination/transplanting',
        instruction: `Correct zinc with a micronutrient spray such as Shakthi Dayanutri – Pro, as per label, to prevent leaf bronzing and chlorosis.`,
        product: SATHYAM_PRODUCTS_MAP.zincDeficit
      })
      suggestedProducts.push(SATHYAM_PRODUCTS_MAP.zincDeficit)
    }

    if (metrics.boron === 'Deficient') {
      premeasures.push({
        step: premeasures.length + 1,
        title: 'SoluBor Flower Setting & Pollination Boost',
        timing: 'Just prior to floral initiation / bud formation',
        instruction: `Correct boron with a micronutrient spray such as Shakthi Dayanutri – Pro, as per label, to reduce flower drop and support fruit/grain set.`,
        product: SATHYAM_PRODUCTS_MAP.boronDeficit
      })
      suggestedProducts.push(SATHYAM_PRODUCTS_MAP.boronDeficit)
    }

    // If perfectly balanced, provide maintenance protocol
    if (premeasures.length === 0) {
      premeasures.push({
        step: 1,
        title: 'Preventive Soil Biology Maintenance',
        timing: 'At sowing & active tillering',
        instruction: `Soil parameters are optimal for ${cropRule.name}! Maintain organic matter with FYM and Soil Gold as per label to sustain yields.`,
        product: SATHYAM_PRODUCTS_MAP.soilMaintenance
      })
      suggestedProducts.push(SATHYAM_PRODUCTS_MAP.soilMaintenance)
    }

    return {
      targetCrop: cropRule,
      gaps,
      premeasures,
      suggestedProducts: [...new Map(suggestedProducts.filter(Boolean).map(item => [item.id, item])).values()]
    }
  },

  // Main soil analysis pipeline
  analyzeSoil(metrics) {
    const ph = Number(metrics.ph) || 7.0
    const ec = Number(metrics.ec) || 0.6
    const oc = Number(metrics.oc) || 0.5
    const n = Number(metrics.nitrogen) || 280
    const p = Number(metrics.phosphorus) || 16
    const k = Number(metrics.potassium) || 200
    const crop = metrics.crop || 'Paddy/Rice'
    const acres = Number(metrics.areaAcres) || 1

    let score = 100
    const deductions = []

    // 1. pH Evaluation
    let phStatus = 'Optimal'
    let phColor = '#16a34a'
    let phAdvice = 'Soil pH is well-balanced within the neutral zone (6.5 - 7.5), enabling maximum nutrient bio-availability.'

    if (ph < 6.0) {
      phStatus = 'Acidic'
      phColor = '#ef4444'
      score -= 18
      deductions.push('Acidic soil restricts Phosphorus, Calcium & Magnesium availability')
      phAdvice = `Soil is strongly acidic (pH ${ph}). High acidity locks phosphorus and promotes aluminum toxicity. Apply Agricultural Lime (Calcium Carbonate) or Dolomite @ 250 - 400 kg/acre 2 weeks before sowing.`
    } else if (ph > 7.8) {
      phStatus = 'Alkaline'
      phColor = '#f59e0b'
      score -= 16
      deductions.push('Alkaline pH leads to micro-nutrient lockup (especially Zinc & Iron)')
      phAdvice = `Soil is alkaline (pH ${ph}). Free sodium and calcium carbonates tie up micronutrients. Apply agricultural gypsum (commonly 300 - 500 kg/acre; confirm with your soil lab) to replace sodium with calcium.`
    }

    // 2. Electrical Conductivity
    let ecStatus = 'Normal'
    let ecColor = '#16a34a'
    let ecAdvice = 'Soil soluble salts are within safe non-saline limits (< 1.0 dS/m).'

    if (ec > 1.2 && ec <= 2.0) {
      ecStatus = 'Critical Salinity'
      ecColor = '#f59e0b'
      score -= 14
      deductions.push('Elevated salinity may impede seed germination and young seedling root elongation')
      ecAdvice = `Salinity level (EC ${ec} dS/m) is elevated. Ensure deep drainage trenches, practice flood leaching with good quality canal water, and incorporate green manure (Sesbania/Dhaincha).`
    } else if (ec > 2.0) {
      ecStatus = 'Injurious Salinity'
      ecColor = '#ef4444'
      score -= 25
      deductions.push('Severe salinity will cause salt burn and poor osmotic moisture absorption')
      ecAdvice = `High salinity (EC ${ec} dS/m) poses severe toxicity. Avoid chloride fertilizers. Provide irrigation leaching with good-quality water and improve drainage.`
    }

    // 3. Organic Carbon
    let ocStatus = 'Optimal'
    let ocColor = '#16a34a'
    let ocAdvice = `Organic Carbon is healthy (${oc}%), sustaining abundant soil beneficial microbiome.`

    if (oc < 0.5) {
      ocStatus = 'Low'
      ocColor = '#ef4444'
      score -= 20
      deductions.push('Low organic matter drastically limits microbial biological fertility')
      ocAdvice = `Organic Carbon is critically low (${oc}% vs target > 0.75%). Apply well-decomposed Farmyard Manure (FYM) @ 5 tonnes/acre, with Black Carbon as per label, to rebuild soil humus.`
    } else if (oc >= 0.5 && oc < 0.75) {
      ocStatus = 'Moderate'
      ocColor = '#f59e0b'
      score -= 8
      ocAdvice = `Organic Carbon is moderate (${oc}%). Regular bio-composting and crop residue mulching recommended.`
    }

    // 4. Nitrogen
    let nStatus = 'Optimal'
    let nColor = '#16a34a'
    if (n < 280) {
      nStatus = 'Deficient'
      nColor = '#ef4444'
      score -= 15
      deductions.push('Nitrogen deficit leads to pale stunted foliage and reduced tiller count')
    } else if (n > 560) {
      nStatus = 'High'
      nColor = '#3b82f6'
    }

    // 5. Phosphorus
    let pStatus = 'Optimal'
    let pColor = '#16a34a'
    if (p < 10) {
      pStatus = 'Deficient'
      pColor = '#ef4444'
      score -= 15
      deductions.push('Phosphorus deficiency delays root establishment and floral initiation')
    }

    // 6. Potassium
    let kStatus = 'Optimal'
    let kColor = '#16a34a'
    if (k < 110) {
      kStatus = 'Deficient'
      kColor = '#ef4444'
      score -= 12
      deductions.push('Potassium deficiency lowers drought tolerance and disease resistance')
    }

    // 7. Micronutrients
    if (metrics.zinc === 'Deficient') score -= 6
    if (metrics.boron === 'Deficient') score -= 5

    // Normalize final score
    score = Math.max(35, Math.min(98, score))

    let grade = 'Grade A (Excellent Fertility)'
    let gradeBadge = 'badge-green'
    if (score < 60) {
      grade = 'Grade D (Degraded - Immediate Care Required)'
      gradeBadge = 'badge-red'
    } else if (score < 75) {
      grade = 'Grade C (Moderate Fertility - Deficiencies Present)'
      gradeBadge = 'badge-yellow'
    } else if (score < 88) {
      grade = 'Grade B (Good Fertility - Minor Adjustments Needed)'
      gradeBadge = 'badge-blue'
    }

    // Calculate crop suitability recommendations
    const cropSuitability = this.calculateCropSuitability(metrics)
    const highlySuitableCrops = cropSuitability.filter(c => c.suitability === 'Highly Suitable')
    const conditionallySuitableCrops = cropSuitability.filter(c => c.suitability === 'Conditionally Suitable')

    // Specific target crop evaluation
    const specificEvaluation = this.evaluateSpecificCrop(metrics, crop)

    return {
      score,
      grade,
      gradeBadge,
      crop,
      acres,
      deductions,
      parameters: {
        ph: { value: ph, status: phStatus, color: phColor, advice: phAdvice, optimalRange: '6.5 - 7.5' },
        ec: { value: ec, status: ecStatus, color: ecColor, advice: ecAdvice, optimalRange: '< 1.0 dS/m' },
        oc: { value: oc, status: ocStatus, color: ocColor, advice: ocAdvice, optimalRange: '> 0.75 %' },
        nitrogen: { value: n, status: nStatus, color: nColor, optimalRange: '280 - 560 kg/ha' },
        phosphorus: { value: p, status: pStatus, color: pColor, optimalRange: '10 - 25 kg/ha' },
        potassium: { value: k, status: kStatus, color: kColor, optimalRange: '110 - 280 kg/ha' },
        zinc: metrics.zinc || 'Deficient',
        boron: metrics.boron || 'Deficient',
        iron: metrics.iron || 'Sufficient',
        sulphur: metrics.sulphur || 'Sufficient'
      },
      cropSuitability,
      highlySuitableCrops,
      conditionallySuitableCrops,
      specificEvaluation,
      actionPlan: specificEvaluation.premeasures,
      recommendedProducts: specificEvaluation.suggestedProducts
    }
  },

  // Save a soil report for review by the agronomy team (requires sign-in).
  // The server ties it to the signed-in account.
  async submitReport(reportData) {
    const { analysis, ...values } = reportData || {}
    const res = await axios.post('/api/soil-reports', { ...values, analysis: analysis || null })
    const report = unwrap(res, 'Could not submit the soil report')
    notifyUpdated({ reportId: report.id })
    return report
  },

  // Reports visible to the signed-in account: farmers their own, staff the
  // ones assigned to them, admins all. The server does the filtering.
  async getReports() {
    const res = await axios.get('/api/soil-reports')
    const list = unwrap(res, 'Failed to load soil reports')
    return Array.isArray(list) ? list : []
  },

  // Admin / Super Admin assign a report to a staff member
  async assignReport({ reportId, staffId, staffDesignation, notes = '' }) {
    const res = await axios.put(`/api/soil-reports/${encodeURIComponent(reportId)}/assign`, { staffId, staffDesignation, notes })
    const report = unwrap(res, 'Could not assign the report')
    notifyUpdated({ reportId })
    return report
  },

  // Update report status and/or the agronomist's prescription notes
  async updateReportStatus({ reportId, status, agronomistNotes, suggestedProducts }) {
    const res = await axios.put(`/api/soil-reports/${encodeURIComponent(reportId)}/status`, { status, agronomistNotes, suggestedProducts })
    const report = unwrap(res, 'Could not update the report')
    notifyUpdated({ reportId })
    return report
  }
}
