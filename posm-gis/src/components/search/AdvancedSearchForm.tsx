import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  SEARCH_OPERATORS,
  type SearchCondition,
  type SearchOperator,
  type ConditionGroup,
} from './searchTypes';
import { getLayerRefs } from '../../store/leafletRegistry';
import { useStore } from '../../store';
import { isDateField } from '../../lib/colorUtils';
import { extractUniqueValues } from '../../lib/fieldUtils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SUGGESTIONS = 50;
const MAX_FILTERED = 30;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LayerOption {
  value: string;
  label: string;
}

interface AdvancedSearchFormProps {
  layerOptions: LayerOption[];
  conditionGroups: ConditionGroup[];
  onConditionGroupsChange: (groups: ConditionGroup[]) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

let nextId = 1;

export function AdvancedSearchForm({
  layerOptions,
  conditionGroups,
  onConditionGroupsChange,
}: AdvancedSearchFormProps) {
  const [selectedLayer, setSelectedLayer] = useState<string>(
    layerOptions[0]?.value ?? ''
  );
  const [field, setField] = useState<string>('__any__');
  const [operator, setOperator] = useState<SearchOperator>('CONTAINS');
  const [value, setValue] = useState('');
  const [valueEnd, setValueEnd] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const valueRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [suggestionsPos, setSuggestionsPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Total condition count across all groups
  const totalConditions = conditionGroups.reduce(
    (sum, g) => sum + g.conditions.length,
    0
  );

  // Fields for the selected layer
  const layerFields = useMemo(() => {
    if (!selectedLayer) return [];
    const layers = useStore.getState().layers;
    return layers[selectedLayer]?.fields ?? [];
  }, [selectedLayer]);

  // Detect if current field is a date field
  const currentIsDate = useMemo(() => {
    if (field === '__any__' || !field || !selectedLayer) return false;
    const refs = getLayerRefs(selectedLayer);
    return refs?.geojson ? isDateField(refs.geojson, field) : false;
  }, [selectedLayer, field]);

  // Unique values for current layer + field
  const uniqueValues = useMemo(() => {
    if (field === '__any__' || !field || !selectedLayer || currentIsDate) return [];
    const refs = getLayerRefs(selectedLayer);
    return extractUniqueValues(refs?.geojson, field);
  }, [selectedLayer, field, currentIsDate]);

  // Filtered suggestions based on current input
  const filteredSuggestions = useMemo(() => {
    if (uniqueValues.length === 0) return [];
    if (!value) return uniqueValues.slice(0, MAX_SUGGESTIONS);
    const lower = value.toLowerCase();
    return uniqueValues
      .filter((v) => v.toLowerCase().includes(lower))
      .slice(0, MAX_FILTERED);
  }, [uniqueValues, value]);

  // Compute fixed position for suggestions dropdown to escape overflow
  useEffect(() => {
    if (showSuggestions && filteredSuggestions.length > 0 && valueRef.current) {
      const rect = valueRef.current.getBoundingClientRect();
      setSuggestionsPos({ top: rect.bottom, left: rect.left, width: rect.width });
    } else {
      setSuggestionsPos(null);
    }
  }, [showSuggestions, filteredSuggestions.length]);

  const isBetween = operator === 'BETWEEN';
  const isNullOp = operator === 'IS_NULL' || operator === 'IS_NOT_NULL';
  const inputType = currentIsDate ? 'date' : 'text';

  const getLayerLabel = useCallback(
    (name: string) => layerOptions.find((o) => o.value === name)?.label ?? name,
    [layerOptions]
  );

  const handleLayerChange = useCallback((newLayer: string) => {
    setSelectedLayer(newLayer);
    setField('__any__');
    setValue('');
    setValueEnd('');
    setShowSuggestions(false);
  }, []);

  const handleFieldChange = useCallback((newField: string) => {
    setField(newField);
    setValue('');
    setValueEnd('');
    setShowSuggestions(false);
  }, []);

  const handleAdd = useCallback(() => {
    const trimmed = value.trim();
    if (!isNullOp && !trimmed) return;
    if (!selectedLayer) return;
    if (isBetween && !valueEnd.trim()) return;

    const cond: SearchCondition = {
      id: nextId++,
      layerName: selectedLayer,
      field,
      operator,
      value: isNullOp ? '' : trimmed,
      ...(isBetween ? { valueEnd: valueEnd.trim() } : {}),
    };

    const existingIdx = conditionGroups.findIndex(
      (g) => g.layerName === selectedLayer
    );

    if (existingIdx >= 0) {
      const updated = [...conditionGroups];
      updated[existingIdx] = {
        ...updated[existingIdx],
        conditions: [...updated[existingIdx].conditions, cond],
      };
      onConditionGroupsChange(updated);
    } else {
      onConditionGroupsChange([
        ...conditionGroups,
        { layerName: selectedLayer, combineMode: 'AND', conditions: [cond] },
      ]);
    }

    setValue('');
    setValueEnd('');
    setShowSuggestions(false);
    valueRef.current?.focus();
  }, [
    selectedLayer, field, operator, value, valueEnd, isBetween,
    conditionGroups, onConditionGroupsChange,
  ]);

  const handleRemove = useCallback(
    (condId: number) => {
      const updated = conditionGroups
        .map((g) => ({
          ...g,
          conditions: g.conditions.filter((c) => c.id !== condId),
        }))
        .filter((g) => g.conditions.length > 0);
      onConditionGroupsChange(updated);
    },
    [conditionGroups, onConditionGroupsChange]
  );

  const handleClearAll = useCallback(() => {
    onConditionGroupsChange([]);
  }, [onConditionGroupsChange]);

  const handleGroupCombineChange = useCallback(
    (layerName: string, mode: 'AND' | 'OR') => {
      const updated = conditionGroups.map((g) =>
        g.layerName === layerName ? { ...g, combineMode: mode as 'AND' | 'OR' } : g
      );
      onConditionGroupsChange(updated);
    },
    [conditionGroups, onConditionGroupsChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    },
    [handleAdd]
  );

  const handleSuggestionClick = (val: string) => {
    setValue(val);
    setShowSuggestions(false);
    valueRef.current?.focus();
  };

  const handleInputFocus = () => {
    if (!currentIsDate && uniqueValues.length > 0) setShowSuggestions(true);
  };

  const handleInputBlur = () => {
    setTimeout(() => setShowSuggestions(false), 150);
  };

  const formatConditionLabel = (c: SearchCondition): string => {
    const f = c.field === '__any__' ? 'Any' : c.field;
    const op =
      SEARCH_OPERATORS.find((o) => o.value === c.operator)?.label ?? c.operator;
    if (c.operator === 'BETWEEN') {
      return `${f} ${op} ${c.value}–${c.valueEnd}`;
    }
    if (c.operator === 'IS_NULL' || c.operator === 'IS_NOT_NULL') {
      return `${f} ${op}`;
    }
    return `${f} ${op} ${c.value}`;
  };

  return (
    <div className="adv-search">
      {/* ---- Entry Row ---- */}
      <div className="adv-search__row">
        <select
          className="adv-search__select adv-search__layer-select"
          value={selectedLayer}
          onChange={(e) => handleLayerChange(e.target.value)}
          aria-label="Search layer"
        >
          {layerOptions.length === 0 && (
            <option value="">— no layers —</option>
          )}
          {layerOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          className="adv-search__select adv-search__field-select"
          value={field}
          onChange={(e) => handleFieldChange(e.target.value)}
          aria-label="Search field"
        >
          <option value="__any__">Any Field</option>
          {layerFields.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        <select
          className="adv-search__select adv-search__op-select"
          value={operator}
          onChange={(e) => setOperator(e.target.value as SearchOperator)}
          aria-label="Operator"
        >
          {SEARCH_OPERATORS.map((op) => (
            <option key={op.value} value={op.value}>
              {op.label}
            </option>
          ))}
        </select>

        {!isNullOp && (
          <div className="adv-search__values">
            <div
              className="filter-autocomplete-wrap"
              style={{ flex: 1, position: 'relative' }}
            >
              <input
                ref={valueRef}
                className="adv-search__input"
                type={inputType}
                placeholder={isBetween ? 'From…' : 'Value…'}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (!currentIsDate && uniqueValues.length > 0)
                    setShowSuggestions(true);
                }}
                onKeyDown={handleKeyDown}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                autoComplete="off"
                spellCheck={false}
              />
              {!currentIsDate &&
                showSuggestions &&
                filteredSuggestions.length > 0 &&
                suggestionsPos && (
                  <div
                    ref={suggestionsRef}
                    className="filter-suggestions open adv-search__suggestions"
                    style={{
                      position: 'fixed',
                      top: suggestionsPos.top,
                      left: suggestionsPos.left,
                      width: suggestionsPos.width,
                    }}
                  >
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
            {isBetween && (
              <div
                className="filter-autocomplete-wrap"
                style={{ flex: 1, position: 'relative' }}
              >
                <input
                  className="adv-search__input"
                  type={inputType}
                  placeholder="To…"
                  value={valueEnd}
                  onChange={(e) => setValueEnd(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            )}
          </div>
        )}

        <button
          className="adv-search__add-btn"
          onClick={handleAdd}
          title="Add search condition"
          aria-label="Add search condition"
          disabled={layerOptions.length === 0}
        >
          <span className="adv-search__add-icon">+</span>
          <span className="adv-search__add-label">Add</span>
        </button>
      </div>

      {/* ---- Date hint (inline) ---- */}
      {currentIsDate && (
        <div className="adv-search__date-hint">
          {isBetween ? 'Select a date range' : 'Select a date'}
        </div>
      )}

      {/* ---- Grouped Conditions (compact) ---- */}
      {conditionGroups.length > 0 && (
        <div className="adv-search__groups">
          {conditionGroups.map((group, gIdx) => (
            <div key={group.layerName} className="adv-search__layer-group">
              {gIdx > 0 && (
                <span className="adv-search__group-or">OR</span>
              )}
              <div className="adv-search__group-row">
                {/* Layer badge + AND/OR toggle inline */}
                <span className="adv-search__group-label">
                  {getLayerLabel(group.layerName)}
                </span>
                <select
                  className="adv-search__group-combine"
                  value={group.combineMode}
                  onChange={(e) =>
                    handleGroupCombineChange(
                      group.layerName,
                      e.target.value as 'AND' | 'OR'
                    )
                  }
                  aria-label={`Combine mode for ${getLayerLabel(group.layerName)}`}
                >
                  <option value="AND">AND</option>
                  <option value="OR">OR</option>
                </select>
                {/* Chips inline */}
                {group.conditions.map((c, idx) => (
                  <span key={c.id} className="adv-search__chip">
                    {idx > 0 && (
                      <span className="adv-search__combiner">
                        {group.combineMode}
                      </span>
                    )}
                    <span className="adv-search__chip-text">
                      {formatConditionLabel(c)}
                    </span>
                    <button
                      className="adv-search__chip-x"
                      onClick={() => handleRemove(c.id)}
                      aria-label={`Remove: ${formatConditionLabel(c)}`}
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
          <button className="adv-search__clear-all" onClick={handleClearAll}>
            Clear All
          </button>
        </div>
      )}

      {totalConditions === 0 && (
        <div className="adv-search__hint">
          Pick a layer &amp; field, then <strong>+ Add</strong>.
          Combine conditions across layers.
        </div>
      )}
    </div>
  );
}
