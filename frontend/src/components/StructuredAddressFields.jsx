import {
  OTHER_BARANGAY_VALUE,
  ZAMBOANGA_BARANGAYS,
  formatAddressPreview,
} from '../utils/zamboangaAddress'

export default function StructuredAddressFields({
  value,
  onChange,
  required = true,
  disabled = false,
  showPreview = true,
}) {
  const parts = value || {}
  const preview = formatAddressPreview(parts)

  function handleFieldChange(field) {
    return (event) => {
      const nextVal = event.target.value
      const nextParts = { ...parts, [field]: nextVal }
      if (field === 'barangay' && nextVal !== OTHER_BARANGAY_VALUE) {
        nextParts.customBarangay = ''
      }
      onChange(nextParts)
    }
  }

  return (
    <div className="structured-address-grid">
      <label>
        House / Unit / Purok &amp; Street
        <input
          name="addressStreet"
          required={required}
          disabled={disabled}
          maxLength="150"
          autoComplete="address-line1"
          placeholder="e.g., Purok 2, 123 Gov. Alvarez St."
          value={parts.street || ''}
          onChange={handleFieldChange('street')}
        />
      </label>

      <div className="form-row">
        <label>
          Barangay
          <select
            name="addressBarangay"
            required={required}
            disabled={disabled}
            value={parts.barangay || ''}
            onChange={handleFieldChange('barangay')}
          >
            <option value="">Select barangay...</option>
            {ZAMBOANGA_BARANGAYS.map((brgy) => (
              <option key={brgy} value={brgy}>{brgy}</option>
            ))}
            <option value={OTHER_BARANGAY_VALUE}>Other (type manually)</option>
          </select>
        </label>

        <label>
          Subdivision / Landmark <span className="label-note">(Optional)</span>
          <input
            name="addressLandmark"
            disabled={disabled}
            maxLength="100"
            autoComplete="address-line2"
            placeholder="e.g., Near Cabatangan Elem. School"
            value={parts.landmark || ''}
            onChange={handleFieldChange('landmark')}
          />
        </label>
      </div>

      {parts.barangay === OTHER_BARANGAY_VALUE && (
        <label>
          Specify Barangay
          <input
            name="addressCustomBarangay"
            required={required}
            disabled={disabled}
            maxLength="80"
            placeholder="Enter your barangay name"
            value={parts.customBarangay || ''}
            onChange={handleFieldChange('customBarangay')}
          />
        </label>
      )}

      <div className="form-row form-row-3">
        <label>
          City / Municipality
          <input
            name="city"
            aria-label="City"
            required={required}
            disabled={disabled}
            maxLength="100"
            autoComplete="address-level2"
            placeholder="Zamboanga City"
            value={parts.city || ''}
            onChange={handleFieldChange('city')}
          />
        </label>

        <label>
          Province <span className="label-note">(Optional)</span>
          <input
            name="addressProvince"
            disabled={disabled}
            maxLength="80"
            autoComplete="address-level1"
            placeholder="Zamboanga del Sur"
            value={parts.province || ''}
            onChange={handleFieldChange('province')}
          />
        </label>

        <label>
          ZIP / Postal code <span className="label-note">(Optional)</span>
          <input
            name="addressPostalCode"
            disabled={disabled}
            inputMode="numeric"
            maxLength="4"
            pattern="\d{4}"
            autoComplete="postal-code"
            placeholder="7000"
            value={parts.postalCode || ''}
            onChange={handleFieldChange('postalCode')}
          />
        </label>
      </div>

      {showPreview && preview && (
        <p className="structured-address-preview" aria-live="polite">
          <span>Saved address:</span> {preview}
        </p>
      )}
    </div>
  )
}
