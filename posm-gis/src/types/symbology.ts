export type SymbologyMode = 'unique' | 'graduated' | 'proportional' | 'rules';

export interface UniqueSymbology {
  mode: 'unique';
  field: string;
  valueColorMap: Record<string, string>;
  valueOpacityMap?: Record<string, number>;
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
  opacities?: number[];
}

export interface ProportionalSymbology {
  mode: 'proportional';
  field: string;
  minSize: number;
  maxSize: number;
  color?: string;
  opacity?: number;
  minVal?: number;
  maxVal?: number;
}

export interface RuleSymbology {
  mode: 'rules';
  rules: RuleDef[];
  defaultColor: string;
  defaultOpacity?: number;
}

export interface RuleDef {
  field: string;
  operator: string;
  value: string;
  color: string;
  opacity?: number;
}

export type SymbologyConfig =
  | UniqueSymbology
  | GraduatedSymbology
  | ProportionalSymbology
  | RuleSymbology;
