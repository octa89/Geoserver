/**
 * FilterForm — filter entry form with autocomplete suggestions and date support.
 *
 * Matches the vanilla JS filter form exactly:
 * - Detects date fields and switches to native date picker (type="date")
 * - Supports BETWEEN operator with From/To inputs
 * - Autocomplete suggestions for non-date text fields
 * - CONTAINS, LIKE, ILIKE operators with hint text
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { FilterDef } from '../../types/layer';
import {
  FILTER_OPERATORS,
  NULL_OPERATORS,
  makeFilterDef,
  type FilterOperator,
} from './filterUtils';
import { getLayerRefs } from '../../store/leafletRegistry';
import { isDateField } from '../../lib/colorUtils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SUGGESTIONS = 50;
const MAX_FILTERED = 30;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FilterFormProps {
  layerName: string;
  fields: string[];
  onAdd: (filter: FilterDef) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractUniqueValues(
  geojson: GeoJSON.FeatureCollection | undefined,
  field: string
): string[] {
  if (!geojson?.features) return [];
  const valSet = new Set<string>();
  for (const f of geojson.features) {
    const v = f.properties?.[field];
    if (v === null || v === undefined || v === '') continue;
    valSet.add(String(v));
  }
  return Array.from(valSet).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );
}

// ---------------------------------------------------------------------------
// FilterForm
// ---------------------------------------------------------------------------

export function FilterForm({ layerName, fields, onAdd }: FilterFormProps) {
  const [field, setField] = useState<string>(fields[0] ?? '');
  const [operator, setOperator] = useState<FilterOperator>('=');
  const [value, setValue] = useState('');
  const [valueEnd, setValueEnd] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const isNullOp = NULL_OPERATORS.includes(operator);
  const isBetween = operator === 'BETWEEN';
  const isLikeOp = operator === 'LIKE' || operator === 'ILIKE';
  const isContains = operator === 'CONTAINS';

  // Reset field when layer changes
  useEffect(() => {
    setField(fields[0] ?? '');
    setValue('');
    setValueEnd('');
    setShowSuggestions(false);
  }, [layerName, fields]);

  // Detect if current field is a date field
  const currentIsDate = useMemo(() => {
    if (!field || !layerName) return false;
    const refs = getLayerRefs(layerName);
    if (!refs?.geojson) return false;
    return isDateField(refs.geojson, field);
  }, [layerName, field]);

  // Extract unique values for current field (skip for date fields)
  const uniqueValues = useMemo(() => {
    if (!field || !layerName || currentIsDate) return [];
    const refs = getLayerRefs(layerName);
    return extractUniqueValues(refs?.geojson, field);
  }, [layerName, field, currentIsDate]);

  // Filtered suggestions based on current input
  const filteredSuggestions = useMemo(() => {
    if (uniqueValues.length === 0) return [];
    if (!value) return uniqueValues.slice(0, MAX_SUGGESTIONS);
    const lower = value.toLowerCase();
    return uniqueValues
      .filter((v) => v.toLowerCase().includes(lower))
      .slice(0, MAX_FILTERED);
  }, [uniqueValues, value]);

  // Close suggestions and reset value when field changes
  useEffect(() => {
    setShowSuggestions(false);
    setValue('');
    setValueEnd('');
  }, [field]);

  const handleAdd = useCallback(() => {
    if (!field) return;
    if (!isNullOp && value.trim() === '') return;
    if (isBetween && valueEnd.trim() === '') return;

    const filter = makeFilterDef(field, operator, value.trim(), valueEnd.trim(), currentIsDate);
    onAdd(filter);
    setValue('');
    setValueEnd('');
    setShowSuggestions(false);
  }, [field, isNullOp, isBetween, value, valueEnd, operator, onAdd, currentIsDate]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAdd();
    else if (e.key === 'Escape') setShowSuggestions(false);
  };

  const handleSuggestionClick = (val: string) => {
    setValue(val);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const handleInputFocus = () => {
    if (!currentIsDate && uniqueValues.length > 0) setShowSuggestions(true);
  };

  const handleInputBlur = () => {
    setTimeout(() => setShowSuggestions(false), 150);
  };

  // Hint text matching vanilla JS
  const hintText = (() => {
    if (isNullOp) return null;
    if (currentIsDate && !isNullOp) return isBetween ? 'Select a date range' : 'Select a date';
    if (isContains) return 'Case-insensitive substring match';
    if (isLikeOp) return 'Use % as wildcard for LIKE (e.g. %Main%)';
    return null;
  })();

  const inputType = currentIsDate ? 'date' : 'text';

  return (
    <div style={{ marginBottom: 6 }}>
      {/* Row 1: field + operator */}
      <div className="filter-row">
        <select
          value={field}
          onChange={(e) => setField(e.target.value)}
          style={{ flex: 2, minWidth: 0 }}
          aria-label="Filter field"
        >
          {fields.length === 0 && <option value="">— no fields —</option>}
          {fields.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>

        <select
          value={operator}
          onChange={(e) => setOperator(e.target.value as FilterOperator)}
          style={{ flex: 1, minWidth: 0 }}
          aria-label="Filter operator"
        >
          {FILTER_OPERATORS.map((op) => (
            <option key={op} value={op}>{op}</option>
          ))}
        </select>
      </div>

      {/* Value input (hidden for IS NULL / IS NOT NULL) */}
      {!isNullOp && (
        <>
          {/* Label for BETWEEN "From" */}
          {isBetween && (
            <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>From</div>
          )}

          <div className="filter-row" style={{ position: 'relative' }}>
            <div className="filter-autocomplete-wrap" style={{ flex: 1, position: 'relative' }}>
              <input
                ref={inputRef}
                type={inputType}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (!currentIsDate && uniqueValues.length > 0) setShowSuggestions(true);
                }}
                onKeyDown={handleKeyDown}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                placeholder={currentIsDate ? '' : 'Enter value...'}
                style={{ width: '100%' }}
                autoComplete="off"
                aria-label="Filter value"
              />
              {!currentIsDate && showSuggestions && filteredSuggestions.length > 0 && (
                <div ref={suggestionsRef} className="filter-suggestions open">
                  {filteredSuggestions.map((val, i) => (
                    <div
                      key={`${val}-${i}`}
                      className="filter-suggestion-item"
                      title={val}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSuggestionClick(val);
                      }}
                    >
                      {val}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* End value for BETWEEN */}
          {isBetween && (
            <>
              <div style={{ fontSize: 10, color: '#888', marginBottom: 2, marginTop: 4 }}>To</div>
              <div className="filter-row">
                <input
                  type={inputType}
                  value={valueEnd}
                  onChange={(e) => setValueEnd(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={currentIsDate ? '' : 'End value...'}
                  style={{ flex: 1 }}
                  autoComplete="off"
                  aria-label="Filter end value"
                />
              </div>
            </>
          )}

          {/* Hint text */}
          {hintText && (
            <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{hintText}</div>
          )}
        </>
      )}

      {/* Add button */}
      <button
        className="filter-add-btn"
        onClick={handleAdd}
        disabled={
          fields.length === 0 ||
          (!isNullOp && value.trim() === '') ||
          (isBetween && valueEnd.trim() === '')
        }
        style={{ width: '100%' }}
      >
        + Add Filter
      </button>
    </div>
  );
}
