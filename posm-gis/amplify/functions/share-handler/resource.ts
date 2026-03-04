import { defineFunction } from '@aws-amplify/backend';

export const shareHandler = defineFunction({
  name: 'posm-share-handler',
  entry: './handler.ts',
  timeoutSeconds: 10,
  memoryMB: 256,
});
