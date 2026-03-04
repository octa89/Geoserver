export type SymbologyMode = 'unique' | 'graduated' | 'proportional' | 'rules';

export interface UniqueSymbology {
  mode: 'unique';
  field: string;
  valueColorMap: Record<string, string>;
  groupByYear?: boolean;
}

export interface GraduatedSymbology {
  mode: 'graduated';
  field: string;
  method: 'equalInterval' | 'quantile' | 'jenks';
  nClasses: number;
  ramp: string;
  breaks: number[];
  colors: string[];
}

export interface ProportionalSymbology {
  mode: 'proportional';
  field: string;
  minSize: number;
  maxSize: number;
  color?: string;
  minVal?: number;
  maxVal?: number;
}

export interface RuleSymbology {
  mode: 'rules';
  rules: RuleDef[];
  defaultColor: string;
}

export interface RuleDef {
  field: string;
  operator: string;
  value: string;
  color: string;
}

export type SymbologyConfig =
  | UniqueSymbology
  | GraduatedSymbology
  | ProportionalSymbology
  | RuleSymbology;
