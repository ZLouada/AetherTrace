/**
 * OpenTelemetry OTLP JSON (v1) Specification Types & Attribute Helpers
 */

export interface OtlpAnyValue {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: string | number;
  doubleValue?: number;
  arrayValue?: {
    values?: OtlpAnyValue[];
  };
  kvlistValue?: {
    values?: OtlpKeyValue[];
  };
}

export interface OtlpKeyValue {
  key: string;
  value: OtlpAnyValue;
}

export interface OtlpInstrumentationScope {
  name?: string;
  version?: string;
  attributes?: OtlpKeyValue[];
}

export interface OtlpResource {
  attributes?: OtlpKeyValue[];
  droppedAttributesCount?: number;
}

export interface OtlpSpanEvent {
  timeUnixNano: string | number;
  name: string;
  attributes?: OtlpKeyValue[];
  droppedAttributesCount?: number;
}

export interface OtlpSpanStatus {
  message?: string;
  code?: number; // 0: UNSET, 1: OK, 2: ERROR
}

export interface OtlpSpan {
  traceId: string;
  spanId: string;
  traceState?: string;
  parentSpanId?: string;
  name: string;
  kind?: number; // 0: UNSPECIFIED, 1: INTERNAL, 2: SERVER, 3: CLIENT, 4: PRODUCER, 5: CONSUMER
  startTimeUnixNano: string | number;
  endTimeUnixNano: string | number;
  attributes?: OtlpKeyValue[];
  droppedAttributesCount?: number;
  events?: OtlpSpanEvent[];
  droppedEventsCount?: number;
  status?: OtlpSpanStatus;
}

export interface OtlpScopeSpans {
  scope?: OtlpInstrumentationScope;
  spans?: OtlpSpan[];
  schemaUrl?: string;
}

export interface OtlpResourceSpans {
  resource?: OtlpResource;
  scopeSpans?: OtlpScopeSpans[];
  schemaUrl?: string;
}

export interface OtlpExportTraceServiceRequest {
  resourceSpans?: OtlpResourceSpans[];
}

/**
 * Converts an OtlpAnyValue to a native JavaScript primitive, array, or object.
 */
export function extractOtlpValue(val?: OtlpAnyValue): any {
  if (!val) return null;
  if (val.stringValue !== undefined) return val.stringValue;
  if (val.boolValue !== undefined) return val.boolValue;
  if (val.intValue !== undefined) return Number(val.intValue);
  if (val.doubleValue !== undefined) return val.doubleValue;
  if (val.arrayValue && Array.isArray(val.arrayValue.values)) {
    return val.arrayValue.values.map(extractOtlpValue);
  }
  if (val.kvlistValue && Array.isArray(val.kvlistValue.values)) {
    return otlpAttributesToRecord(val.kvlistValue.values);
  }
  return null;
}

/**
 * Converts a list of OtlpKeyValue pairs into a standard JavaScript object.
 */
export function otlpAttributesToRecord(attrs?: OtlpKeyValue[]): Record<string, any> {
  if (!Array.isArray(attrs)) return {};
  const record: Record<string, any> = {};
  for (const item of attrs) {
    if (item && item.key) {
      record[item.key] = extractOtlpValue(item.value);
    }
  }
  return record;
}

/**
 * Converts a native JavaScript value to an OtlpAnyValue.
 */
export function nativeToOtlpValue(val: any): OtlpAnyValue {
  if (val === null || val === undefined) {
    return { stringValue: '' };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (typeof val === 'boolean') {
    return { boolValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return { intValue: val.toString() };
    }
    return { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map(nativeToOtlpValue)
      }
    };
  }
  if (typeof val === 'object') {
    return {
      kvlistValue: {
        values: recordToOtlpAttributes(val)
      }
    };
  }
  return { stringValue: String(val) };
}

/**
 * Converts a JavaScript object into a list of OtlpKeyValue pairs.
 */
export function recordToOtlpAttributes(record: Record<string, any>): OtlpKeyValue[] {
  if (!record || typeof record !== 'object') return [];
  const entries: OtlpKeyValue[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      entries.push({
        key,
        value: nativeToOtlpValue(value)
      });
    }
  }
  return entries;
}
