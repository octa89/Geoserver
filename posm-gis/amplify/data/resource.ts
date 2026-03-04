import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy } from 'aws-cdk-lib';
import type { Stack } from 'aws-cdk-lib';

/**
 * Create the single-table DynamoDB table for POSM GIS.
 *
 * Access patterns:
 *   PK=USER#{username}  SK=CONFIG#{workspace}  → user config CRUD
 *   PK=SHARE#{shareId}  SK=SHARE#{shareId}     → share snapshots (TTL auto-delete)
 */
export function createPosmTable(stack: Stack): dynamodb.Table {
  const table = new dynamodb.Table(stack, 'PosmGisTable', {
    tableName: 'posm-gis',
    partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
    sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    removalPolicy: RemovalPolicy.RETAIN,
    timeToLiveAttribute: 'ttl',
  });

  return table;
}
