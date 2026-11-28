// Dynamic category-specific request specification templates & display formatters.
// Adapts the Open Request / Direct Inquiry form to each gardening service category.

const TEMPLATES = {
  landscaping: {
    key: 'landscaping',
    title: 'Landscaping specifications',
    subtitle: 'Share your layout style, hardscape materials, requested plants, and target materials budget so gardeners can quote accurately.',
    areaLabel: 'Estimated landscaping area (sq. meters)',
    areaPlaceholder: 'e.g., 40',
    descriptionPlaceholder: 'Describe your landscaping vision (e.g., front yard makeover, garden borders, focal trees, walkways).',
    recommendedAddonTypes: ['plant', 'material'],
    fields: [
      {
        key: 'landscape_style',
        label: 'Preferred landscape style',
        type: 'select',
        options: [
          'Tropical / Resort style',
          'Modern minimalist',
          'Courtyard & stone pathway',
          'Low-maintenance native garden',
          'Zen / ornamental rock garden',
          'Open to gardener recommendation',
        ],
      },
      {
        key: 'sunlight_water_access',
        label: 'Sunlight & water source',
        type: 'select',
        options: [
          'Full sun + outdoor faucet nearby',
          'Partial shade + outdoor faucet nearby',
          'Mostly shaded area',
          'Limited water access',
        ],
      },
      {
        key: 'hardscape_materials',
        label: 'Materials & site preparation needed',
        type: 'multiselect',
        options: [
          'Stepping stones / pavers',
          'Decorative gravel / pebbles',
          'Garden edging / borders',
          'Topsoil & ground leveling',
          'Mulch / coco peat',
          'Drainage improvement',
        ],
      },
      {
        key: 'requested_plants',
        label: 'Plants, trees, or grass turf requested',
        type: 'textarea',
        placeholder: 'e.g., 10 bougainvillea, 2 dwarf palms, carabao grass turf, ornamental border plants',
      },
    ],
  },
  lawn_care: {
    key: 'lawn_care',
    title: 'Lawn care specifications',
    subtitle: 'Tell gardeners about your grass type, overgrowth level, and mowing/hauling needs.',
    areaLabel: 'Estimated lawn area (sq. meters)',
    areaPlaceholder: 'e.g., 60',
    descriptionPlaceholder: 'Describe your lawn layout, slope, obstacles, and target cleanliness.',
    recommendedAddonTypes: ['plant', 'disposal'],
    fields: [
      {
        key: 'grass_type',
        label: 'Grass type',
        type: 'select',
        options: ['Carabao grass', 'Bermuda grass', 'Frog grass', 'Mixed / Not sure'],
      },
      {
        key: 'grass_condition',
        label: 'Current grass height / condition',
        type: 'select',
        options: [
          'Routine trim (under 10 cm)',
          'Tall / overgrown (10–30 cm)',
          'Heavy weeds / dense grass (over 30 cm)',
        ],
      },
      {
        key: 'lawn_tasks',
        label: 'Lawn tasks needed',
        type: 'multiselect',
        options: [
          'Grass mowing / brush cutting',
          'Border edging',
          'Manual weed removal',
          'Fertilizing / top-dressing',
          'Grass clippings bagging & hauling',
        ],
      },
      {
        key: 'equipment_note',
        label: 'Equipment availability',
        type: 'select',
        options: [
          'Gardener brings grass cutter & tools',
          'Client has lawn mower available on site',
        ],
      },
    ],
  },
  tree_plant_care: {
    key: 'tree_plant_care',
    title: 'Tree & plant care specifications',
    subtitle: 'Specify tree/plant count, height, and pruning or storm-safety requirements so gardeners bring proper gear.',
    areaLabel: 'Estimated work zone (sq. meters)',
    areaPlaceholder: 'e.g., 20',
    descriptionPlaceholder: 'Mention tree species (e.g., mango, palm, bougainvillea), nearby roof/wires, or plant health symptoms.',
    recommendedAddonTypes: ['equipment', 'disposal'],
    fields: [
      {
        key: 'tree_plant_count',
        label: 'Number of trees / large plants',
        type: 'number',
        placeholder: 'e.g., 3',
      },
      {
        key: 'tree_height',
        label: 'Approximate height',
        type: 'select',
        options: [
          'Under 2 meters (shrubs / small plants)',
          '2–5 meters (medium trees)',
          'Over 5 meters (tall — ladder/climbing gear needed)',
        ],
      },
      {
        key: 'care_tasks',
        label: 'Care & pruning tasks',
        type: 'multiselect',
        options: [
          'Pruning & canopy shaping',
          'Typhoon / storm-safety branch trimming',
          'Pest or disease treatment',
          'Planting / transplanting',
          'Fallen branch or stump clearing',
        ],
      },
      {
        key: 'debris_disposal',
        label: 'Branch & green-waste disposal',
        type: 'select',
        options: [
          'Gardener hauls branches & debris away',
          'Cut and stack neatly on site',
        ],
      },
      {
        key: 'requested_plants',
        label: 'Fertilizer, soil, or new plants needed (optional)',
        type: 'text',
        placeholder: 'e.g., Organic compost, pest spray, 2 calamansi saplings',
      },
    ],
  },
  potted_terrace: {
    key: 'potted_terrace',
    title: 'Potted & terrace garden specifications',
    subtitle: 'Share your balcony or terrace setup, pot count, and sunlight level for container plant recommendations.',
    areaLabel: 'Estimated balcony / terrace area (sq. meters)',
    areaPlaceholder: 'e.g., 12',
    descriptionPlaceholder: 'Describe your balcony, rooftop, or porch space, railings, and preferred plant look.',
    recommendedAddonTypes: ['plant', 'material'],
    fields: [
      {
        key: 'space_type',
        label: 'Outdoor space type',
        type: 'select',
        options: ['Balcony', 'Rooftop / Terrace', 'Front porch / Patio', 'Indoor / Semi-outdoor corner'],
      },
      {
        key: 'pot_count',
        label: 'Estimated number of pots / planters',
        type: 'number',
        placeholder: 'e.g., 12',
      },
      {
        key: 'sunlight_level',
        label: 'Sunlight exposure',
        type: 'select',
        options: ['Full direct sunlight', 'Morning sun / partial shade', 'Mostly shaded / indirect light'],
      },
      {
        key: 'terrace_tasks',
        label: 'Container garden tasks',
        type: 'multiselect',
        options: [
          'Repotting & fresh potting soil',
          'New potted plant setup',
          'Hanging planters / vertical rack',
          'Pruning & fertilizing',
          'Drainage tray / cleanliness check',
        ],
      },
      {
        key: 'requested_plants',
        label: 'Requested plants, herbs, or pot types',
        type: 'textarea',
        placeholder: 'e.g., Kitchen herbs (basil, mint), snake plants, terracotta or white ceramic pots',
      },
    ],
  },
  garden_maintenance: {
    key: 'garden_maintenance',
    title: 'Garden maintenance specifications',
    subtitle: 'Let gardeners know your upkeep frequency and routine cleaning/trimming checklist.',
    areaLabel: 'Estimated garden area (sq. meters)',
    areaPlaceholder: 'e.g., 30',
    descriptionPlaceholder: 'Describe the current condition of your garden and which areas need regular care.',
    recommendedAddonTypes: ['material', 'disposal'],
    fields: [
      {
        key: 'maintenance_frequency',
        label: 'Service frequency',
        type: 'select',
        options: ['One-time deep cleanup', 'Weekly upkeep', 'Bi-weekly (every 2 weeks)', 'Monthly maintenance'],
      },
      {
        key: 'maintenance_tasks',
        label: 'Maintenance checklist',
        type: 'multiselect',
        options: [
          'Weeding & bed clearing',
          'Hedge & shrub trimming',
          'Leaf sweeping & yard tidying',
          'Watering & fertilizing',
          'Pest check',
          'Green-waste disposal / hauling',
        ],
      },
      {
        key: 'requested_plants',
        label: 'Replacement plants or soil needed (optional)',
        type: 'text',
        placeholder: 'e.g., 2 bags garden soil, replace dried border plants',
      },
    ],
  },
  garden_improvement: {
    key: 'garden_improvement',
    title: 'Garden improvement specifications',
    subtitle: 'Outline what you want to upgrade in your existing garden along with any materials or plant budget.',
    areaLabel: 'Estimated improvement area (sq. meters)',
    areaPlaceholder: 'e.g., 25',
    descriptionPlaceholder: 'Explain what is currently in your garden and what upgrades you want to achieve.',
    recommendedAddonTypes: ['plant', 'material'],
    fields: [
      {
        key: 'improvement_goals',
        label: 'Upgrade goals',
        type: 'multiselect',
        options: [
          'Soil replacement & composting',
          'New flower beds / borders',
          'Pathway / gravel refresh',
          'Drainage fix',
          'Trellis / shade net setup',
          'Grass turf patching',
        ],
      },
      {
        key: 'requested_plants',
        label: 'Plants & decorative materials requested',
        type: 'textarea',
        placeholder: 'e.g., White pebbles, 15 sq.m carabao grass patch, colorful ornamental shrubs',
      },
    ],
  },
  general_default: {
    key: 'general_default',
    title: 'Project requirements & materials',
    subtitle: 'Add specific plants, materials, or site details to help gardeners prepare accurate quotations.',
    areaLabel: 'Estimated area (sq. meters)',
    areaPlaceholder: 'e.g., 25',
    descriptionPlaceholder: 'Describe your outdoor space, goals, and any details that may help gardeners prepare an offer.',
    recommendedAddonTypes: ['plant', 'material'],
    fields: [
      {
        key: 'requested_plants',
        label: 'Requested plants, soil, or materials (optional)',
        type: 'textarea',
        placeholder: 'List any specific plants, grass turf, gravel, soil, or pots you want included.',
      },
      {
        key: 'site_access_notes',
        label: 'Site access / water source notes (optional)',
        type: 'text',
        placeholder: 'e.g., Gate access on weekdays, outdoor faucet available',
      },
    ],
  },
}

const ALL_FIELD_META = new Map()
for (const tpl of Object.values(TEMPLATES)) {
  for (const field of tpl.fields) {
    if (!ALL_FIELD_META.has(field.key)) {
      ALL_FIELD_META.set(field.key, field)
    }
  }
}

export function resolveCategoryTemplate(categoryName) {
  const name = String(categoryName || '').trim().toLowerCase()
  if (!name) return TEMPLATES.general_default
  if (name.includes('landscap')) return TEMPLATES.landscaping
  if (name.includes('lawn')) return TEMPLATES.lawn_care
  if (name.includes('tree')) return TEMPLATES.tree_plant_care
  if (name.includes('pot') || name.includes('terrace') || name.includes('balcon')) return TEMPLATES.potted_terrace
  if (name.includes('mainten')) return TEMPLATES.garden_maintenance
  if (name.includes('improv') || name.includes('upgrad')) return TEMPLATES.garden_improvement
  return TEMPLATES.general_default
}

export function formatCategorySpecsForDisplay(categorySpecs, categoryName = '') {
  if (!categorySpecs || typeof categorySpecs !== 'object' || Array.isArray(categorySpecs)) return []
  const template = resolveCategoryTemplate(categoryName)
  const templateFieldsByKey = new Map(template.fields.map((f) => [f.key, f]))

  const rows = []
  for (const [key, rawVal] of Object.entries(categorySpecs)) {
    if (rawVal === undefined || rawVal === null || rawVal === '') continue
    if (Array.isArray(rawVal) && rawVal.length === 0) continue

    const meta = templateFieldsByKey.get(key) || ALL_FIELD_META.get(key)
    const label = meta?.label
      ? meta.label.replace(/\s*\(optional\)/i, '').replace(/\s*\(PHP(?:,\s*optional)?\)/i, '')
      : key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (ch) => ch.toUpperCase())

    let displayValue
    if (Array.isArray(rawVal)) {
      displayValue = rawVal.join(', ')
    } else if (typeof rawVal === 'boolean') {
      displayValue = rawVal ? 'Yes' : 'No'
    } else if (typeof rawVal === 'number' && (meta?.isCurrency || /budget|cost/i.test(key))) {
      displayValue = `₱${rawVal.toLocaleString()}`
    } else {
      displayValue = String(rawVal)
    }
    rows.push({ key, label, value: displayValue })
  }
  return rows
}
