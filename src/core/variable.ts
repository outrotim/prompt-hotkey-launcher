import { extractVariables, replaceVariables } from './parser';
import { saveVariableValue, getVariableHistory, getAllVariableHistory } from './history';
import { VariableHistory } from '../shared/types';

export interface VariableInfo {
  name: string;
  previousValues: string[];
  defaultValue: string;
}

/** Get variable info with history for a prompt content */
export function getVariableInfos(content: string): VariableInfo[] {
  const varNames = extractVariables(content);
  return varNames.map(name => {
    const previousValues = getVariableHistory(name);
    return {
      name,
      previousValues,
      defaultValue: previousValues[0] || '',
    };
  });
}

/** Fill variables and save history */
export function fillVariables(
  content: string,
  values: Record<string, string>
): string {
  for (const [name, value] of Object.entries(values)) {
    if (value.trim()) {
      saveVariableValue(name, value);
    }
  }
  return replaceVariables(content, values);
}

/** Export for renderer use */
export { extractVariables, replaceVariables, getAllVariableHistory };
