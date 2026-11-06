// Strict Structured Outputs schema: unused action arguments are null.
export const planSchema = {
  type: 'object', additionalProperties: false,
  required: ['thought', 'result', 'action', 'riskLevel', 'riskReason', 'needsHumanTakeover', 'takeoverReason'],
  properties: {
    thought: { type: 'string', description: 'One concise progress caption.' },
    result: { type: 'string', description: 'Required final answer and observed outcome when action.type is complete. Quote any requested page value exactly. Empty string for other actions.' },
    action: {
      type: 'object', additionalProperties: false,
      required: ['type', 'url', 'selectorHint', 'text', 'key', 'x', 'y'],
      properties: {
        type: { type: 'string', enum: ['navigate', 'click', 'type', 'press', 'scroll', 'wait', 'complete'] },
        url: { type: ['string', 'null'] }, selectorHint: { type: ['string', 'null'] },
        text: { type: ['string', 'null'] }, key: { type: ['string', 'null'] },
        x: { type: ['number', 'null'] }, y: { type: ['number', 'null'] }
      }
    },
    riskLevel: { type: 'string', enum: ['LOW', 'HIGH'] },
    riskReason: { type: ['string', 'null'] },
    needsHumanTakeover: { type: 'boolean' },
    takeoverReason: { type: ['string', 'null'] }
  }
};
