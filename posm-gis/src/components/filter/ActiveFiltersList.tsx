/**
 * ActiveFiltersList — renders current active filters as removable chips.
 *
 * When more than one filter is present the combine mode (AND / OR) badge is
 * shown between chips so the user can see how they are joined.
 */

import type { FilterDef } from '../../types/layer';
import { formatFilterLabel } from './filterUtils';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ActiveFiltersListProps {
  filters: FilterDef[];
  onRemove: (index: number) => void;
  combineMode: 'AND' | 'OR';
}

// ---------------------------------------------------------------------------
// ActiveFiltersList
// ---------------------------------------------------------------------------

export function ActiveFiltersList({
  filters,
  onRemove,
  combineMode,
}: ActiveFiltersListProps) {
  if (filters.length === 0) {
    return (
      <p style={{ color: '#555', fontSize: 11, margin: '4px 0' }}>
        No active filters.
      </p>
    );
  }

  return (
    <div style={{ marginTop: 4 }}>
      {filters.map((filter, idx) => (
        <span key={idx} style={{ display: 'inline-flex', alignItems: 'center' }}>
          {/* Combine-mode badge between filters */}
          {idx > 0 && (
            <span
              style={{
                fontSize: 10,
                color: '#888',
                margin: '0 2px',
                userSelect: 'none',
              }}
            >
              {combineMode}
            </span>
          )}

          <span className="filter-chip">
            <span title={filter.cql}>{formatFilterLabel(filter)}</span>
            <button
              className="filter-chip-remove"
              onClick={() => onRemove(idx)}
              title="Remove filter"
              aria-label={`Remove filter: ${formatFilterLabel(filter)}`}
            >
              &times;
            </button>
          </span>
        </span>
      ))}
    </div>
  );
}
