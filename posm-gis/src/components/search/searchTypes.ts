export type SearchOperator =
  | 'CONTAINS'
  | '='
  | '!='
  | '>'
  | '<'
  | '>='
  | '<='
  | 'BETWEEN'
  | 'IS_NULL'
  | 'IS_NOT_NULL';

export interface SearchCondition {
  id: number;
  layerName?: string; // target layer (advanced mode); omitted = search all
  field: string | '__any__';
  operator: SearchOperator;
  value: string;
  valueEnd?: string; // only for BETWEEN
}

export interface ConditionGroup {
  layerName: string;
  combineMode: 'AND' | 'OR';
  conditions: SearchCondition[];
}

export const SEARCH_OPERATORS: { value: SearchOperator; label: string }[] = [
  { value: 'CONTAINS', label: 'Contains' },
  { value: '=', label: 'Equals' },
  { value: '!=', label: 'Not Equal' },
  { value: '>', label: 'Greater Than' },
  { value: '<', label: 'Less Than' },
  { value: '>=', label: '≥' },
  { value: '<=', label: '≤' },
  { value: 'BETWEEN', label: 'Between' },
  { value: 'IS_NULL', label: 'Is Null' },
  { value: 'IS_NOT_NULL', label: 'Is Not Null' },
];
