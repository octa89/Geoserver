import { defineFunction } from '@aws-amplify/backend';

export const configHandler = defineFunction({
  name: 'posm-config-handler',
  entry: './handler.ts',
  timeoutSeconds: 10,
  memoryMB: 256,
});
