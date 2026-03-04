/**
 * Pure utility functions for building and formatting CQL filter expressions.
 *
 * Matches the vanilla JS operator set: =, !=, >, <, >=, <=, CONTAINS,
 * LIKE, ILIKE, IS NULL, IS NOT NULL, BETWEEN.
 */

import type { FilterDef } from '../../types/layer';

// ---------------------------------------------------------------------------
// Supported operators (matches vanilla JS exactly)
// ---------------------------------------------------------------------------

export const FILTER_OPERATORS = [
  '=',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  'CONTAINS',
  'LIKE',
  'ILIKE',
  'IS NULL',
  'IS NOT NULL',
  'BETWEEN',
] as const;

export type FilterOperator = (typeof FILTER_OPERATORS)[number];

/** Operators that do not require a value input. */
export const NULL_OPERATORS: FilterOperator[] = ['IS NULL', 'IS NOT NULL'];

/** Operators whose value should be treated as numeric (no quoting). */
const NUMERIC_OPERATORS: FilterOperator[] = ['>', '<', '>=', '<='];

// ---------------------------------------------------------------------------
// buildSingleCql
// ---------------------------------------------------------------------------

/**
 * Build a single CQL expression string from field, operator, and value.
 *
 * Rules match the vanilla JS buildCql() exactly:
 * - IS NULL / IS NOT NULL: `field IS NULL`
 * - BETWEEN: `field >= 'from' AND field <= 'to'`
 * - CONTAINS: `field ILIKE '%value%'`
 * - LIKE / ILIKE: `field LIKE 'value'` (user provides their own wildcards)
 * - Date fields: always quote values
 * - Numeric values: unquoted
 * - String values: single-quoted
 */
export function buildSingleCql(
  field: string,
  operator: FilterOperator,
  value: string,
  valueEnd?: string,
  isDate?: boolean
): string {
  if (operator === 'IS NULL') return `${field} IS NULL`;
  if (operator === 'IS NOT NULL') return `${field} IS NOT NULL`;

  if (operator === 'BETWEEN') {
    if (!value || !valueEnd) return '';
    const safeFrom = value.replace(/'/g, "''");
    const safeTo = valueEnd.replace(/'/g, "''");
    return `${field} >= '${safeFrom}' AND ${field} <= '${safeTo}'`;
  }

  if (operator === 'CONTAINS') {
    const safe = value.replace(/'/g, "''");
    return `${field} ILIKE '%${safe}%'`;
  }

  if (operator === 'LIKE' || operator === 'ILIKE') {
    const safe = value.replace(/'/g, "''");
    return `${field} ${operator} '${safe}'`;
  }

  // Date fields are always quoted
  if (isDate) {
    const safe = value.replace(/'/g, "''");
    return `${field} ${operator} '${safe}'`;
  }

  // Numeric check for comparison operators
  if (NUMERIC_OPERATORS.includes(operator)) {
    const numVal = Number(value);
    if (!isNaN(numVal) && value.trim() !== '') {
      return `${field} ${operator} ${numVal}`;
    }
  }

  // Default: try numeric, else quote
  const numVal = Number(value);
  if (!isNaN(numVal) && value.trim() !== '') {
    return `${field} ${operator} ${numVal}`;
  }

  const safe = value.replace(/'/g, "''");
  return `${field} ${operator} '${safe}'`;
}

// ---------------------------------------------------------------------------
// buildCqlFilter
// ---------------------------------------------------------------------------

export function buildCqlFilter(
  filters: FilterDef[],
  mode: 'AND' | 'OR'
): string {
  if (filters.length === 0) return '';
  if (filters.length === 1) return filters[0].cql;
  return filters.map((f) => `(${f.cql})`).join(` ${mode} `);
}

// ---------------------------------------------------------------------------
// formatFilterLabel
// ---------------------------------------------------------------------------

export function formatFilterLabel(filter: FilterDef): string {
  return filter.label || filter.cql;
}

// ---------------------------------------------------------------------------
// makeFilterDef
// ---------------------------------------------------------------------------

export function makeFilterDef(
  field: string,
  operator: FilterOperator,
  value: string,
  valueEnd?: string,
  isDate?: boolean
): FilterDef {
  const cql = buildSingleCql(field, operator, value, valueEnd, isDate);

  let label: string;
  if (NULL_OPERATORS.includes(operator)) {
    label = `${field} ${operator}`;
  } else if (operator === 'BETWEEN') {
    label = `${field} BETWEEN ${value} AND ${valueEnd}`;
  } else if (operator === 'CONTAINS') {
    label = `${field} CONTAINS ${value}`;
  } else {
    label = `${field} ${operator} ${value}`;
  }

  return { cql, label };
}
