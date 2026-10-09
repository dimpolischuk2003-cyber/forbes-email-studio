export const metrics=['sent','delivered','uniqueOpened','uniqueClicked','unsubscribed','errors'] as const;
export type Metrics=Record<typeof metrics[number],number|null>;
export type Stats={metrics:Metrics;status:string|null;source:'api'|'csv';updatedAt:string};
export function normalizeStats(value:unknown):Metrics{const root=value&&typeof value==='object'?value as Record<string,unknown>:{};const nested=root.statistics||root.stats||root;const d=nested&&typeof nested==='object'?nested as Record<string,unknown>:{};return Object.fromEntries(metrics.map(k=>[k,typeof d[k]==='number'&&Number.isFinite(d[k])&&(d[k] as number)>=0?d[k]:null])) as Metrics;}
